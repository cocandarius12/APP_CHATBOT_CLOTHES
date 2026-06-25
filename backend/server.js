'use strict'

const path = require('path')
const fs = require('fs')
const express = require('express')
const cors = require('cors')

require('dotenv').config({ path: path.join(__dirname, '.env') })

const { getProductTemplates, getSnapshotInfo } = require('./dataAdapter')
const intentParser = require('./lib/intentParser')
const questionEngine = require('./lib/questionEngine')
const catalogScorer = require('./lib/catalogScorer')
const budgetEngine = require('./lib/budgetEngine')
const cart = require('./lib/cart')
const draftStore = require('./lib/draft')
const knowledge = require('./lib/knowledge')
const personalization = require('./lib/personalization')

const app = express()
const PORT = process.env.PORT || process.env.CHATBOT_BACKEND_PORT || 3002

app.use(cors({ origin: process.env.CORS_ORIGIN || true }))
app.use(express.json({ limit: '15mb' }))

function readProducts() { return getProductTemplates() }

// ════════════════════════════════════════════════════════════════════════════
//  CATALOG
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/catalog/products', (req, res) => {
  const { category, search, sort } = req.query
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(48, Math.max(1, parseInt(req.query.limit) || 24))
  let products = readProducts().filter(p => p.is_active !== false)
  if (category) products = products.filter(p => p.category === category)
  if (search) {
    const q = search.toLowerCase()
    products = products.filter(p =>
      (p.name || '').toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q))
  }
  if (sort === 'price_asc') products.sort((a, b) => (a.base_cost || 0) - (b.base_cost || 0))
  else if (sort === 'price_desc') products.sort((a, b) => (b.base_cost || 0) - (a.base_cost || 0))
  else if (sort === 'name') products.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const total = products.length
  const pages = Math.max(1, Math.ceil(total / limit))
  const start = (page - 1) * limit
  const light = products.slice(start, start + limit).map(({ description, variants, ...rest }) => rest)
  res.json({ products: light, total, pages, page })
})

app.get('/api/catalog/categories', (req, res) => {
  const counts = {}
  readProducts().filter(p => p.is_active !== false).forEach(p => { if (p.category) counts[p.category] = (counts[p.category] || 0) + 1 })
  res.json(Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))
})

app.get('/api/catalog/products/:id', (req, res) => {
  const id = req.params.id
  const product = readProducts().find(p => p.id === id || p.sku === id || String(p.id) === String(id))
  if (!product) return res.status(404).json({ error: 'Not found' })
  res.json(product)
})

// ════════════════════════════════════════════════════════════════════════════
//  COȘ
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/cart', (req, res) => res.json({ cart: cart.get(req.query.cartId || 'default') }))
app.post('/api/cart', (req, res) => {
  const { cartId = 'default', item } = req.body || {}
  if (!item) return res.status(400).json({ error: 'item lipsă' })
  res.json({ cart: cart.add(cartId, item) })
})
app.delete('/api/cart', (req, res) => {
  const { cartId = 'default', id, index, clear } = { ...req.query, ...req.body }
  res.json({ cart: cart.remove(cartId, { id, index: index != null ? parseInt(index, 10) : undefined, clear: clear === true || clear === 'true' }) })
})

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN — personalizare
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/admin/personalization', (req, res) => res.json(personalization.getConfig()))
app.put('/api/admin/personalization', (req, res) => {
  try { res.json(personalization.saveConfig(req.body || {})) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ADMIN — knowledge / surse
app.get('/api/admin/knowledge/sources', (req, res) => res.json({ sources: knowledge.listSources(req.query.company_id) }))
app.post('/api/admin/knowledge/sources', (req, res) => {
  const { company_id, filename, kind, content } = req.body || {}
  if (!filename || content == null) return res.status(400).json({ error: 'filename și content sunt necesare' })
  res.json({ source: knowledge.addSource({ company_id, filename, kind }, content) })
})
app.patch('/api/admin/knowledge/sources/:id', (req, res) => res.json({ source: knowledge.toggleSource(req.params.id, req.body && req.body.active) }))
app.delete('/api/admin/knowledge/sources/:id', (req, res) => { knowledge.deleteSource(req.params.id); res.json({ ok: true }) })

// ADMIN — learning (human-in-the-loop)
app.get('/api/admin/learning', (req, res) => res.json({ examples: knowledge.listExamples(req.query.status) }))
app.post('/api/admin/learning/:id', (req, res) => res.json({ example: knowledge.setExampleStatus(req.params.id, (req.body && req.body.status) || 'approved') }))
app.get('/api/admin/learning/export', (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson')
  res.setHeader('Content-Disposition', 'attachment; filename="training.jsonl"')
  res.send(knowledge.exportApprovedJSONL())
})
app.get('/api/admin/audit', (req, res) => res.json({ audit: knowledge.listAudit(200) }))

app.get('/api/health', (req, res) => {
  const info = getSnapshotInfo()
  res.json({ status: 'ok', timestamp: new Date().toISOString(), snapshot: { source: info.source, products: info.count } })
})

// ════════════════════════════════════════════════════════════════════════════
//  AI (Groq) — DOAR limbaj: extragere intenție + formulare ofertă. Niciodată
//  alegerea produsului/culorii/prețului (acelea sunt deterministe).
// ════════════════════════════════════════════════════════════════════════════
async function groqJSON(systemPrompt, userContent, { temperature = 0.2, max_tokens = 500 } = {}) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey || !globalThis.fetch) return null
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
        response_format: { type: 'json_object' }, temperature, max_tokens
      })
    })
    if (!r.ok) return null
    const data = await r.json()
    return JSON.parse(data.choices?.[0]?.message?.content ?? '{}')
  } catch (_) { return null }
}

