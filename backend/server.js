'use strict'

const path = require('path')
const fs = require('fs')
const express = require('express')
const cors = require('cors')

// .env LOCAL — proiectul este de sine stătător (nu mai depinde de proiectul mamă).
require('dotenv').config({ path: path.join(__dirname, '.env') })

const { getProductTemplates, getSnapshotInfo } = require('./dataAdapter')

const app = express()
// Render injectează PORT; local folosim CHATBOT_BACKEND_PORT (din .env).
const PORT = process.env.PORT || process.env.CHATBOT_BACKEND_PORT || 3002

app.use(cors({ origin: process.env.CORS_ORIGIN || true }))
app.use(express.json({ limit: '10mb' }))

// Sursa unică de produse = snapshot-ul unificat (vezi dataAdapter.js)
function readProducts() {
  return getProductTemplates()
}

// ── Catalog ─────────────────────────────────────────────────────────────────

// GET /api/catalog/products — listare paginată
app.get('/api/catalog/products', (req, res) => {
  const { category, search, sort } = req.query
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(48, Math.max(1, parseInt(req.query.limit) || 24))

  let products = readProducts().filter(p => p.is_active !== false)

  if (category) products = products.filter(p => p.category === category)
  if (search) {
    const q = search.toLowerCase()
    products = products.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.brand || '').toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q)
    )
  }

  if (sort === 'price_asc') products.sort((a, b) => (a.base_cost || 0) - (b.base_cost || 0))
  else if (sort === 'price_desc') products.sort((a, b) => (b.base_cost || 0) - (a.base_cost || 0))
  else if (sort === 'name') products.sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const total = products.length
  const pages = Math.max(1, Math.ceil(total / limit))
  const start = (page - 1) * limit
  const sliced = products.slice(start, start + limit)
  const light = sliced.map(({ description, variants, ...rest }) => rest)

  res.json({ products: light, total, pages, page })
})

// GET /api/catalog/categories — categorii unice cu numărători
app.get('/api/catalog/categories', (req, res) => {
  const templates = readProducts().filter(p => p.is_active !== false)
  const counts = {}
  templates.forEach(p => { if (p.category) counts[p.category] = (counts[p.category] || 0) + 1 })
  const categories = Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
  res.json(categories)
})

// GET /api/catalog/products/:id
app.get('/api/catalog/products/:id', (req, res) => {
  const id = req.params.id
  const product = readProducts().find(p => p.id === id || p.sku === id || String(p.id) === String(id))
  if (!product) return res.status(404).json({ error: 'Not found' })
  res.json(product)
})

// ── Health / debug ──────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  const info = getSnapshotInfo()
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    snapshot: { path: info.snapshotPath, exists: info.exists, products: info.count }
  })
})

// GET pe endpoint-ul LLM — doar pentru a arăta cum se folosește în browser
app.get('/api/integrations/llm', (req, res) => {
  res.json({
    ok: false,
    method: 'POST',
    usage: `POST JSON { "prompt": "..." } la acest endpoint. Exemplu: curl -X POST http://localhost:${PORT}/api/integrations/llm -H 'Content-Type: application/json' -d '{"prompt":"Vreau 2 tricouri"}'`
  })
})

// ── Rezolvare produs + calcul preț (din snapshot) ─────────────────────────────

// Reduce numele tehnic al produsului la un "subtip" simplu, omenesc.
const SUBTYPES = [
  { label: 'polo', test: /polo/i },
  { label: 'maiou', test: /tank|sleeveless|maiou/i },
  { label: 'crop top', test: /crop/i },
  { label: 'V-neck', test: /v-?neck/i },
  { label: 'mânecă lungă', test: /long.?sleeve|mânec/i },
  { label: 'cu glugă', test: /hood/i },
  { label: 'fără glugă', test: /crew.?neck/i },
  { label: 'cu fermoar', test: /zip/i }
]
function subtypeOf(name) {
  const n = String(name || '')
  for (const s of SUBTYPES) { if (s.test.test(n)) return s.label }
  return 'normal'
}

