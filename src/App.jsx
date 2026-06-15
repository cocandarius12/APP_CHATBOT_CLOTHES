import React, { useState, useRef, useEffect } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || ''

const WELCOME = { role: 'assistant', content: 'Salut! 👋 Sunt asistentul de comenzi. Spune-mi ce produse te interesează și te ajut să găsești varianta potrivită.' }

export default function App() {
  const [messages, setMessages] = useState([WELCOME])
  const [input, setInput] = useState('')
  const [products, setProducts] = useState([])
  const [total, setTotal] = useState(null)
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, products])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    const nextHistory = [...messages, { role: 'user', content: text }]
    setMessages(nextHistory)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${BACKEND}/api/integrations/llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // nu trimitem mesajul de welcome la backend
        body: JSON.stringify({ messages: nextHistory.filter(m => m !== WELCOME) })
      })
      const json = await res.json()
      const raw = json.response ? json.response : (json.answer || '')

      let display = raw
      let parsedProducts = []
      let parsedTotal = null
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed.message === 'string') display = parsed.message
        if (Array.isArray(parsed.products)) parsedProducts = parsed.products
        if (typeof parsed.total_price === 'number') parsedTotal = parsed.total_price
      } catch (e) { /* text brut */ }

      setMessages(m => [...m, { role: 'assistant', content: display }])
      setProducts(parsedProducts)
      setTotal(parsedProducts.length ? (parsedTotal ?? parsedProducts.reduce((s, p) => s + (p.total_price || 0), 0)) : null)
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: '⚠️ Eroare la comunicarea cu serverul.' }])
    } finally {
      setLoading(false)
    }
  }

  const currency = products[0]?.currency || 'RON'

  return (
    <div className="app">
      <div className="header">
        <div className="avatar">🧵</div>
        <div>
          <div className="title">Asistent comenzi</div>
          <div className="subtitle"><span className="dot" /> Îmbrăcăminte personalizată · online</div>
        </div>
      </div>

      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`row ${m.role === 'user' ? 'user' : 'assistant'}`}>
            {m.role === 'assistant' && <div className="mini">🧵</div>}
            <div className="bubble">{m.content}</div>
          </div>
        ))}

        {loading && (
          <div className="row assistant">
            <div className="mini">🧵</div>
            <div className="bubble"><div className="typing"><span /><span /><span /></div></div>
          </div>
        )}

        {products.length > 0 && (
          <div className="order">
            <h4>Comanda ta</h4>
            {products.map((p, idx) => (
              <div className="line" key={idx}>
                <div>
                  <div className="name">{p.quantity ? `${p.quantity} × ` : ''}{p.name || 'Produs'}</div>
                  <div className="chips">
                    {p.color && <span className="chip">{p.color}</span>}
                    {p.size && <span className="chip">{p.size}</span>}
                    {p.unit_price != null && <span className="chip">{p.unit_price} {p.currency || currency}/buc</span>}
                  </div>
                </div>
                {p.total_price != null && <div className="price">{p.total_price} {p.currency || currency}</div>}
              </div>
            ))}
            {total != null && (
              <div className="total">
                <span>Total estimat</span>
                <span className="amt">{Number(total.toFixed ? total.toFixed(2) : total)} {currency}</span>
              </div>
            )}
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="controls">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Scrie un mesaj..."
          enterKeyHint="send"
          autoComplete="off"
          autoCapitalize="sentences"
          onKeyDown={e => { if (e.key === 'Enter') send() }}
        />
        <button className="send" onClick={send} disabled={loading || !input.trim()} aria-label="Trimite">➤</button>
      </div>
    </div>
  )
}