async function groqText(systemPrompt, userContent, { temperature = 0.4, max_tokens = 450 } = {}) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey || !globalThis.fetch) return null
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
        temperature, max_tokens
      })
    })
    if (!r.ok) return null
    const data = await r.json()
    return data.choices?.[0]?.message?.content ?? null
  } catch (_) { return null }
}

const EXTRACT_PROMPT = `Ești un extractor de date. Din mesajul clientului (română colocvială, eventual cu greșeli) extrage DOAR ce a spus EXPLICIT. NU inventa și NU completa valori lipsă.
Răspunde EXCLUSIV cu JSON:
{"category":null,"quantity":null,"gender":null,"level":null,"technique":null,"positions":[],"colors":[],"sizes":[],"design_exists":null,"delivery_days":null,"budget":null}
Folosește null pentru ce lipsește. "technique" ∈ broderie/DTF/DTG/serigrafie/transfer/sublimare. "level" ∈ economic/standard/premium.`

function buildOfferMessage(quote, recs, fields) {
  const cur = quote.currency
  let t = 'Ofertă estimativă\n'
  t += `Recomandare (cel mai bun raport calitate/preț): ${recs[0].name} — ${recs[0].brand || ''}\n`
  for (const l of quote.lines) {
    t += `${l.quantity} buc × ${l.name}: produs ${l.product_total} ${cur}`
    if (l.technique) t += ` + personalizare ${l.technique} ${l.personalization_total} ${cur} (${l.positions.length || 1} poziții)`
    t += `\n`
  }
  t += `Total estimat: ${quote.total} ${cur} (fără TVA).\n`
  t += `Termen estimat de execuție: ${quote.lead_days} zile lucrătoare.`
  if (recs.length > 1) t += `\nAlternative: ` + recs.slice(1).map(r => `${r.name} (${r.base_cost} ${cur})`).join(', ')
  return t
}

// ════════════════════════════════════════════════════════════════════════════
//  CHAT — pipeline determinist
// ════════════════════════════════════════════════════════════════════════════
function detectCartCommand(text) {
  const t = String(text || '').toLowerCase()
  if (/goleste|golește|sterge tot|șterge tot|sterge cosul|șterge coșul|reset/.test(t)) return { clear: true }
  if (/sterge|șterge|scoate|elimina|elimină/.test(t)) return { removeHint: true }
  return null
}
function isAffirmative(t) {
  const s = String(t || '').trim().toLowerCase()
  return /^(da|ok|okay|gata|perfect|sigur|confirm|confirmă|accept|de acord)\b/.test(s) ||
    /confirm|adaug.*co[șs]|pune.*co[șs]|accept.*ofert|trimite.*ofert/.test(s)
}
function isSame(t) { return /la fel|aceea[șs]i|acela[șs]i|identic|toate la fel/i.test(t) }
function isDifferent(t) { return /diferit|separat|fiecare|individual/i.test(t) }

