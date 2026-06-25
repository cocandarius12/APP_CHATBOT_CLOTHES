'use strict'
// Stratul 5 — scoring determinist al produselor. ZERO AI.
// quality_score (0-100) = gramaj(40, normalizat pe categorie) + brand tier(40) + stoc(20)
// value_score = quality_score / preț  -> „cel mai bun raport calitate/preț"
const T = require('./taxonomy')

// Tier brand 0..1 (40p). Necunoscut = 0.5. Editabil ușor aici.
const BRAND_TIERS = {
  'stanley/stella': 1, 'stedman': 0.8, 'russell': 0.85, 'b&c': 0.8, 'kariban': 0.7,
  'sols': 0.65, "sol's": 0.65, 'american apparel': 0.8, 'gildan': 0.45, 'fruit of the loom': 0.4,
  'jhk': 0.4, 'utt': 0.5, 'malfini': 0.6, 'neutral': 0.9, 'mantis': 0.7
}
function brandTier(brand) {
  const b = String(brand || '').toLowerCase().trim()
  if (BRAND_TIERS[b] != null) return BRAND_TIERS[b]
  for (const [k, v] of Object.entries(BRAND_TIERS)) { if (b.includes(k)) return v }
  return 0.5
}

function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') }
const GENDER_KEYS = {
  barbati: ['barbat', 'men', 'masculin'],
  femei: ['femei', 'dama', 'women', 'feminin'],
  unisex: ['unisex'],
  copii: ['copil', 'copii', 'kid']
}
function genderMatch(product, gender) {
  const gn = norm(gender)
  let keys = null
  for (const [k, arr] of Object.entries(GENDER_KEYS)) { if (gn.includes(k) || arr.some(a => gn.includes(a))) { keys = arr.concat(k); break } }
  if (!keys) return true
  const pg = norm(product.gender)
  return !pg || pg.includes('unisex') || keys.some(a => pg.includes(a))
}

function levelMatch(product, level, config) {
  if (!level) return true
  const lv = config.levels[level]
  if (!lv) return true
  return (product.base_cost || 0) <= lv.maxPrice
}

// Întoarce top recomandări pentru un criteriu, cu scoruri (pentru transparență/audit).
// Filtrele se RELAXEAZĂ dacă ar lăsa zero rezultate (categoria rămâne obligatorie).
function rank(products, criteria, config, topN = 3) {
  const { category, level, gender, subtype } = criteria || {}
  let pool = products.filter(p => p.base_cost != null && p.is_active !== false)
  if (category) pool = pool.filter(p => p.category === category)
  if (subtype) { const s = pool.filter(p => T.subtypeOf(p.name) === subtype); if (s.length) pool = s }
  if (gender) { const g = pool.filter(p => genderMatch(p, gender)); if (g.length) pool = g }
  if (level && config) { const l = pool.filter(p => levelMatch(p, level, config)); if (l.length) pool = l }
  if (!pool.length) return []

  // normalizare gramaj + stoc pe pool
  const gsmVals = pool.map(p => p.gsm_weight).filter(x => typeof x === 'number')
  const gsmMin = gsmVals.length ? Math.min(...gsmVals) : 0
  const gsmMax = gsmVals.length ? Math.max(...gsmVals) : 1
  const stockMax = Math.max(1, ...pool.map(p => p.available || 0))

  const scored = pool.map(p => {
    const gsmNorm = (typeof p.gsm_weight === 'number' && gsmMax > gsmMin)
      ? (p.gsm_weight - gsmMin) / (gsmMax - gsmMin) : 0.5
    const stockNorm = Math.min(1, (p.available || 0) / stockMax)
    const quality = +(gsmNorm * 40 + brandTier(p.brand) * 40 + stockNorm * 20).toFixed(1)
    const value = +(quality / Math.max(0.5, p.base_cost)).toFixed(2)
    return {
      id: p.id, name: p.name, brand: p.brand, category: p.category,
      base_cost: p.base_cost, currency: p.currency || 'RON',
      gsm_weight: p.gsm_weight, available: p.available,
      colors: p.colors, sizes: p.sizes,
      quality_score: quality, value_score: value,
      breakdown: { gsmNorm: +gsmNorm.toFixed(2), brandTier: brandTier(p.brand), stockNorm: +stockNorm.toFixed(2) }
    }
  })

  scored.sort((a, b) => b.value_score - a.value_score)
  return scored.slice(0, topN)
}

// Opțiuni reale disponibile pentru un context (tipuri, culori, mărimi).
// Folosit ca să oferim chips cu valori care chiar există (ex. culorile de blugi).
function options(products, criteria, config) {
  const { category, subtype, gender, level } = criteria || {}
  let pool = products.filter(p => p.base_cost != null && p.is_active !== false)
  if (category) pool = pool.filter(p => p.category === category)
  if (gender) { const g = pool.filter(p => genderMatch(p, gender)); if (g.length) pool = g }
  if (level && config) { const l = pool.filter(p => levelMatch(p, level, config)); if (l.length) pool = l }

  const subtypes = [...new Set(pool.map(p => T.subtypeOf(p.name)))]
    .sort((a, b) => (a === 'normal' ? -1 : b === 'normal' ? 1 : 0))

  let sp = pool
  if (subtype) { const s = pool.filter(p => T.subtypeOf(p.name) === subtype); if (s.length) sp = s }
  const colors = [...new Set(sp.flatMap(p => p.colors || []))]
  const sizes = [...new Set(sp.flatMap(p => p.sizes || []))]
  return { subtypes, colors, sizes }
}

module.exports = { rank, options, brandTier, BRAND_TIERS }