// Sinonime RO -> categorii reale din baza de date (ordinea contează: polo înaintea tricou).
const CATEGORY_SYNONYMS = [
  { cat: 'Tricouri polo', words: ['polo'] },
  { cat: 'Tricouri', words: ['tricou', 'tricouri', 'tricos', 'tshirt'] },
  { cat: 'Hanorace și bluze', words: ['hanorac', 'hanorace', 'bluza', 'bluze', 'hoodie', 'sweatshirt'] },
  { cat: 'Pantaloni', words: ['blug', 'blugi', 'pantalon', 'pantaloni', 'jeans', 'jogger', 'joggeri', 'jogeri'] },
  { cat: 'Jachete softshell', words: ['softshell'] },
  { cat: 'Jachete polar', words: ['polar', 'fleece'] },
  { cat: 'Jachete și geci de vânt', words: ['geaca', 'geci', 'jacheta', 'jachete', 'windbreaker'] },
  { cat: 'Veste', words: ['vesta', 'veste'] },
  { cat: 'Cămăși și tricotaje', words: ['camasa', 'camasi', 'cămăși', 'tricotaj'] },
  { cat: 'Șepci', words: ['sapca', 'sepci', 'sapci', 'caciula'] },
  { cat: 'Genți', words: ['geanta', 'genti', 'rucsac', 'sacosa'] },
  { cat: 'Prosoape', words: ['prosop', 'prosoape'] },
  { cat: 'Îmbrăcăminte de lucru', words: ['lucru', 'salopeta', 'salopete'] },
  { cat: 'Îmbrăcăminte sport', words: ['sport', 'sportiv', 'trening', 'treninguri'] }
]

function queryToCategory(text) {
  const t = String(text || '').toLowerCase()
  for (const g of CATEGORY_SYNONYMS) {
    if (g.words.some(w => t.includes(w))) return g.cat
  }
  return null
}

// Detectează toate categoriile menționate în conversație (în ordine, fără duplicate).
function detectCategories(history) {
  const t = (history || [])
    .filter(m => m.role === 'user')
    .map(m => m.content).join(' ').toLowerCase()
  const out = []
  for (const g of CATEGORY_SYNONYMS) {
    if (g.words.some(w => t.includes(w)) && !out.includes(g.cat)) out.push(g.cat)
  }
  return out
}

// Găsește produsul potrivit pentru ce a cerut clientul (ex. "tricou polo", "blugi", "tricou normal").
function findProductForQuery(query) {
  const products = readProducts().filter(p => p.base_cost != null)
  const q = String(query || '').toLowerCase().trim()
  if (!q) return null
  const words = q.split(/\s+/).filter(w => w.length > 2)
  const targetCat = queryToCategory(q)
  if (!words.length && !targetCat) return null

  let best = null
  let bestScore = 0
  for (const p of products) {
    const name = (p.name || '').toLowerCase()
    const cat = (p.category || '').toLowerCase()
    const sub = subtypeOf(p.name).toLowerCase()
    let s = 0
    if (targetCat && p.category === targetCat) s += 4
    for (const w of words) {
      if (cat.includes(w)) s += 2
      if (name.includes(w)) s += 3
      if (sub.includes(w)) s += 3
      if ((w === 'normal' || w === 'normale' || w === 'clasic' || w === 'clasice' || w === 'simplu') && sub === 'normal') s += 3
    }
    if (sub === 'normal') s += 0.5
    if (s > bestScore) { bestScore = s; best = p }
  }
  return bestScore > 0 ? best : null
}

