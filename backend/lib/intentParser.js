'use strict'
// Stratul 1 — extragere pe regex din textul clientului. Zero AI, instant.
const T = require('./taxonomy')

function matchList(text, list) {
  const t = text.toLowerCase()
  for (const item of list) {
    if (item.words.some(w => t.includes(w))) return item.value
  }
  return null
}

function parseSubtype(text) {
  const t = String(text || '')
  for (const s of T.SUBTYPES) { if (s.test.test(t)) return s.label }
  if (/\b(normal|normale|simplu|simple|clasic|clasice|standard model)\b/i.test(t)) return 'normal'
  return null
}

function parsePersonalize(text) {
  const t = text.toLowerCase()
  if (/fara personaliz|fără personaliz|simplu|simple|blank|fara nimic|fără nimic|nepersonaliz|fara print|fără print|gol\b/.test(t)) return false
  if (/cu personaliz|personaliz|broderie|brodat|dtf|dtg|serigrafie|transfer|sublimare|imprim|cu print|cu logo/.test(t)) return true
  return null
}

function parseSizes(text) {
  const t = text.toLowerCase()
  if (/nu stiu|nu știu|nedisponibil|nu sunt (inca|încă)|stabilim ulterior|nu am marimi|nu am mărimi/.test(t)) return { unknown: true }
  // ex: "10M, 5L, 3XL" sau "marimi S M L" -> distribuție / listă
  const dist = {}
  const distRe = /(\d+)\s*(?:buc\.?\s*)?(?:de\s*)?(xs|s|m|l|xl|xxl|2xl|3xl|4xl|5xl)\b/gi
  let mm
  while ((mm = distRe.exec(text)) !== null) {
    dist[mm[2].toUpperCase()] = (dist[mm[2].toUpperCase()] || 0) + parseInt(mm[1], 10)
  }
  if (Object.keys(dist).length) return { distribution: dist, sizes: Object.keys(dist) }
  const sizes = []
  const sizeRe = /\b(xs|s|m|l|xl|xxl|2xl|3xl|4xl|5xl)\b/gi
  let s
  while ((s = sizeRe.exec(text)) !== null) {
    const v = s[1].toUpperCase()
    if (!sizes.includes(v)) sizes.push(v)
  }
  return sizes.length ? { sizes } : null
}

function parseColors(text) {
  const found = []
  for (const c of T.COLORS) { if (c.match.test(text) && !found.includes(c.value)) found.push(c.value) }
  return found.length ? found : null
}

function parsePositions(text) {
  const t = text.toLowerCase()
  const found = []
  for (const p of T.POSITIONS) {
    if (p.words.some(w => t.includes(w)) && !found.includes(p.value)) found.push(p.value)
  }
  return found.length ? found : null
}

function parseDesign(text) {
  const t = text.toLowerCase()
  if (/\b(nu am|nu exist|fara logo|fără logo|n-am)\b/.test(t)) return false
  if (/\b(am logo|am design|am fi[șs]ier|logo|design|vector|fi[șs]ier)\b/.test(t)) return true
  return null
}

function parseDeliveryDays(text) {
  const t = text.toLowerCase()
  if (/\burgent|cat mai repede|cât mai repede\b/.test(t)) return 3
  let m = t.match(/(\d+)\s*(zile|zi)\b/)
  if (m) return parseInt(m[1], 10)
  m = t.match(/(\d+)\s*(saptam|săptăm)/)
  if (m) return parseInt(m[1], 10) * 7
  return null
}

function parseBudget(text) {
  const t = text.toLowerCase()
  // "buget 60", "60 lei", "60 ron", "60 de lei", "per bucata 25"
  let m = t.match(/buget\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/)
  if (m) return { value: parseFloat(m[1].replace(',', '.')), per: 'total' }
  m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:de\s*)?(lei|ron|€|eur)\b.*(buc|bucat)/)
  if (m) return { value: parseFloat(m[1].replace(',', '.')), per: 'unit' }
  m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:de\s*)?(lei|ron|€|eur)\b/)
  if (m) return { value: parseFloat(m[1].replace(',', '.')), per: 'total' }
  return null
}

