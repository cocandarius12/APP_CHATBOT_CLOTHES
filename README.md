# Chatbot Standalone

Proiect **de sine stătător** (frontend Vite + backend Express) cu același chatbot
ca în proiectul mamă. Nu mai depinde de căile proiectului mamă; folosește ca bază
de date snapshot-ul unificat de la furnizor (`unified_data_snapshot.json`).

## Structură

```
chatbot-standalone/
├── index.html
├── vite.config.js        # proxy /api -> backend (port 3002)
├── package.json          # frontend + scripturi
├── .env                  # VITE_BACKEND_URL / port
├── src/                  # UI React (App.jsx, chatParser.jsx)
└── backend/
    ├── server.js         # API Express (catalog + /api/integrations/llm)
    ├── dataAdapter.js    # mapează unified_data_snapshot.json -> produse
    ├── package.json      # express, cors, dotenv
    └── .env              # GROQ_API_KEY + UNIFIED_DATA_PATH + port
```

## Configurare bază de date

Backend-ul citește produsele din snapshot-ul unificat. Calea se setează în
`backend/.env`:

```
UNIFIED_DATA_PATH=/Users/cocandarius-cristian/Downloads/unified_data_snapshot/unified_data_snapshot.json
```

Adaptorul (`backend/dataAdapter.js`) transformă structura snapshot-ului
(`{ "<style>": { style_data, variants{ product_data, stock_data } } }`) în lista
simplă de produse folosită de chatbot (`id, sku, name, brand, category,
base_cost (RON), is_active, description, colors, sizes`). Prețul de bază este cel
mai mic `calculated_price_ron` dintre variante. Fișierul e citit o singură dată și
re-citit doar când i se schimbă data modificării (mtime).

## Instalare

```bash
cd chatbot-standalone
npm install            # frontend (vite, @vitejs/plugin-react, concurrently)
cd backend && npm install && cd ..   # backend (express, cors, dotenv)
```

## Rulare

O singură comandă (pornește backend + frontend):

```bash
npm start
```

Sau separat, în două terminale:

```bash
npm run backend        # http://localhost:3002
npm run dev            # http://localhost:5173
```

Deschide http://localhost:5173.

## Verificare rapidă

```bash
curl http://localhost:3002/api/health
# -> { status: "ok", snapshot: { exists: true, products: N } }

curl "http://localhost:3002/api/catalog/products?search=tricou&limit=3"
```

## AI

Modul AI folosește Groq. Pune cheia în `backend/.env` (`GROQ_API_KEY`). Fără cheie,
backend-ul răspunde cu un parser pe reguli (cantitate + tricou/hanorac) și, în rest,
cu un mesaj „AI neconfigurat" — aplicația rămâne funcțională.