// Caută prețul exact al variantei alese (culoare + mărime), dacă există.
function findVariantPrice(prod, color, size) {
  if (!prod || !Array.isArray(prod.variants)) return null
  const c = String(color || '').toLowerCase().trim()
  const s = String(size || '').toLowerCase().trim()
  const v = prod.variants.find(x =>
    x.price_ron != null &&
    (!c || (x.color || '').toLowerCase().includes(c)) &&
    (!s || (x.size || '').toLowerCase() === s)
  )
  return v ? v.price_ron : null
}

// Construiește rezumatul comenzii cu prețuri reale (folosind culoarea/mărimea aleasă).
function buildSummary(items, budget) {
  const lines = []
  let total = 0
  for (const it of (items || [])) {
    const qty = Math.max(1, parseInt(it.quantity, 10) || 1)
    const prod = findProductForQuery(it.query || it.name || it.category)
    if (!prod) continue
    const unit = findVariantPrice(prod, it.color, it.size) ?? (prod.base_cost || 0)
    const lineTotal = unit * qty
    total += lineTotal
    lines.push({
      product_id: prod.id,
      name: prod.name,
      category: prod.category,
      color: it.color || null,
      size: it.size || null,
      quantity: qty,
      unit_price: Number(unit.toFixed(2)),
      total_price: Number(lineTotal.toFixed(2)),
      currency: prod.currency || 'RON'
    })
  }

  let text = 'Rezumat comandă:\n'
  for (const l of lines) {
    const attrs = [l.color, l.size].filter(Boolean).join(', ')
    text += `• ${l.quantity} x ${l.name}${attrs ? ' (' + attrs + ')' : ''} — ${l.unit_price} ${l.currency}/buc = ${l.total_price} ${l.currency}\n`
  }
  text += `Total estimat: ${Number(total.toFixed(2))} RON (fără taxe și fără personalizare).`
  if (budget != null && !isNaN(budget)) {
    text += total <= budget
      ? `\nSe încadrează în bugetul de ${budget} RON. ✅`
      : `\nDepășește bugetul de ${budget} RON cu ${Number((total - budget).toFixed(2))} RON.`
  }

  return { products: lines, total_price: Number(total.toFixed(2)), message: text }
}

// Lista scurtă de categorii, pentru a ghida modelul.
function topCategoriesText(limit = 12) {
  const counts = {}
  readProducts().forEach(p => { if (p.category) counts[p.category] = (counts[p.category] || 0) + 1 })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name)
    .join(', ')
}

