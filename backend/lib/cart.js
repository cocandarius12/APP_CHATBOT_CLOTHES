'use strict'
// Coș permanent, persistat pe fișier (store/carts.json), pe cartId (companie/sesiune).
const crypto = require('crypto')
const store = require('./store')
const FILE = 'carts.json'

function all() { return store.readJSON(FILE, {}) }
function persist(data) { store.writeJSON(FILE, data) }

function get(cartId) {
  const data = all()
  return data[cartId] || []
}

function add(cartId, item) {
  const data = all()
  const list = data[cartId] || []
  const entry = {
    id: crypto.randomUUID(),
    product_id: item.product_id || item.id || null,
    name: item.name || 'Produs',
    category: item.category || null,
    quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
    unit_price: item.unit_price != null ? item.unit_price : (item.base_cost || 0),
    color: item.color || null,
    size: item.size || null,
    technique: item.technique || null,
    positions: item.positions || [],
    currency: item.currency || 'RON',
    added_at: new Date().toISOString()
  }
  list.push(entry)
  data[cartId] = list
  persist(data)
  return list
}

// Ștergere reală: după id, după index, sau golire totală.
function remove(cartId, { id, index, clear } = {}) {
  const data = all()
  let list = data[cartId] || []
  if (clear) {
    list = []
  } else if (id != null) {
    list = list.filter(it => it.id !== id)
  } else if (index != null && index >= 0 && index < list.length) {
    list.splice(index, 1)
  }
  data[cartId] = list
  persist(data)
  return list
}

function update(cartId, id, patch) {
  const data = all()
  const list = data[cartId] || []
  const idx = list.findIndex(it => it.id === id)
  if (idx !== -1) list[idx] = { ...list[idx], ...patch }
  data[cartId] = list
  persist(data)
  return list
}

module.exports = { get, add, remove, update }
