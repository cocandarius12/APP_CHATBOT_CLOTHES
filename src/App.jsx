import React, { useState, useRef, useEffect, useCallback } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || ''
const api = (p, opts) => fetch(`${BACKEND}${p}`, opts).then(r => r.json())

function getId(key) {
  let v = localStorage.getItem(key)
  if (!v) { v = key + '-' + Math.random().toString(36).slice(2, 9); localStorage.setItem(key, v) }
  return v
}
const CART_ID = getId('cartId')
const COMPANY_ID = 'default'
const money = (n, c = 'RON') => `${Number(n ?? 0).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} ${c}`

export default function App() {
  const [tab, setTab] = useState('chat')
  const [cart, setCart] = useState([])

  const refreshCart = useCallback(async () => {
    const r = await api(`/api/cart?cartId=${CART_ID}`)
    setCart(r.cart || [])
  }, [])
  useEffect(() => { refreshCart() }, [refreshCart])

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">Textil<span>asistent ofertare</span></div>
        <div className="tabs">
          <button className={`tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>Asistent</button>
          <button className={`tab ${tab === 'admin' ? 'active' : ''}`} onClick={() => setTab('admin')}>Administrare</button>
        </div>
      </div>

      {tab === 'chat' ? (
        <div className="layout">
          <div className="col"><Chat cart={cart} setCart={setCart} refreshCart={refreshCart} /></div>
          <div className="col aside"><CartAside cart={cart} refreshCart={refreshCart} /></div>
        </div>
      ) : (
        <div className="layout full"><div className="col"><Admin /></div></div>
      )}
    </div>
  )
}

/* ───────────────────────── Chat ───────────────────────── */
function Chat({ cart, setCart, refreshCart }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Bună ziua. Descrieți comanda dorită (tip produs, cantitate, personalizare) și pregătesc o ofertă.' }
  ])
  const [input, setInput] = useState('')
  const [chips, setChips] = useState({})
  const [offer, setOffer] = useState(null)
  const [fields, setFields] = useState({})
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, offer, loading])

  async function send(text) {
    const t = (text ?? input).trim()
    if (!t || loading) return
    const next = [...messages, { role: 'user', content: t }]
    setMessages(next); setInput(''); setChips({}); setLoading(true)
    try {
      const r = await api('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.filter(m => m.role === 'user' || m.role === 'assistant'), cartId: CART_ID, companyId: COMPANY_ID })
      })
      setMessages(m => [...m, { role: 'assistant', content: r.message || '—' }])
      setChips(r.chips || {})
      setFields(r.fields || {})
      setOffer(r.status === 'offer' ? { recommendations: r.recommendations, quote: r.quote } : null)
      if (r.cart) setCart(r.cart)
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: 'Eroare de comunicare cu serverul.' }])
    } finally { setLoading(false) }
  }

  return (
    <div className="chat">
      <div className="stream">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="who">{m.role === 'user' ? 'Dvs.' : 'Asistent'}</div>
            <div className="bubble">{m.content}</div>
          </div>
        ))}

        {Object.keys(chips).length > 0 && (
          <div className="chips">
            {Object.entries(chips).map(([key, opts]) => (
              <div className="chipgroup" key={key}>
                <div className="lbl">{labelFor(key)}</div>
                <div className="chiprow">
                  {opts.map(o => <button key={o} className="chip" onClick={() => send(o)}>{o}</button>)}
                </div>
              </div>
            ))}
          </div>
        )}

        {offer && offer.quote && (
          <div className="offer">
            <div className="ohead"><span>Ofertă estimativă</span><span className="muted">{offer.quote.lead_days} zile execuție</span></div>
            <table className="qtable"><tbody>
              {offer.quote.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.quantity} × {l.name}{l.technique ? ` · ${l.technique} (${(l.positions || []).length || 1} poz.)` : ''}</td>
                  <td style={{ textAlign: 'right' }}>{money(l.line_total, l.currency)}</td>
                </tr>
              ))}
              <tr><td>Total estimat (fără TVA)</td><td style={{ textAlign: 'right' }}>{money(offer.quote.total, offer.quote.currency)}</td></tr>
            </tbody></table>
            {Array.isArray(offer.recommendations) && offer.recommendations.some(g => g.recommendations?.length > 1) && (
              <div style={{ padding: '8px 14px', fontSize: 12 }} className="muted">
                Alternative: {offer.recommendations.map(g => `${g.category}: ${g.recommendations.slice(1, 3).map(r => r.name).join(', ') || '—'}`).join(' | ')}
              </div>
            )}
            <div className="qfoot">
              <span className="muted">Confirmați pentru a adăuga oferta în coș</span>
              <button className="btn" onClick={() => send('Confirmă și adaugă în coș')}>Confirmă și adaugă în coș</button>
            </div>
          </div>
        )}

        {loading && <div className="msg assistant"><div className="who">Asistent</div><div className="bubble muted">Se procesează…</div></div>}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Descrieți comanda…"
          enterKeyHint="send" onKeyDown={e => { if (e.key === 'Enter') send() }} />
        <button className="btn" onClick={() => send()} disabled={loading || !input.trim()}>Trimite</button>
      </div>
    </div>
  )
}

function labelFor(key) {
  return ({ category: 'Tip produs', quantity: 'Cantitate', level: 'Nivel', technique: 'Personalizare',
    positions: 'Poziții', design_exists: 'Design', delivery_days: 'Termen livrare',
    color: 'Culoare', variante: 'Opțiune', gender: 'Gen', sizes: 'Mărimi', personalize: 'Personalizare', subtype: 'Tip' })[key] || key
}

/* ───────────────────────── Coș ───────────────────────── */
function CartAside({ cart, refreshCart }) {
  async function remove(id) {
    await api('/api/cart', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cartId: CART_ID, id }) })
    refreshCart()
  }
  async function clear() {
    await api('/api/cart', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cartId: CART_ID, clear: true }) })
    refreshCart()
  }
  const total = cart.reduce((s, it) => s + (it.unit_price || 0) * (it.quantity || 1), 0)
  const cur = cart[0]?.currency || 'RON'

  return (
    <>
      <div className="ahead"><span>Coș ({cart.length})</span>{cart.length > 0 && <button className="btn ghost sm" onClick={clear}>Golește</button>}</div>
      <div className="cart-items">
        {cart.length === 0 && <div className="empty">Coșul este gol. Produsele confirmate din ofertă apar aici.</div>}
        {cart.map(it => (
          <div className="citem" key={it.id}>
            <div className="top">
              <div className="nm">{it.name}</div>
              <button className="btn danger sm" onClick={() => remove(it.id)}>Șterge</button>
            </div>
            <div className="sub">
              {it.quantity} buc × {money(it.unit_price, it.currency)}
              {it.technique ? ` · ${it.technique}` : ''}{it.positions?.length ? ` · ${it.positions.join(', ')}` : ''}
            </div>
          </div>
        ))}
      </div>
      {cart.length > 0 && (
        <div className="cart-foot">
          <div className="row muted"><span>Produse</span><span>{cart.length} linii</span></div>
          <div className="row grand"><span>Subtotal produse</span><span>{money(total, cur)}</span></div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Personalizarea se calculează în ofertă.</div>
        </div>
      )}
    </>
  )
}

/* ───────────────────────── Admin ───────────────────────── */
function Admin() {
  const [cfg, setCfg] = useState(null)
  const [sources, setSources] = useState([])
  const [examples, setExamples] = useState([])
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setCfg(await api('/api/admin/personalization'))
    setSources((await api('/api/admin/knowledge/sources')).sources || [])
    setExamples((await api('/api/admin/learning')).examples || [])
  }, [])
  useEffect(() => { load() }, [load])

  function setSetup(tech, v) {
    setCfg(c => ({ ...c, techniques: { ...c.techniques, [tech]: { ...c.techniques[tech], setup: Number(v) || 0 } } }))
  }
  function setTiers(tech, field, text) {
    const tiers = text.split(',').map(s => {
      const [q, v] = s.split(':').map(x => x.trim())
      const maxQty = /inf|∞/i.test(q) ? null : Number(q)
      return field === 'leadDays' ? { maxQty, days: Number(v) } : { maxQty, price: Number(v) }
    }).filter(t => !isNaN(t.maxQty === null ? 0 : t.maxQty))
    setCfg(c => ({ ...c, techniques: { ...c.techniques, [tech]: { ...c.techniques[tech], [field]: tiers } } }))
  }
  const fmtTiers = (tiers, field) => (tiers || []).map(t => `${t.maxQty == null ? 'inf' : t.maxQty}:${field === 'leadDays' ? t.days : t.price}`).join(', ')

  async function save() {
    const r = await api('/api/admin/personalization', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
    setCfg(r); setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  async function upload(e) {
    const file = e.target.files?.[0]; if (!file) return
    const content = await file.text()
    await api('/api/admin/knowledge/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: COMPANY_ID, filename: file.name, kind: 'document', content }) })
    e.target.value = ''; load()
  }
  async function toggleSource(s) {
    await api(`/api/admin/knowledge/sources/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !s.active }) })
    load()
  }
  async function delSource(s) {
    await api(`/api/admin/knowledge/sources/${s.id}`, { method: 'DELETE' }); load()
  }
  async function review(id, status) {
    await api(`/api/admin/learning/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); load()
  }

  if (!cfg) return <div className="admin"><p className="muted">Se încarcă…</p></div>

  return (
    <div className="admin">
      <h2>Administrare</h2>
      <p className="lead">Setări de personalizare, surse de cunoștințe și validarea exemplelor pentru învățare.</p>

      <div className="card">
        <div className="hd"><span>Personalizare — prețuri și termene</span>
          <span>{saved && <span className="muted" style={{ marginRight: 10 }}>Salvat</span>}<button className="btn sm" onClick={save}>Salvează</button></span>
        </div>
        <div className="bd" style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Tehnică</th><th>Setup</th><th>Preț/poziție (cant:preț)</th><th>Termen (cant:zile)</th></tr></thead>
            <tbody>
              {Object.entries(cfg.techniques).map(([k, t]) => (
                <tr key={k}>
                  <td>{t.label || k}</td>
                  <td><input type="number" value={t.setup} onChange={e => setSetup(k, e.target.value)} /></td>
                  <td><input style={{ width: 220 }} defaultValue={fmtTiers(t.pricePerPosition, 'price')} onBlur={e => setTiers(k, 'pricePerPosition', e.target.value)} /></td>
                  <td><input style={{ width: 160 }} defaultValue={fmtTiers(t.leadDays, 'leadDays')} onBlur={e => setTiers(k, 'leadDays', e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>Format tiers: „cantitate_maximă:valoare", separate prin virgulă. Folosiți „inf" pentru ultimul prag. Ex: 10:18, 50:12, inf:7</div>
        </div>
      </div>

      <div className="card">
        <div className="hd"><span>Surse de cunoștințe</span>
          <label className="btn sm">Încarcă fișier<input type="file" accept=".csv,.txt,.json,.tsv,.md" onChange={upload} style={{ display: 'none' }} /></label>
        </div>
        <div className="bd">
          <table className="tbl">
            <thead><tr><th>Fișier</th><th>Tip</th><th>Mărime</th><th>Stare</th><th className="right">Acțiuni</th></tr></thead>
            <tbody>
              {sources.length === 0 && <tr><td colSpan="5" className="muted">Nicio sursă încărcată. Acceptă CSV, TXT, JSON.</td></tr>}
              {sources.map(s => (
                <tr key={s.id}>
                  <td>{s.filename}</td><td>{s.kind}</td><td className="muted">{s.chars} car.</td>
                  <td><span className={`pill ${s.active ? 'on' : 'off'}`}>{s.active ? 'activ' : 'inactiv'}</span></td>
                  <td className="right">
                    <button className="btn ghost sm" onClick={() => toggleSource(s)}>{s.active ? 'Dezactivează' : 'Activează'}</button>{' '}
                    <button className="btn danger sm" onClick={() => delSource(s)}>Șterge</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Excel/PDF necesită o bibliotecă suplimentară (xlsx / pdf-parse) — în curs.</div>
        </div>
      </div>

      <div className="card">
        <div className="hd"><span>Învățare supervizată — validare exemple</span>
          <a className="btn ghost sm" href={`${BACKEND}/api/admin/learning/export`}>Export JSONL (aprobate)</a>
        </div>
        <div className="bd">
          <table className="tbl">
            <thead><tr><th>Cerere</th><th>Răspuns</th><th>Stare</th><th className="right">Acțiuni</th></tr></thead>
            <tbody>
              {examples.length === 0 && <tr><td colSpan="4" className="muted">Niciun exemplu încă. Apar pe măsură ce se generează oferte.</td></tr>}
              {examples.slice(-30).reverse().map(ex => (
                <tr key={ex.id}>
                  <td style={{ maxWidth: 220 }}>{ex.input}</td>
                  <td style={{ maxWidth: 320 }} className="muted">{(ex.output || '').slice(0, 120)}…</td>
                  <td><span className={`pill ${ex.status === 'approved' ? 'on' : ex.status === 'rejected' ? 'off' : 'pending'}`}>{ex.status}</span></td>
                  <td className="right">
                    <button className="btn ghost sm" onClick={() => review(ex.id, 'approved')}>Aprobă</button>{' '}
                    <button className="btn danger sm" onClick={() => review(ex.id, 'rejected')}>Respinge</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Învățarea e mereu supervizată: doar exemplele aprobate intră în export. Modelul nu se antrenează automat.</div>
        </div>
      </div>
    </div>
  )
}