// Detectează produsele relevante din ce a scris clientul, pentru a-i da AI-ului
// date reale (culori, mărimi, câmpuri) despre ele.
function findCandidates(history, limit = 2) {
  const userText = (history || [])
    .filter(m => m.role === 'user')
    .map(m => m.content).join(' ').toLowerCase()
  const tokens = userText.split(/[^a-z0-9ăâîșț]+/i).filter(w => w.length > 2)
  if (!tokens.length) return []

  const products = readProducts().filter(p => p.base_cost != null)
  function score(p) {
    let s = 0
    const name = (p.name || '').toLowerCase()
    const brand = (p.brand || '').toLowerCase()
    const cat = (p.category || '').toLowerCase()
    const sku = (p.sku || '').toLowerCase()
    for (const t of tokens) {
      if (sku === t) s += 10
      if (name.includes(t)) s += 3
      if (brand.includes(t)) s += 2
      if (cat.includes(t)) s += 2
    }
    return s
  }
  return products
    .map(p => ({ p, s: score(p) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => x.p)
}

// Bloc de "fapte" din baza de date, injectat în conversație.
// Acoperă TOATE categoriile menționate (ex. tricouri + pantaloni), cu termeni simpli.
function buildFacts(history) {
  const cats = detectCategories(history)
  if (!cats.length) return ''

  let txt = 'DATE REALE (enumeră opțiunile în paranteză cu termeni simpli; folosește DOAR ce e aici; NU inventa prețuri/tipuri/culori):\n'

  for (const cat of cats.slice(0, 2)) {
    const inCat = readProducts().filter(p => p.category === cat && p.base_cost != null)
    if (!inCat.length) continue

    // subtipuri simple
    const subs = []
    for (const p of inCat) { const s = subtypeOf(p.name); if (!subs.includes(s)) subs.push(s) }
    subs.sort((a, b) => (a === 'normal' ? -1 : b === 'normal' ? 1 : 0))

    // mărimi (uniune) + culori (de la produsul cel mai ieftin) + preț minim
    const sizes = [...new Set(inCat.flatMap(p => p.sizes || []))].slice(0, 12)
    const rep = inCat.reduce((a, b) => (a.base_cost <= b.base_cost ? a : b))
    const colors = (rep.colors || []).slice(0, 10)
    const priceMin = Math.min(...inCat.map(p => p.price_min).filter(x => x != null))

    txt += `\n${cat} (de la ${priceMin} RON):`
    txt += `\n  tipuri: ${subs.slice(0, 6).join(', ')}`
    if (sizes.length) txt += `\n  mărimi: ${sizes.join(', ')}`
    if (colors.length) txt += `\n  culori (exemple): ${colors.join(', ')}`
  }
  return txt
}

// ── LLM conversațional (Groq) ─────────────────────────────────────────────────

const SYSTEM_PROMPT = (categories) => `Ești consultant de vânzări pentru îmbrăcăminte personalizată. Pui întrebări scurte, una pe mesaj, în română.
Ordine: 1) ce tip de produs; 2) ce buget (RON) — apoi adaptează: propune ce/câte se încadrează după prețurile reale; 3) culoare și mărime; 4) confirmă cantitatea, personalizare sau dacă mai vrea ceva.
REGULI IMPORTANTE:
- Când întrebi despre tip, culoare sau mărime, ENUMERĂ în paranteză opțiunile reale din date, cu TERMENI SIMPLI. Ex: "Ce tip de tricou? (normal, polo, maiou)", "Ce mărime? (S, M, L, XL)", "Ce culoare? (White, Black, Navy)". NU enumera nume tehnice lungi de produs.
- În "query" pune categoria + subtipul ales (ex. "tricou polo", "tricou normal").
- Bugetul este pentru TOATĂ comanda, exact suma pe care o spune clientul. NU îl înmulți și NU îl modifica.
- "unul X și unul Y" înseamnă 1 bucată din X și 1 din Y. Cantitatea totală trebuie să fie exact cât a cerut clientul (ex. "2 tricouri, unul alb unul roz" = 1 alb + 1 roz).
- Nu cere brandul la început. Folosește DOAR datele reale din conversație; NU inventa prețuri, tipuri, culori sau mărimi. Dacă un produs nu apare în date, spune sincer că nu e în catalog și propune alternative din categoriile disponibile.
- Nu calcula tu totalul (îl face sistemul). Nu repeta același mesaj; mergi mereu mai departe cu următoarea întrebare concretă.
- NU anunța tranziții și nu trimite mesaje doar de confirmare (ex. „Trecem la șepci.", „Am înțeles."). Fiecare mesaj trebuie să conțină DIRECT următoarea întrebare concretă (sau rezumatul final). Ex: în loc de „Trecem la șepci", întreabă direct „Ce mărime pentru șepci? (...)".
- Tratează fiecare produs cerut separat (ex. tricou ȘI pantaloni): află tip, culoare, mărime și cantitate pentru fiecare.
- Dacă clientul confirmă (da / atât / gata / nu mai vreau nimic), finalizează: order_complete=true.
Categorii (valori scurte pt "query"): ${categories}.
Răspunde DOAR cu JSON: {"message":"...","items":[{"query":"tricou","quantity":1,"color":"White","size":"XL"}],"budget":100,"order_complete":false}`

app.post('/api/integrations/llm', async (req, res) => {
  const { prompt, messages, max_tokens, temperature } = req.body || {}
  const apiKey = process.env.GROQ_API_KEY

  // Istoricul conversației (preferat). Fallback: un singur prompt.
  const history = Array.isArray(messages) && messages.length
    ? messages
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map(m => ({ role: m.role, content: m.content }))
    : (prompt ? [{ role: 'user', content: String(prompt) }] : [])

  if (!history.length) {
    return res.json({ response: JSON.stringify({ status: 'asking', message: 'Cu ce te pot ajuta? Ce produs dorești?', products: [] }) })
  }

  // Fără cheie AI -> mesaj clar (conversația reală necesită AI).
  if (!apiKey) {
    return res.json({ response: JSON.stringify({
      status: 'asking',
      message: '⚠️ Modul AI nu este configurat. Adaugă GROQ_API_KEY în chatbot-standalone/backend/.env.',
      products: []
    }) })
  }

  try {
    const fetch = globalThis.fetch
    if (!fetch) {
      console.error('No global fetch available. Folosește Node >= 18.')
      return res.status(500).json({ error: 'Server fetch not available' })
    }

    // Faptele sunt compacte; le trimitem cât timp există un produs relevant,
    // ca botul să poată enumera opțiunile reale (tip/culoare/mărime) în paranteză.
    const facts = buildFacts(history)
    const systemMessages = [{ role: 'system', content: SYSTEM_PROMPT(topCategoriesText()) }]
    if (facts) systemMessages.push({ role: 'system', content: facts })

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: [
          ...systemMessages,
          ...history
        ],
        response_format: { type: 'json_object' },
        temperature: temperature ?? 0.5,
        max_tokens: max_tokens ?? 500
      })
    })

    if (!groqRes.ok) {
      const errBody = await groqRes.json().catch(() => ({}))
      console.error('Groq API error:', errBody)
      return res.status(502).json({ error: 'Eroare la serviciul AI', details: errBody })
    }

    const data = await groqRes.json()
    const content = data.choices?.[0]?.message?.content ?? '{}'

    let parsed = {}
    try { parsed = JSON.parse(content) } catch (_) { parsed = { message: content, order_complete: false } }

    // Dacă AI-ul consideră comanda finalizată -> calculăm prețul real din snapshot.
    if (parsed.order_complete && Array.isArray(parsed.items) && parsed.items.length) {
      const summary = buildSummary(parsed.items, parsed.budget)
      if (summary.products.length) {
        const finalMsg = (parsed.message ? parsed.message.trim() + '\n\n' : '') + summary.message
        return res.json({ response: JSON.stringify({
          status: 'summary',
          message: finalMsg,
          products: summary.products,
          total_price: summary.total_price
        }) })
      }
    }

    // Altfel -> mai punem întrebări.
    return res.json({ response: JSON.stringify({
      status: 'asking',
      message: parsed.message || 'Poți să-mi dai mai multe detalii?',
      products: []
    }) })
  } catch (err) {
    console.error('LLM request failed:', err)
    res.status(500).json({ error: 'Cererea AI a eșuat' })
  }
})

// ── Servește frontend-ul construit (producție: un singur serviciu) ────────────
const distPath = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  // orice rută care nu e /api -> index.html (SPA)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

const server = app.listen(PORT, () => {
  const info = getSnapshotInfo()
  console.log(`Chatbot backend pe http://localhost:${PORT}`)
  console.log(`Snapshot: ${info.snapshotPath} (${info.exists ? info.count + ' produse' : 'LIPSEȘTE — verifică UNIFIED_DATA_PATH în .env'})`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n⚠️  Portul ${PORT} este deja folosit (probabil un backend pornit anterior).`)
    console.error(`   Eliberează-l și repornește:`)
    console.error(`     lsof -ti tcp:${PORT} | xargs kill -9`)
    console.error(`   Sau schimbă CHATBOT_BACKEND_PORT în backend/.env (și VITE_BACKEND_URL în .env).\n`)
    process.exit(1)
  }
  throw err
})
