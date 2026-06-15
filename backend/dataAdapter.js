'use strict'

/*
 * dataAdapter.js
 * ----------------------------------------------------------------------------
 * Sursa de date a chatbotului standalone este snapshot-ul unificat de la
 * furnizor (unified_data_snapshot.json). Acesta are altă structură decât cea
 * pe care o aștepta vechiul backend ({ productTemplates: [...] }), așa că aici
 * facem maparea (adaptarea) la forma simplă folosită de chatbot:
 *
 *   { id, sku, name, brand, category, base_cost, currency, is_active,
 *     description, image, colors, sizes, available }
 *
 * Structura snapshot-ului:
 *   {
 *     "<style>": {
 *       "style_data": { brand, category_ro, category_en, shortdesc_ro/en/hu,
 *                       longdesc_ro/en, imageurl, colors, sizes, ... },
 *       "variants": {
 *         "<variant-sku>": {
 *           "product_data": { sku, colorname, size, ... },
 *           "stock_data":   { price (EUR), calculated_price_ron, currency,
 *                             availableQuantity, ... }
 *         }
 *       }
 *     }
 *   }
 *
 * Cache: re-citim fișierul doar dacă i s-a schimbat mtime (snapshot mare).
 */

const fs = require('fs')
const path = require('path')

// Fișierul mic, pre-procesat (folosit în producție / online). Conține deja lista
// de produse gata transformată, ca să nu încărcăm snapshot-ul brut de sute de MB.
function resolveProductsJsonPath() {
  if (process.env.PRODUCTS_JSON && process.env.PRODUCTS_JSON.trim()) {
    return process.env.PRODUCTS_JSON.trim()
  }
  return path.join(__dirname, 'data', 'products.json')
}

// Calea către snapshot-ul BRUT — configurabilă din .env. Folosită doar local,
// pentru a regenera products.json (vezi buildProducts.js).
function resolveSnapshotPath() {
  if (process.env.UNIFIED_DATA_PATH && process.env.UNIFIED_DATA_PATH.trim()) {
    return process.env.UNIFIED_DATA_PATH.trim()
  }
  return path.join(
    process.env.HOME || '',
    'Downloads',
    'unified_data_snapshot',
    'unified_data_snapshot.json'
  )
}

let _cache = { mtimeMs: 0, path: '', products: [] }

function stripHtml(s) {
  if (!s || typeof s !== 'string') return ''
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-')
    .replace(/&rsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== '') return obj[k]
  }
  return null
}

// Transformă o intrare "style" din snapshot într-un produs cu toate câmpurile utile.
function styleToProduct(style, entry) {
  const sd = entry.style_data || {}
  const variants = entry.variants || {}
  const variantList = Object.values(variants)

  let basePriceRon = null
  let maxPriceRon = null
  let basePriceEur = null
  let totalAvailable = 0
  let minOrderQty = null
  const colorSet = new Set()
  const sizeSet = new Set()
  const rows = [] // matricea de variante (culoare/mărime/preț/stoc)

  for (const v of variantList) {
    const st = v.stock_data || {}
    const pd = v.product_data || {}
    const ron = typeof st.calculated_price_ron === 'number' ? st.calculated_price_ron : null
    const eur = typeof st.price === 'number' ? st.price : null
    if (ron != null) {
      if (basePriceRon == null || ron < basePriceRon) basePriceRon = ron
      if (maxPriceRon == null || ron > maxPriceRon) maxPriceRon = ron
    }
    if (eur != null && (basePriceEur == null || eur < basePriceEur)) basePriceEur = eur

    const stock = typeof st.availableQuantity === 'number' ? st.availableQuantity : 0
    totalAvailable += stock

    if (pd.minorderqty != null && (minOrderQty == null || pd.minorderqty < minOrderQty)) {
      minOrderQty = pd.minorderqty
    }

    const color = pick(st, ['color']) || pick(pd, ['colorname'])
    const size = pick(pd, ['size']) || pick(st, ['size'])
    if (color) colorSet.add(color)
    if (size) sizeSet.add(size)

    rows.push({
      sku: pick(pd, ['sku']) || pick(st, ['sku']) || null,
      color: color || null,
      colorhex: pick(pd, ['colorhex']) || null,
      size: size || null,
      price_ron: ron,
      price_eur: eur,
      stock
    })
  }

  const name = pick(sd, ['shortdesc_ro', 'shortdesc_en', 'shortdesc_hu']) || style
  const category = pick(sd, ['category_ro', 'category_en', 'category_hu']) || 'Diverse'
  const description = stripHtml(pick(sd, ['longdesc_ro', 'longdesc_en', 'longdesc_hu']))

  const baseCost = basePriceRon != null ? basePriceRon : basePriceEur
  const currency = basePriceRon != null ? 'RON' : (basePriceEur != null ? 'EUR' : null)

  return {
    id: style,
    sku: pick(sd, ['style']) || style,
    name,
    brand: pick(sd, ['brand']) || '',
    category,
    gender: pick(sd, ['gender_ro', 'gender_en', 'gender_hu']),
    fabric: pick(sd, ['fabric_ro', 'fabric_en', 'fabric_hu']),
    gsm_weight: sd.gsmweight != null ? sd.gsmweight : null,
    country_of_origin: pick(sd, ['coo']),
    min_order_qty: minOrderQty,
    base_cost: baseCost,
    price_min: basePriceRon,
    price_max: maxPriceRon,
    currency,
    is_active: totalAvailable > 0,
    available: totalAvailable,
    description,
    image: pick(sd, ['imageurl']) || null,
    colors: Array.from(colorSet),
    sizes: Array.from(sizeSet),
    variants: rows
  }
}