app.post('/api/chat', async (req, res) => {
  try {
    const { messages = [], cartId = 'default', companyId = 'default' } = req.body || {}
    const history = Array.isArray(messages) ? messages.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') : []
    const lastUser = [...history].reverse().find(m => m.role === 'user')?.content || ''
    const config = personalization.getConfig()
    let currentCart = cart.get(cartId)
    // Conversație nouă (primul mesaj) -> resetăm orice draft vechi/incompatibil.
    if (history.filter(m => m.role === 'user').length <= 1) draftStore.clear(cartId)
    let draft = draftStore.get(cartId)

    const ask = (message, chips = {}) => {
      draftStore.save(cartId, draft)
      return res.json({ status: 'asking', message, chips, draft: { items: draft.items, same: draft.same }, cart: currentCart })
    }

    // A) CONFIRMARE ofertă -> adaugă în coș
    if (draft.offer && isAffirmative(lastUser)) {
      for (const l of draft.offer.lines) {
        cart.add(cartId, { product_id: l.product_id, name: l.name, category: l.category, quantity: l.quantity, unit_price: l.unit_price, technique: l.technique, positions: l.positions, color: l.color, size: l.size, currency: l.currency })
      }
      currentCart = cart.get(cartId)
      knowledge.audit({ company_id: companyId, rules_applied: ['confirm->cart'], output: { total: draft.offer.total } })
      draftStore.clear(cartId)
      return res.json({ status: 'cart', message: `Am adăugat oferta în coș: ${draft.offer.lines.length} articol(e), total ${draft.offer.total} ${draft.offer.currency}.`, chips: {}, cart: currentCart })
    }

    // B) Comenzi de coș (ștergere/golire)
    const cmd = detectCartCommand(lastUser)
    if (cmd && cmd.clear) {
      currentCart = cart.remove(cartId, { clear: true })
      return res.json({ status: 'cart', message: 'Am golit coșul.', chips: {}, cart: currentCart })
    }
    if (cmd && cmd.removeHint && currentCart.length) {
      const t = lastUser.toLowerCase()
      const target = currentCart.find(it => (it.name || '').toLowerCase().split(' ').some(w => w.length > 3 && t.includes(w)) || ((it.category || '').toLowerCase() && t.includes((it.category || '').toLowerCase().split(' ')[0])))
      if (target) {
        currentCart = cart.remove(cartId, { id: target.id })
        return res.json({ status: 'cart', message: `Am scos „${target.name}" din coș.`, chips: {}, cart: currentCart })
      }
    }

    // C) Parsare mesaj (regex + AI fallback DOAR când regex-ul nu prinde nimic relevant)
    const regex = intentParser.parse(lastUser)
    let delta = regex.fields
    const relevantKeys = ['category', 'quantity', 'gender', 'level', 'technique', 'positions', 'colors', 'sizes', 'design_exists', 'delivery_days', 'personalize', 'budget']
    const itemsFromMsg = intentParser.parseItems(lastUser)
    const hasField = itemsFromMsg.length > 0 || relevantKeys.some(k => {
      const v = regex.fields[k]
      return v != null && !(Array.isArray(v) && v.length === 0)
    })
    if (!hasField && lastUser.trim().length > 0) {
      const ai = await groqJSON(EXTRACT_PROMPT, lastUser, { temperature: 0.1, max_tokens: 300 })
      if (ai) delta = intentParser.merge(regex.fields, ai)
    }

    // helpers de completitudine (per categorie)
    const persOK = o => o && o.technique != null && Array.isArray(o.positions) && o.positions.length
    const productComplete = it => it.product.gender != null && it.product.level != null && it.product.subtype != null
    const uniformComplete = it => {
      const u = it.uniform
      if (u.sizes == null || u.color == null || u.personalize == null) return false
      if (u.personalize === true) return it.design_exists != null && persOK(u)
      return true
    }
    // La „diferite", fiecare bucată are propriile tip/gen/nivel/mărime/culoare/personalizare.
    const pieceComplete = (p, it) => {
      if (!p || p.gender == null || p.level == null || p.subtype == null || p.size == null || p.color == null || p.personalize == null) return false
      if (p.personalize === true) return it.design_exists != null && persOK(p)
      return true
    }
    const newPiece = () => ({ gender: null, level: null, subtype: null, size: null, color: null, personalize: null, technique: null, positions: null })
    const ensureShape = it => {
      if (!it.product) it.product = { gender: null, level: null, subtype: null }
      if (it.product.subtype === undefined) it.product.subtype = null
      if (!it.uniform) it.uniform = { sizes: null, color: null, personalize: null, technique: null, positions: null }
      if (!Array.isArray(it.pieces)) it.pieces = []
      if (it.design_exists === undefined) it.design_exists = null
      if (it.delivery_days === undefined) it.delivery_days = null
      if (it.split === undefined) it.split = null
      return it
    }
    const itemComplete = it => {
      ensureShape(it)
      if (!it.quantity) return false
      if (it.delivery_days == null) return false
      if (it.quantity > 1 && it.split === null) return false
      if (it.quantity === 1 || it.split === false) return productComplete(it) && uniformComplete(it)
      if (it.split === true) return it.pieces.length >= it.quantity && it.pieces.slice(0, it.quantity).every(p => pieceComplete(p, it))
      return false
    }
    const firstSize = s => s == null ? null : (Array.isArray(s.sizes) && s.sizes[0]) || (Array.isArray(s) && s[0]) || (s.unknown ? 'nespecificat' : null)

    // actualizează articolele (perechi categorie+cantitate)
    // Adăugăm produse NOI doar când e clar o cerere de produs (nu la răspunsuri
    // scurte gen „polo"/„M", care altfel ar fi confundate cu o categorie).
    const parsedItems = intentParser.parseItems(lastUser)
    const addIntent = !draft.items.length || parsedItems.length >= 2 ||
      parsedItems.some(p => p.quantity != null) ||
      /\b(vreau|doresc|as vrea|aș vrea|adaug|mai vreau|si\b|și\b|plus)\b/i.test(lastUser)
    for (const p of parsedItems) {
      const ex = draft.items.find(x => x.category === p.category)
      if (ex) { if (p.quantity) ex.quantity = p.quantity }
      else if (addIntent) draft.items.push(ensureShape({ category: p.category, quantity: p.quantity || null }))
    }
    if (!draft.items.length && delta.category) draft.items.push(ensureShape({ category: delta.category, quantity: delta.quantity || null }))
    if (draft.items.length === 1 && !draft.items[0].quantity && delta.quantity) draft.items[0].quantity = delta.quantity
    draft.items.forEach(ensureShape)

    if (!draft.items.length) return ask('Ce produse doriți?', { category: questionEngine.chipsFor('category', config) })

    const missingQty = draft.items.filter(it => !it.quantity)
    if (missingQty.length) {
      if (draft.items.length === 1) return ask(`Ce cantitate pentru ${draft.items[0].category}?`, { quantity: questionEngine.chipsFor('quantity', config) })
      const example = draft.items.map(i => `${i.category.toLowerCase().split(' ')[0]} 50`).join(', ')
      return ask(`Ce cantitate pentru fiecare? (${draft.items.map(i => i.category).join(', ')}). Ex: „${example}".`, {})
    }

    // aplică răspunsul curent la primul articol incomplet
    const products = readProducts()
    const multi = draft.items.length > 1
    const rawColorGeneric = Array.isArray(delta.colors) && delta.colors.length ? delta.colors[0] : null
    const matchFromAvail = (raw, avail) => {
      const r = String(raw || '').trim().toLowerCase()
      if (!r) return null
      // potrivire sigură: egalitate exactă, sau mesajul conține eticheta (nu invers,
      // ca „M" să nu se potrivească cu „maiou")
      return avail.find(x => x.toLowerCase() === r) || avail.find(x => x.length > 1 && r.includes(x.toLowerCase())) || null
    }
    const active = draft.items.find(it => !itemComplete(it))
    if (active) {
      if (delta.delivery_days != null) active.delivery_days = delta.delivery_days
      if (delta.design_exists != null) active.design_exists = delta.design_exists
      if (active.quantity > 1 && active.split === null) {
        if (isSame(lastUser)) active.split = false
        else if (isDifferent(lastUser)) active.split = true
      }
      if (active.quantity === 1 || active.split === false) {
        if (delta.gender) active.product.gender = delta.gender
        if (delta.level) active.product.level = delta.level
        if (active.product.subtype == null) {
          const subs = catalogScorer.options(products, { category: active.category, gender: active.product.gender, level: active.product.level }, config).subtypes
          active.product.subtype = delta.subtype || matchFromAvail(lastUser, subs)
        }
        const u = active.uniform
        if (delta.sizes) u.sizes = delta.sizes
        if (u.personalize == null) {
          if (delta.personalize != null) u.personalize = delta.personalize
          else if (delta.technique != null) u.personalize = true
        }
        if (delta.technique != null) u.technique = delta.technique
        if (delta.positions != null) u.positions = delta.positions
        if (u.color == null) {
          const avail = catalogScorer.options(products, { category: active.category, subtype: active.product.subtype, gender: active.product.gender, level: active.product.level }, config).colors
          const exact = avail.find(c => c.toLowerCase() === lastUser.trim().toLowerCase())
          if (exact) u.color = exact
          else if (rawColorGeneric) u.color = rawColorGeneric
        }
      } else if (active.split === true) {
        let idx = active.pieces.findIndex(p => !pieceComplete(p, active))
        if (idx === -1 && active.pieces.length < active.quantity) { active.pieces.push(newPiece()); idx = active.pieces.length - 1 }
        if (idx !== -1) {
          const pc = active.pieces[idx]
          if (delta.gender) pc.gender = delta.gender
          if (delta.level) pc.level = delta.level
          if (pc.subtype == null) {
            const subs = catalogScorer.options(products, { category: active.category, gender: pc.gender, level: pc.level }, config).subtypes
            pc.subtype = delta.subtype || matchFromAvail(lastUser, subs)
          }
          if (delta.sizes) pc.size = firstSize(delta.sizes)
          if (pc.color == null) {
            const avail = catalogScorer.options(products, { category: active.category, subtype: pc.subtype, gender: pc.gender, level: pc.level }, config).colors
            const exact = avail.find(c => c.toLowerCase() === lastUser.trim().toLowerCase())
            if (exact) pc.color = exact
            else if (rawColorGeneric) pc.color = rawColorGeneric
          }
          if (pc.personalize == null) {
            if (delta.personalize != null) pc.personalize = delta.personalize
            else if (delta.technique != null) pc.personalize = true
          }
          if (delta.technique != null) pc.technique = delta.technique
          if (delta.positions != null) pc.positions = delta.positions
        }
      }
    }

    // următoarea întrebare — split-ul se cere IMEDIAT (înainte de gen/nivel)
    for (const it of draft.items) {
      ensureShape(it)
      const prefix = multi ? `Pentru ${it.category}:` : ''
      if (it.quantity > 1 && it.split === null) {
        return ask(`Pentru cele ${it.quantity} ${it.category.toLowerCase()}: doriți toate identice, sau diferite (gen/culoare/personalizare pentru fiecare bucată)?`, { variante: ['Toate la fel', 'Diferite'] })
      }
      if (it.delivery_days == null) return ask(`${prefix} Termen de livrare?`.trim(), { delivery_days: questionEngine.chipsFor('delivery_days', config) })
      if (it.quantity === 1 || it.split === false) {
        const evModel = questionEngine.evaluateFields(it.product, questionEngine.MODEL_FIELDS, config, prefix)
        if (!evModel.complete) return ask(evModel.message, evModel.chips)
        const ctx = { category: it.category, gender: it.product.gender, level: it.product.level }
        if (it.product.subtype == null) {
          const subs = catalogScorer.options(products, ctx, config).subtypes
          return ask(`${prefix} Ce tip de ${it.category.toLowerCase()}?`.trim(), { subtype: subs.slice(0, 8) })
        }
        const opts = catalogScorer.options(products, { ...ctx, subtype: it.product.subtype }, config)
        const u = it.uniform
        if (u.sizes == null) return ask(`${prefix} Ce mărimi / distribuție?`.trim(), { sizes: [...opts.sizes.slice(0, 12), 'Nu știu încă'] })
        if (u.personalize == null) return ask(`${prefix} Personalizare sau produs simplu (fără print)?`.trim(), { personalize: questionEngine.chipsFor('personalize', config) })
        if (u.personalize === true) {
          if (it.design_exists == null) return ask(`${prefix} Aveți deja design/logo?`.trim(), { design_exists: questionEngine.chipsFor('design_exists', config) })
          const evP = questionEngine.evaluateFields(u, questionEngine.PERS_FIELDS, config, prefix)
          if (evP.chips && evP.chips.positions) evP.chips.positions = questionEngine.positionsFor(it.category, config)
          if (!evP.complete) return ask(evP.message, evP.chips)
        }
        if (u.color == null) return ask(`${prefix} Ce culoare?`.trim(), { color: opts.colors.length ? opts.colors.slice(0, 14) : questionEngine.chipsFor('color', config) })
      } else if (it.split === true) {
        let idx = it.pieces.findIndex(p => !pieceComplete(p, it))
        if (idx === -1 && it.pieces.length < it.quantity) { it.pieces.push(newPiece()); idx = it.pieces.length - 1 }
        if (idx !== -1) {
          const p = it.pieces[idx]
          const pp = `${it.category}, bucata ${idx + 1} din ${it.quantity}:`
          if (p.gender == null) return ask(`${pp} Pentru cine? (gen)`, { gender: questionEngine.chipsFor('gender', config) })
          if (p.level == null) return ask(`${pp} Ce nivel?`, { level: questionEngine.chipsFor('level', config) })
          const ctx = { category: it.category, gender: p.gender, level: p.level }
          if (p.subtype == null) {
            const subs = catalogScorer.options(products, ctx, config).subtypes
            return ask(`${pp} Ce tip de ${it.category.toLowerCase()}?`, { subtype: subs.slice(0, 8) })
          }
          const opts = catalogScorer.options(products, { ...ctx, subtype: p.subtype }, config)
          if (p.size == null) return ask(`${pp} Ce mărime?`, { sizes: opts.sizes.length ? opts.sizes.slice(0, 12) : ['S', 'M', 'L', 'XL', 'XXL'] })
          if (p.color == null) return ask(`${pp} Ce culoare?`, { color: opts.colors.length ? opts.colors.slice(0, 14) : questionEngine.chipsFor('color', config) })
          if (p.personalize == null) return ask(`${pp} Personalizare sau simplu?`, { personalize: questionEngine.chipsFor('personalize', config) })
          if (p.personalize === true) {
            if (it.design_exists == null) return ask(`${prefix} Aveți deja design/logo?`.trim(), { design_exists: questionEngine.chipsFor('design_exists', config) })
            const evP = questionEngine.evaluateFields(p, questionEngine.PERS_FIELDS, config, pp)
            if (evP.chips && evP.chips.positions) evP.chips.positions = questionEngine.positionsFor(it.category, config)
            if (!evP.complete) return ask(evP.message, evP.chips)
          }
        }
      }
    }

    // Toate complete -> ofertă (determinist)
    const lines = []
    const recommendationsPerItem = []
    let leadMax = 0
    for (const it of draft.items) {
      if (it.quantity === 1 || it.split === false) {
        const recs = catalogScorer.rank(products, { category: it.category, subtype: it.product.subtype, level: it.product.level, gender: it.product.gender }, config, 3)
        if (!recs.length) return ask(`Nu am găsit produse pentru „${it.category}". Alegeți altă categorie.`, {})
        const top = recs[0]
        recommendationsPerItem.push({ category: it.category, recommendations: recs })
        const u = it.uniform
        const tech = u.personalize === true ? u.technique : null
        const pos = u.personalize === true ? (u.positions || []) : []
        const q = budgetEngine.quote([{ product_id: top.id, name: top.name, base_cost: top.base_cost, currency: top.currency, quantity: it.quantity, technique: tech, positions: pos, colors: 1 }], { config })
        leadMax = Math.max(leadMax, q.lead_days)
        lines.push({ ...q.lines[0], category: top.category, color: u.color || null })
      } else {
        for (let j = 0; j < it.quantity; j++) {
          const pc = it.pieces[j]
          const recs = catalogScorer.rank(products, { category: it.category, subtype: pc.subtype, level: pc.level, gender: pc.gender }, config, 3)
          if (!recs.length) return ask(`Nu am găsit produse pentru „${it.category}". Alegeți altă categorie.`, {})
          const top = recs[0]
          if (j === 0) recommendationsPerItem.push({ category: it.category, recommendations: recs })
          const tech = pc.personalize === true ? pc.technique : null
          const pos = pc.personalize === true ? (pc.positions || []) : []
          const q = budgetEngine.quote([{ product_id: top.id, name: top.name, base_cost: top.base_cost, currency: top.currency, quantity: 1, technique: tech, positions: pos, colors: 1 }], { config })
          leadMax = Math.max(leadMax, q.lead_days)
          lines.push({ ...q.lines[0], category: top.category, color: pc.color || null, size: pc.size || null, gender: pc.gender || null })
        }
      }
    }
    const total = +(lines.reduce((s, l) => s + l.line_total, 0)).toFixed(2)
    const currency = lines[0]?.currency || 'RON'
    const offer = { lines, total, lead_days: leadMax, currency }
    draft.offer = offer
    draftStore.save(cartId, draft)

    let message = 'Ofertă estimativă:\n'
    for (const l of lines) {
      message += `${l.quantity} × ${l.name}${l.color ? ` (${l.color})` : ''}${l.technique ? ` · ${l.technique} (${(l.positions || []).length || 1} poziții)` : ''}: ${l.line_total} ${currency}\n`
    }
    message += `Total estimat: ${total} ${currency} (fără TVA). Termen execuție: ${leadMax} zile lucrătoare.\nConfirmați pentru a adăuga oferta în coș.`
    const similar = knowledge.retrieve(`${draft.items.map(i => i.category).join(' ')} ${lastUser}`, companyId, 3)
    const aiMsg = await groqText(
      'Ești consultant B2B textile. Reformulează oferta de mai jos clar și profesionist, în română, fără emoji, fără să schimbi cifrele. Încheie cu invitația de a confirma pentru adăugarea în coș. Maxim 8 rânduri.',
      `Date (NU modifica cifrele):\n${JSON.stringify(offer)}`, { temperature: 0.4, max_tokens: 400 })
    if (aiMsg && aiMsg.trim()) message = aiMsg.trim()

    knowledge.ingest({ company_id: companyId, type: 'quote', text: `${lastUser}\n${message}`, product_category: draft.items.map(i => i.category).join(','), specs: draft, outcome: offer, confidence: regex.confidence })
    knowledge.addExample({ company_id: companyId, status: 'pending', input: history.filter(m => m.role === 'user').map(m => m.content).join(' | '), output: message, meta: { total } })
    knowledge.audit({ company_id: companyId, sources_used: similar.map(s => s.source_id).filter(Boolean), rules_applied: ['intentParser', 'questionEngine', 'catalogScorer', 'budgetEngine'], output: { total } })

    return res.json({ status: 'offer', message, quote: offer, recommendations: recommendationsPerItem, confirm: true, cart: currentCart })
  } catch (err) {
    console.error('chat error:', err)
    res.status(500).json({ error: 'Eroare internă', detail: err.message })
  }
})

// ════════════════════════════════════════════════════════════════════════════
//  Frontend build (un singur serviciu)
// ════════════════════════════════════════════════════════════════════════════
const distPath = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

const server = app.listen(PORT, () => {
  const info = getSnapshotInfo()
  console.log(`Backend pe http://localhost:${PORT}`)
  console.log(`Date: ${info.source} (${info.count} produse)`)
})
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPortul ${PORT} e ocupat. Eliberează: lsof -ti tcp:${PORT} | xargs kill -9\n`)
    process.exit(1)
  }
  throw err
})
