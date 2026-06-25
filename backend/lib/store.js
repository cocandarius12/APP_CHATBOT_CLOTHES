'use strict'
// Store generic pe fișier (JSON + JSONL). Persistență locală.
const fs = require('fs')
const path = require('path')

const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'store')

function ensure() { fs.mkdirSync(DIR, { recursive: true }) }
function file(name) { return path.join(DIR, name) }

function readJSON(name, def) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')) } catch (_) { return def }
}
function writeJSON(name, data) {
  ensure(); fs.writeFileSync(file(name), JSON.stringify(data, null, 2))
}
function appendJSONL(name, obj) {
  ensure(); fs.appendFileSync(file(name), JSON.stringify(obj) + '\n')
}
function readJSONL(name) {
  try {
    return fs.readFileSync(file(name), 'utf8').split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l) } catch (_) { return null }
    }).filter(Boolean)
  } catch (_) { return [] }
}
function writeJSONL(name, arr) {
  ensure(); fs.writeFileSync(file(name), arr.map(o => JSON.stringify(o)).join('\n') + (arr.length ? '\n' : ''))
}

module.exports = { DIR, file, ensure, readJSON, writeJSON, appendJSONL, readJSONL, writeJSONL }
