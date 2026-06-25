'use strict'
// Config personalizare: tehnici, poziții, termeni de execuție și prețuri.
// Editabil din panoul admin (persistat în store/personalization.json).
const store = require('./store')

// Prețuri pe TIER de cantitate: { maxQty, price }. Ultimul tier acoperă restul.
const DEFAULT_CONFIG = {
  currency: 'RON',
  techniques: {
    broderie: {
      label: 'Broderie', setup: 60, colorsRelevant: false, pricePerColor: 0,
      pricePerPosition: [{ maxQty: 10, price: 18 }, { maxQty: 50, price: 12 }, { maxQty: 200, price: 9 }, { maxQty: Infinity, price: 7 }],
      leadDays: [{ maxQty: 50, days: 7 }, { maxQty: 200, days: 10 }, { maxQty: Infinity, days: 14 }]
    },
    DTF: {
      label: 'DTF', setup: 25, colorsRelevant: false, pricePerColor: 0,
      pricePerPosition: [{ maxQty: 10, price: 12 }, { maxQty: 50, price: 8 }, { maxQty: 200, price: 6 }, { maxQty: Infinity, price: 4.5 }],
      leadDays: [{ maxQty: 100, days: 4 }, { maxQty: Infinity, days: 7 }]
    },
    DTG: {
      label: 'DTG', setup: 20, colorsRelevant: false, pricePerColor: 0,
      pricePerPosition: [{ maxQty: 10, price: 16 }, { maxQty: 50, price: 11 }, { maxQty: Infinity, price: 8 }],
      leadDays: [{ maxQty: 100, days: 5 }, { maxQty: Infinity, days: 8 }]
    },
    serigrafie: {
      label: 'Serigrafie', setup: 90, colorsRelevant: true, pricePerColor: 1.5,
      pricePerPosition: [{ maxQty: 50, price: 7 }, { maxQty: 200, price: 4 }, { maxQty: 500, price: 2.5 }, { maxQty: Infinity, price: 1.8 }],
      leadDays: [{ maxQty: 200, days: 8 }, { maxQty: Infinity, days: 12 }]
    },
    transfer: {
      label: 'Transfer', setup: 30, colorsRelevant: false, pricePerColor: 0,
      pricePerPosition: [{ maxQty: 50, price: 9 }, { maxQty: Infinity, price: 6 }],
      leadDays: [{ maxQty: Infinity, days: 6 }]
    },
    sublimare: {
      label: 'Sublimare', setup: 40, colorsRelevant: false, pricePerColor: 0,
      pricePerPosition: [{ maxQty: 50, price: 10 }, { maxQty: Infinity, price: 7 }],
      leadDays: [{ maxQty: Infinity, days: 9 }]
    }
  },
  positions: ['piept stânga', 'piept', 'spate', 'mânecă stânga', 'mânecă dreaptă', 'guler', 'etichetă'],
  levels: {
    economic: { label: 'Economic', maxPrice: 8 },
    standard: { label: 'Standard', maxPrice: 20 },
    premium: { label: 'Premium', maxPrice: Infinity }
  }
}

const FILE = 'personalization.json'

// Infinity nu se serializează în JSON -> îl stocăm ca null și-l reconvertim.
function reviveInfinity(obj) {
  if (Array.isArray(obj)) return obj.map(reviveInfinity)
  if (obj && typeof obj === 'object') {
    const o = {}
    for (const k of Object.keys(obj)) {
      if ((k === 'maxQty' || k === 'maxPrice') && obj[k] === null) o[k] = Infinity
      else o[k] = reviveInfinity(obj[k])
    }
    return o
  }
  return obj
}
function stripInfinity(obj) {
  if (Array.isArray(obj)) return obj.map(stripInfinity)
  if (obj && typeof obj === 'object') {
    const o = {}
    for (const k of Object.keys(obj)) {
      if ((k === 'maxQty' || k === 'maxPrice') && obj[k] === Infinity) o[k] = null
      else o[k] = stripInfinity(obj[k])
    }
    return o
  }
  return obj
}

function getConfig() {
  const saved = store.readJSON(FILE, null)
  if (!saved) return DEFAULT_CONFIG
  return reviveInfinity(saved)
}
function saveConfig(cfg) {
  store.writeJSON(FILE, stripInfinity(cfg))
  return getConfig()
}

module.exports = { DEFAULT_CONFIG, getConfig, saveConfig }
