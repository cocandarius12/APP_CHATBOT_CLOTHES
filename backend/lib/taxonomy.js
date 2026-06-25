'use strict'
// Taxonomie comună: categorii (sinonime RO), subtipuri, gen, tehnici, niveluri, culori.

const CATEGORY_SYNONYMS = [
  { cat: 'Tricouri polo', words: ['polo'] },
  { cat: 'Tricouri', words: ['tricou', 'tricouri', 'tricos', 'tshirt', 't-shirt'] },
  { cat: 'Hanorace și bluze', words: ['hanorac', 'hanorace', 'bluza', 'bluze', 'hoodie', 'sweatshirt'] },
  { cat: 'Pantaloni', words: ['blug', 'blugi', 'pantalon', 'pantaloni', 'jeans', 'jogger', 'joggeri', 'jogeri'] },
  { cat: 'Jachete softshell', words: ['softshell'] },
  { cat: 'Jachete polar', words: ['polar', 'fleece'] },
  { cat: 'Jachete și geci de vânt', words: ['geaca', 'geci', 'jacheta', 'jachete', 'windbreaker'] },
  { cat: 'Veste', words: ['vesta', 'veste'] },
  { cat: 'Cămăși și tricotaje', words: ['camasa', 'camasi', 'cămăși', 'tricotaj'] },
  { cat: 'Șepci', words: ['sapca', 'sepci', 'sapci', 'caciula', 'șapcă'] },
  { cat: 'Genți', words: ['geanta', 'genti', 'rucsac', 'sacosa'] },
  { cat: 'Prosoape', words: ['prosop', 'prosoape'] },
  { cat: 'Îmbrăcăminte de lucru', words: ['lucru', 'salopeta', 'salopete', 'protectie', 'protecție'] },
  { cat: 'Îmbrăcăminte sport', words: ['sport', 'sportiv', 'trening', 'treninguri'] }
]

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

const GENDERS = [
  { value: 'bărbați', words: ['barbat', 'bărbat', 'barbati', 'bărbați', 'men', "men's", 'masculin'] },
  { value: 'femei', words: ['femei', 'femeie', 'dama', 'damă', 'women', "women's", 'feminin'] },
  { value: 'unisex', words: ['unisex'] },
  { value: 'copii', words: ['copii', 'copil', 'kids', 'kid'] }
]

const TECHNIQUES = [
  { value: 'broderie', words: ['broderie', 'brodat', 'embroidery'] },
  { value: 'DTF', words: ['dtf'] },
  { value: 'DTG', words: ['dtg'] },
  { value: 'serigrafie', words: ['serigrafie', 'sita', 'sită', 'screen'] },
  { value: 'transfer', words: ['transfer'] },
  { value: 'sublimare', words: ['sublimare', 'sublimation'] }
]

const POSITIONS = [
  { value: 'piept stânga', words: ['piept stang', 'piept stâng', 'piept st'] },
  { value: 'piept', words: ['piept'] },
  { value: 'spate', words: ['spate', 'spatele', 'sezut', 'șezut'] },
  { value: 'mânecă stânga', words: ['maneca stanga', 'mânecă stângă'] },
  { value: 'mânecă dreaptă', words: ['maneca dreapta', 'mânecă dreaptă'] },
  { value: 'mânecă', words: ['maneca', 'mânecă', 'maneci'] },
  { value: 'guler', words: ['guler', 'gat', 'gât'] },
  { value: 'etichetă', words: ['eticheta', 'etichetă', 'label'] },
  { value: 'buzunar', words: ['buzunar', 'buzunare'] },
  { value: 'picior', words: ['picior', 'crac', 'craci', 'craci'] },
  { value: 'talie', words: ['talie', 'brau', 'brâu'] },
  { value: 'lateral', words: ['lateral', 'laterala', 'laterală'] },
  { value: 'față', words: ['fata', 'față', 'frontal'] },
  { value: 'colț', words: ['colt', 'colț'] },
  { value: 'centru', words: ['centru', 'mijloc'] }
]

const LEVELS = [
  { value: 'economic', words: ['economic', 'ieftin', 'buget redus', 'basic'] },
  { value: 'standard', words: ['standard', 'mediu', 'normal'] },
  { value: 'premium', words: ['premium', 'calitate', 'top', 'lux'] }
]

const COLORS = [
  { value: 'albastru', match: /\b(albastru|albastre|albastri|albaștri|navy|blue|bleumarin)\b/i },
  { value: 'alb', match: /\b(alb|alba|albă|albe|albi|albă|white)\b/i },
  { value: 'negru', match: /\b(negru|neagra|neagră|negre|negri|black)\b/i },
  { value: 'roșu', match: /\b(rosu|roșu|rosie|roșie|rosii|roșii|red)\b/i },
  { value: 'verde', match: /\b(verde|verzi|green)\b/i },
  { value: 'galben', match: /\b(galben|galbena|galbenă|galbene|galbeni|yellow)\b/i },
  { value: 'gri', match: /\b(gri|grey|gray|heather)\b/i },
  { value: 'roz', match: /\b(roz|pink)\b/i },
  { value: 'mov', match: /\b(mov|purple|violet)\b/i },
  { value: 'portocaliu', match: /\b(portocaliu|portocalie|portocalii|orange)\b/i },
  { value: 'maro', match: /\b(maro|brown)\b/i },
  { value: 'bej', match: /\b(bej|beige|sand|nisip)\b/i },
  { value: 'bleu', match: /\b(bleu|sky)\b/i }
]

function subtypeOf(name) {
  const n = String(name || '')
  for (const s of SUBTYPES) { if (s.test.test(n)) return s.label }
  return 'normal'
}

function queryToCategory(text) {
  const t = String(text || '').toLowerCase()
  for (const g of CATEGORY_SYNONYMS) {
    if (g.words.some(w => t.includes(w))) return g.cat
  }
  return null
}

function detectCategories(text) {
  const t = String(text || '').toLowerCase()
  const out = []
  for (const g of CATEGORY_SYNONYMS) {
    if (g.words.some(w => t.includes(w)) && !out.includes(g.cat)) out.push(g.cat)
  }
  return out
}

module.exports = {
  CATEGORY_SYNONYMS, SUBTYPES, GENDERS, TECHNIQUES, POSITIONS, LEVELS, COLORS,
  subtypeOf, queryToCategory, detectCategories
}
