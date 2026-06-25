'use strict'
// Knowledge & Learning — file-based. Persistență locală, multi-tenant pe companyId.
// RAG lexical (token overlap) — fără embeddings externe; ușor de înlocuit ulterior.
const crypto = require('crypto')
const store = require('./store')

const KB = 'knowledge.jsonl'          // cunoștințe (conversații, oferte, comenzi, surse)
const EXAMPLES = 'examples.jsonl'      // exemple pentru training (approved/rejected/pending)
const SOURCES = 'sources.json'         // surse externe (fișiere) cu meta
const AUDIT = 'audit.jsonl'            // urme de generare

// ── util ──────────────────────────────────────────────────────────────────────
function tokens(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9ăâîșț]+/i).filter(w => w.length > 2)
}
function overlapScore(qTokens, docTokens) {
  if (!qTokens.length || !docTokens.length) return 0
  const set = new Set(docTokens)
  let hit = 0
  for (const t of qTokens) if (set.has(t)) hit++
  return hit / qTokens.length
}

// ── Knowledge records ──────────────────────────────────────────────────────────
function ingest(record) {
  const rec = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    company_id: record.company_id || 'default',
    type: record.type || 'conversation', // conversation | quote | order | correction | summary | source
    product_category: record.product_category || null,
    specs: record.specs || null,
    outcome: record.outcome || null,
    confidence: record.confidence != null ? record.confidence : null,
    corrections: record.corrections || null,
    text: record.text || '',
    source_id: record.source_id || null
  }
  store.appendJSONL(KB, rec)
  return rec
}

// RAG: caută cazuri/surse similare (izolat pe companie + cunoștințe globale de produs).
function retrieve(query, companyId = 'default', k = 4) {
  const qTokens = tokens(query)
  const recs = store.readJSONL(KB).filter(r => r.company_id === companyId || r.company_id === 'global')
  const scored = recs.map(r => ({ r, s: overlapScore(qTokens, tokens(r.text + ' ' + (r.product_category || ''))) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
  return scored.map(x => ({ ...x.r, _score: +x.s.toFixed(2) }))
}

// ── Surse externe (upload) ───────────────────────────────────────────────────────
// Suportă acum CSV / TXT / JSON. (Excel/PDF necesită o bibliotecă în plus — vezi README.)
function parseSource(filename, content) {
  const ext = (filename.split('.').pop() || '').toLowerCase()
  if (ext === 'json') {
    try { return JSON.stringify(JSON.parse(content)) } catch (_) { return content }
  }
  if (ext === 'csv' || ext === 'tsv') {
    return content.split(/\r?\n/).filter(Boolean).join(' | ')
  }
  return content // txt/md/altele
}

function addSource(meta, content) {
  const sources = store.readJSON(SOURCES, [])
  const id = crypto.randomUUID()
  const text = parseSource(meta.filename || 'file.txt', content || '')
  const src = {
    id, company_id: meta.company_id || 'default',
    filename: meta.filename || 'file.txt',
    kind: meta.kind || 'document', // catalog | pricing | policy | process | document
    active: true,
    chars: text.length,
    uploaded_at: new Date().toISOString()
  }
  sources.push(src)
  store.writeJSON(SOURCES, sources)
  // indexăm conținutul ca record de knowledge
  ingest({ company_id: src.company_id, type: 'source', text, source_id: id, product_category: meta.kind })
  return src
}
function listSources(companyId) {
  const s = store.readJSON(SOURCES, [])
  return companyId ? s.filter(x => x.company_id === companyId) : s
}
function toggleSource(id, active) {
  const s = store.readJSON(SOURCES, [])
  const i = s.findIndex(x => x.id === id)
  if (i !== -1) { s[i].active = !!active; store.writeJSON(SOURCES, s) }
  return s[i] || null
}
function deleteSource(id) {
  let s = store.readJSON(SOURCES, [])
  s = s.filter(x => x.id !== id)
  store.writeJSON(SOURCES, s)
  // scoatem și records-urile sursei
  const kb = store.readJSONL(KB).filter(r => r.source_id !== id)
  store.writeJSONL(KB, kb)
  return true
}

// ── Exemple pentru learning (human-in-the-loop) ──────────────────────────────────
function addExample(example) {
  const ex = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    company_id: example.company_id || 'default',
    status: example.status || 'pending', // pending | approved | rejected
    input: example.input || '',
    output: example.output || '',
    meta: example.meta || {}
  }
  store.appendJSONL(EXAMPLES, ex)
  return ex
}
function listExamples(status) {
  const all = store.readJSONL(EXAMPLES)
  return status ? all.filter(e => e.status === status) : all
}
function setExampleStatus(id, status) {
  const all = store.readJSONL(EXAMPLES)
  const i = all.findIndex(e => e.id === id)
  if (i !== -1) { all[i].status = status; all[i].reviewed_at = new Date().toISOString(); store.writeJSONL(EXAMPLES, all) }
  return all[i] || null
}
// Export DOAR exemplele aprobate, format JSONL pt. fine-tuning ulterior.
function exportApprovedJSONL() {
  const approved = listExamples('approved')
  return approved.map(e => JSON.stringify({
    messages: [
      { role: 'user', content: e.input },
      { role: 'assistant', content: e.output }
    ]
  })).join('\n')
}

// ── Audit ────────────────────────────────────────────────────────────────────────
function audit(entry) {
  store.appendJSONL(AUDIT, {
    id: crypto.randomUUID(), timestamp: new Date().toISOString(),
    company_id: entry.company_id || 'default',
    sources_used: entry.sources_used || [],
    examples_used: entry.examples_used || [],
    rules_applied: entry.rules_applied || [],
    output: entry.output || null
  })
}
function listAudit(limit = 100) {
  return store.readJSONL(AUDIT).slice(-limit).reverse()
}

module.exports = {
  ingest, retrieve,
  addSource, listSources, toggleSource, deleteSource,
  addExample, listExamples, setExampleStatus, exportApprovedJSONL,
  audit, listAudit
}
