'use strict'
// Stratul 3 — motor de întrebări pe reguli. Cere TOATE câmpurile critice lipsă
// deodată, cu „chips" (sugestii). Conștient de coș.
const T = require('./taxonomy')

// Câmpuri CRITICE fără de care nu se generează ofertă.
const CRITICAL = [
  { key: 'category', label: 'Tip produs' },
  { key: 'quantity', label: 'Cantitate' },
  { key: 'level', label: 'Nivel/model (economic/standard/premium)' },
  { key: 'technique', label: 'Tip personalizare' },
  { key: 'positions', label: 'Pozițiile personalizării' },
  { key: 'design_exists', label: 'Design existent sau nu' },
  { key: 'delivery_days', label: 'Termen de livrare' }
]

function isEmpty(v) {
  return v == null || (Array.isArray(v) && v.length === 0)
}

function chipsFor(key, config) {
  switch (key) {
    case 'category':
      return ['tricou', 'tricou polo', 'hanorac', 'pantaloni', 'șapcă', 'geacă', 'vestă']
    case 'quantity':
      return ['10', '25', '50', '100', '250']
    case 'level':
      return Object.values(config.levels).map(l => l.label)
    case 'technique':
      return Object.values(config.techniques).map(t => t.label)
    case 'positions':
      return config.positions
    case 'design_exists':
      return ['Am logo/design', 'Nu am încă']
    case 'delivery_days':
      return ['Urgent (3 zile)', '7 zile', '14 zile', 'Flexibil']
    case 'color':
      return ['alb', 'negru', 'albastru', 'roșu', 'verde', 'gri', 'galben']
    case 'gender':
      return ['bărbați', 'femei', 'unisex', 'copii']
    case 'sizes':
      return ['S', 'M', 'L', 'XL', 'XXL', 'Nu știu încă']
    case 'personalize':
      return ['Cu personalizare', 'Fără personalizare']
    default:
      return []
  }
}

// Atribute de produs (per articol), întrebate mereu.
const PRODUCT_FIELDS = [
  { key: 'gender', label: 'Gen (bărbați/femei/unisex/copii)' },
  { key: 'level', label: 'Nivel (economic/standard/premium)' },
  { key: 'sizes', label: 'Mărimi / distribuție (sau „Nu știu încă")' }
]

// Atribute care definesc MODELUL (comune tuturor bucăților din categorie).
const MODEL_FIELDS = [
  { key: 'gender', label: 'Gen (bărbați/femei/unisex/copii)' },
  { key: 'level', label: 'Nivel (economic/standard/premium)' }
]

// Seturi de câmpuri folosite în fluxul per-categorie.
const SHARED_FIELDS = [
  { key: 'level', label: 'Nivel (economic/standard/premium)' },
  { key: 'design_exists', label: 'Design existent sau nu' },
  { key: 'delivery_days', label: 'Termen de livrare' }
]
const PERS_FIELDS = [
  { key: 'technique', label: 'Tip personalizare' },
  { key: 'positions', label: 'Pozițiile personalizării' }
]
const PIECE_FIELDS = [
  { key: 'technique', label: 'Tip personalizare' },
  { key: 'positions', label: 'Poziții' },
  { key: 'color', label: 'Culoare' }
]

// Poziții de personalizare relevante pe categorie (pantalonii n-au „mânecă").
const POSITIONS_BY_CATEGORY = {
  'Pantaloni': ['buzunar', 'picior', 'talie', 'spate'],
  'Șepci': ['față', 'lateral', 'spate'],
  'Genți': ['față', 'lateral', 'buzunar'],
  'Prosoape': ['colț', 'centru'],
  'Accesorii': ['față', 'centru']
}
function positionsFor(category, config) {
  return POSITIONS_BY_CATEGORY[category] || (config && config.positions) || ['piept', 'spate', 'mânecă', 'guler']
}

// Evaluator generic pe un set de câmpuri.
function evaluateFields(fields, defs, config, prefix) {
  const f = fields || {}
  const missing = defs.filter(d => isEmpty(f[d.key]))
  if (!missing.length) return { complete: true, missing: [], message: '', chips: {} }
  const chips = {}
  for (const m of missing) chips[m.key] = chipsFor(m.key, config)
  const labels = missing.map(m => m.label)
  const lead = prefix ? prefix + ' ' : ''
  const message = labels.length === 1
    ? `${lead}Mai am nevoie de: ${labels[0]}.`
    : `${lead}Mai am nevoie de: ` + labels.join('; ') + '.'
  return { complete: false, missing: missing.map(m => m.key), message, chips }
}

// fields = intenția acumulată; cart = produsele deja în coș.
function evaluate(fields, cart, config) {
  const f = fields || {}
  const cartHasProducts = Array.isArray(cart) && cart.length > 0

  // Dacă există deja produse în coș și clientul nu a pornit un produs nou,
  // considerăm produsul + cantitatea acoperite din coș.
  const satisfied = { ...f }
  if (cartHasProducts && isEmpty(f.category) && isEmpty(f.quantity)) {
    satisfied.category = cart[0].category || 'din coș'
    satisfied.quantity = cart.reduce((s, it) => s + (it.quantity || 0), 0) || cart.length
  }

  const missing = CRITICAL.filter(c => isEmpty(satisfied[c.key]))

  if (missing.length === 0) {
    return { complete: true, missing: [], message: '', chips: {} }
  }

  const chips = {}
  for (const m of missing) chips[m.key] = chipsFor(m.key, config)

  const labels = missing.map(m => m.label)
  let message
  if (labels.length === 1) {
    message = `Mai am nevoie de un detaliu pentru ofertă: ${labels[0]}.`
  } else {
    message = `Ca să-ți pregătesc oferta, mai am nevoie de: ` + labels.join('; ') + '.'
  }

  return { complete: false, missing: missing.map(m => m.key), message, chips }
}

// Doar câmpurile de PERSONALIZARE (produsul + cantitatea se tratează separat la comenzi multi-articol).
const PERS_CRITICAL = [
  { key: 'level', label: 'Nivel/model (economic/standard/premium)' },
  { key: 'technique', label: 'Tip personalizare' },
  { key: 'positions', label: 'Pozițiile personalizării' },
  { key: 'design_exists', label: 'Design existent sau nu' },
  { key: 'delivery_days', label: 'Termen de livrare' }
]

function evaluatePersonalization(pers, config, prefix) {
  const f = pers || {}
  const missing = PERS_CRITICAL.filter(c => isEmpty(f[c.key]))
  if (missing.length === 0) return { complete: true, missing: [], message: '', chips: {} }
  const chips = {}
  for (const m of missing) chips[m.key] = chipsFor(m.key, config)
  const labels = missing.map(m => m.label)
  const lead = prefix ? prefix + ' ' : ''
  const message = labels.length === 1
    ? `${lead}Mai am nevoie de: ${labels[0]}.`
    : `${lead}Mai am nevoie de: ` + labels.join('; ') + '.'
  return { complete: false, missing: missing.map(m => m.key), message, chips }
}

module.exports = {
  CRITICAL, PERS_CRITICAL, PRODUCT_FIELDS, MODEL_FIELDS, SHARED_FIELDS, PERS_FIELDS, PIECE_FIELDS,
  evaluate, evaluatePersonalization, evaluateFields, chipsFor, positionsFor
}
