'use strict'
// Draft de comandă (în lucru) per cartId — persistat pe fișier.
const store = require('./store')
const FILE = 'drafts.json'

function emptyDraft() {
  return { items: [], same: null, pers: {}, perItemPers: {}, activeItem: 0, offer: null }
}
function all() { return store.readJSON(FILE, {}) }
function get(id) { return all()[id] || emptyDraft() }
function save(id, draft) { const d = all(); d[id] = draft; store.writeJSON(FILE, d); return draft }
function clear(id) { const d = all(); delete d[id]; store.writeJSON(FILE, d) }

module.exports = { emptyDraft, get, save, clear }