function parseQuantity(text) {
  // evită să confunde cantitatea cu prețul/mărimea: ia primul număr ce nu e urmat de lei/ron/zile
  const re = /(\d+)\s*(buc|bucat|bucăți|x)?/gi
  let m
  while ((m = re.exec(text)) !== null) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 8).toLowerCase()
    if (/lei|ron|eur|€|zile|zi|saptam|săptăm/.test(after)) continue
    return parseInt(m[1], 10)
  }
  return null
}

// Întoarce câmpurile extrase + confidence (0..1).
function parse(text) {
  const s = String(text || '')
  const fields = {
    category: T.queryToCategory(s),
    quantity: parseQuantity(s),
    gender: matchList(s, T.GENDERS),
    level: matchList(s, T.LEVELS),
    technique: matchList(s, T.TECHNIQUES),
    positions: parsePositions(s),
    colors: parseColors(s),
    sizes: parseSizes(s),
    design_exists: parseDesign(s),
    delivery_days: parseDeliveryDays(s),
    personalize: parsePersonalize(s),
    subtype: parseSubtype(s),
    budget: parseBudget(s)
  }

  // confidence: ponderi pe câmpurile importante
  let score = 0
  if (fields.category) score += 0.35
  if (fields.quantity) score += 0.30
  if (fields.technique) score += 0.10
  if (fields.colors) score += 0.08
  if (fields.sizes) score += 0.07
  if (fields.gender) score += 0.05
  if (fields.level) score += 0.05
  const confidence = Math.min(1, score)

  return { fields, confidence }
}

const WORDNUM = { un: 1, unu: 1, o: 1, una: 1, doi: 2, doua: 2, 'două': 2, trei: 3, patru: 4, cinci: 5, sase: 6, 'șase': 6, sapte: 7, 'șapte': 7, opt: 8, noua: 9, 'nouă': 9, zece: 10, douasprezece: 12, 'douăsprezece': 12, douazeci: 20, 'douăzeci': 20, cincizeci: 50, suta: 100, 'sută': 100 }
function numFromText(t) {
  const s = String(t || '').toLowerCase()
  const m = s.match(/(\d+)/)
  if (m) {
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 8)
    if (!/lei|ron|eur|€|zile|zi\b|saptam|săptăm/.test(after)) return parseInt(m[1], 10)
  }
  for (const [w, n] of Object.entries(WORDNUM)) { if (new RegExp('\\b' + w + '\\b', 'i').test(s)) return n }
  return null
}

// Extrage perechi articol+cantitate. Împarte mesajul pe separatoare
// (virgulă, „și", „plus", „/") și ia cantitatea din fiecare bucată.
// Ex: "tricouri 1, pantaloni 2" / "2 tricouri si 1 pereche de pantaloni".
function parseItems(text) {
  const t = String(text || '').toLowerCase()
  const clauses = t.split(/\s*(?:,|;|\bsi\b|\bși\b|\bplus\b|\band\b|\/| iar )\s*/i)
  const items = []
  for (const c of clauses) {
    const cat = T.queryToCategory(c)
    if (!cat || items.find(x => x.category === cat)) continue
    items.push({ category: cat, quantity: numFromText(c) })
  }
  return items
}

// Merge: regex câștigă pe câmpuri numerice; AI completează restul.
// Valorile goale (null / array gol) sunt ignorate, ca să nu suprascrie date bune.
function merge(regex, ai) {
  const isEmpty = v => v == null || (Array.isArray(v) && v.length === 0)
  const clean = o => {
    const r = {}
    for (const [k, v] of Object.entries(o || {})) if (!isEmpty(v)) r[k] = v
    return r
  }
  const a = clean(ai), r = clean(regex)
  const out = { ...a }
  for (const [k, v] of Object.entries(r)) {
    if (['quantity', 'budget', 'delivery_days', 'sizes'].includes(k)) out[k] = v
    else if (out[k] == null) out[k] = v
  }
  return out
}

module.exports = { parse, merge, parseItems }
