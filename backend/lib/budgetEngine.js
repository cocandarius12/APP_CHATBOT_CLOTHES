'use strict'
// Stratul 4 — calcul pur. ZERO AI, zero latență.
const { getConfig } = require('./personalization')

function tierValue(tiers, qty, field) {
  for (const t of tiers) { if (qty <= t.maxQty) return t[field] }
  return tiers.length ? tiers[tiers.length - 1][field] : 0
}

// Calculează costul personalizării pentru o linie.
function personalizationCost(qty, technique, positions, colors, config) {
  const tech = config.techniques[technique] || config.techniques[(technique || '').toLowerCase()]
  if (!tech) return { perUnit: 0, setup: 0, total: 0, leadDays: 0, note: 'tehnică necunoscută' }
  const posCount = Math.max(1, (positions || []).length)
  const perPos = tierValue(tech.pricePerPosition, qty, 'price')
  let perUnit = perPos * posCount
  if (tech.colorsRelevant && colors) perUnit += (tech.pricePerColor || 0) * Math.max(1, colors) * posCount
  const total = perUnit * qty + (tech.setup || 0)
  const leadDays = tierValue(tech.leadDays, qty, 'days')
  return { perUnit: +perUnit.toFixed(2), setup: tech.setup || 0, total: +total.toFixed(2), leadDays, positions: posCount }
}

// items: [{ name, product_id, base_cost, quantity, technique, positions[], colors(num) }]
function quote(items, opts) {
  const config = (opts && opts.config) || getConfig()
  const lines = []
  let productTotal = 0
  let personalizationTotal = 0
  let leadDays = 0

  for (const it of (items || [])) {
    const qty = Math.max(1, parseInt(it.quantity, 10) || 1)
    const unit = +(it.base_cost || it.unit_price || 0)
    const prodTotal = +(unit * qty).toFixed(2)
    const pers = personalizationCost(qty, it.technique, it.positions, it.colors, config)
    productTotal += prodTotal
    personalizationTotal += pers.total
    leadDays = Math.max(leadDays, pers.leadDays)
    lines.push({
      product_id: it.product_id, name: it.name,
      quantity: qty, unit_price: +unit.toFixed(2), product_total: prodTotal,
      technique: it.technique || null, positions: it.positions || [],
      personalization_per_unit: pers.perUnit, personalization_setup: pers.setup,
      personalization_total: pers.total,
      line_total: +(prodTotal + pers.total).toFixed(2),
      currency: it.currency || config.currency || 'RON'
    })
  }

  const total = +(productTotal + personalizationTotal).toFixed(2)
  return {
    lines,
    product_total: +productTotal.toFixed(2),
    personalization_total: +personalizationTotal.toFixed(2),
    total,
    lead_days: leadDays,
    currency: config.currency || 'RON'
  }
}

module.exports = { quote, personalizationCost }
