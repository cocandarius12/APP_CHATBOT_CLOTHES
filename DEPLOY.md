# Deploy pe Render (gratuit) + GitHub

Aplicația rulează ca **un singur serviciu**: backend-ul Node servește și pagina și
API-ul. Datele vin din `backend/data/products.json` (7 MB, generat din snapshot),
deci nu e nevoie de fișierul brut de sute de MB online.

## 0. Înainte de toate
- Cont **GitHub** și cont **Render** (gratuit, render.com).
- **Regenerează cheia Groq** (console.groq.com → API Keys) — cheia veche a stat în
  fișiere locale. Pe cea nouă o pui în Render, NU în cod.
- `products.json` e deja generat. Dacă actualizezi datele furnizorului:
  ```bash
  UNIFIED_DATA_PATH=/Users/cocandarius-cristian/Downloads/unified_data_snapshot/unified_data_snapshot.json npm run build:data
  ```
  (regenerează `backend/data/products.json`; apoi commit + push)

## 1. Urcă pe GitHub
Creează un repo nou GOL pe GitHub (fără README). Apoi, din folderul
`chatbot-standalone`:
```bash
cd ~/Downloads/SERGIUAPP-main-2/chatbot-standalone
git init
git add .
git commit -m "Chatbot standalone"
git branch -M main
git remote add origin https://github.com/UTILIZATORUL_TAU/chatbot-standalone.git
git push -u origin main
```
`.gitignore` exclude automat `.env`, `node_modules`, `dist` și snapshot-ul brut —
deci cheia și fișierele mari NU ajung pe GitHub. `products.json` SE urcă (e mic).

## 2. Creează serviciul pe Render
1. Render → **New +** → **Web Service**.
2. Conectează contul GitHub și alege repo-ul `chatbot-standalone`.
3. Render citește `render.yaml` automat (Blueprint). Dacă te întreabă manual:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node backend/server.js`
   - **Plan:** Free
4. La **Environment** adaugă:
   - `GROQ_API_KEY` = cheia ta nouă (secret)
   - `GROQ_MODEL` = `llama-3.3-70b-versatile`
5. **Create Web Service** → așteaptă build-ul (2-4 min).

Gata: primești o adresă publică, ex. `https://chatbot-standalone.onrender.com`.

## 3. De știut despre planul gratuit
- Serviciul **adoarme după ~15 min** fără trafic; primul mesaj după pauză vine în
  ~30 sec (cold start). Pentru clienți reali, treci pe plan plătit (~7 $/lună,
  always-on) sau pe Railway/VPS — fără să schimbăm codul.
- Costul Groq e separat și mic (sub un cent/conversație).

## Dacă urci TOT repo-ul SERGIUAPP (nu doar chatbot-standalone)
În `render.yaml` decomentează linia `rootDir: chatbot-standalone`.

## Update ulterior
Orice `git push` pe `main` declanșează automat un nou deploy pe Render.