function buildProducts(raw) {
  const out = []
  for (const [style, entry] of Object.entries(raw || {})) {
    if (!entry || typeof entry !== 'object') continue
    try {
      out.push(styleToProduct(style, entry))
    } catch (e) {
      // ignoră intrările malformate, nu opri tot snapshot-ul
    }
  }
  return out
}

/**
 * Întoarce lista de produse, cu cache pe mtime.
 * 1) Preferă products.json (mic, pre-procesat) — folosit online.
 * 2) Dacă nu există, transformă snapshot-ul brut (local).
 * Dacă ambele lipsesc/corupte, întoarce [] (backend-ul nu crapă).
 */
function getProductTemplates() {
  // 1) products.json pre-procesat
  const pjPath = resolveProductsJsonPath()
  try {
    if (fs.existsSync(pjPath)) {
      const stat = fs.statSync(pjPath)
      if (_cache.path === pjPath && _cache.mtimeMs === stat.mtimeMs) return _cache.products
      const arr = JSON.parse(fs.readFileSync(pjPath, 'utf8'))
      if (Array.isArray(arr)) {
        _cache = { mtimeMs: stat.mtimeMs, path: pjPath, products: arr }
        return arr
      }
    }
  } catch (e) {
    console.error(`[dataAdapter] products.json invalid la "${pjPath}":`, e.message)
  }

  // 2) fallback: snapshot brut (transformat)
  const snapshotPath = resolveSnapshotPath()
  try {
    const stat = fs.statSync(snapshotPath)
    if (_cache.path === snapshotPath && _cache.mtimeMs === stat.mtimeMs) return _cache.products
    const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
    const products = buildProducts(raw)
    _cache = { mtimeMs: stat.mtimeMs, path: snapshotPath, products }
    return products
  } catch (e) {
    console.error(`[dataAdapter] Nu pot citi datele (nici products.json, nici snapshot):`, e.message)
    return _cache.products && _cache.products.length ? _cache.products : []
  }
}

// Regenerează products.json din snapshot-ul brut (rulat local de buildProducts.js).
function generateProductsFile(outPath) {
  const snapshotPath = resolveSnapshotPath()
  const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
  const products = buildProducts(raw)
  const dest = outPath || resolveProductsJsonPath()
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, JSON.stringify(products))
  return { dest, count: products.length, source: snapshotPath }
}

function getSnapshotInfo() {
  const productsJson = resolveProductsJsonPath()
  const usingPrecomputed = fs.existsSync(productsJson)
  let count = 0
  try { count = getProductTemplates().length } catch (_) { /* noop */ }
  return {
    snapshotPath: usingPrecomputed ? productsJson : resolveSnapshotPath(),
    exists: usingPrecomputed || fs.existsSync(resolveSnapshotPath()),
    source: usingPrecomputed ? 'products.json' : 'snapshot',
    count
  }
}

module.exports = { getProductTemplates, getSnapshotInfo, resolveSnapshotPath, generateProductsFile }
