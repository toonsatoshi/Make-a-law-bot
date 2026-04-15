# ⚖ LEXBOT

> Turn your grievance into real legislation.

LEXBOT is a legislative drafting assistant powered by DeepSeek. It walks users through a structured intake process and produces an actual formatted bill they can send to their representatives.

---

## Stack

- **Frontend** — React + Vite
- **Backend** — Express (proxies DeepSeek API, serves built frontend)
- **AI** — DeepSeek Chat (`deepseek-chat`)
- **Deployment** — Railway

---

## Local Development

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/lexbot.git
cd lexbot
```

### 2. Set up environment variables

```bash
cp .env.example .env
# Edit .env and add your DeepSeek API key
# Get one at: https://platform.deepseek.com/api_keys
```

### 3. Install dependencies

```bash
# Root (Express server)
npm install

# Client (React/Vite)
cd client && npm install && cd ..
```

### 4. Run in development mode

```bash
npm run dev
```

- React dev server: http://localhost:5173
- Express server: http://localhost:3000
- The Vite proxy forwards `/api` calls from port 5173 → 3000 automatically

---

## Deploy to Railway

### Option A — Railway Dashboard (easiest)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Select your repo
4. Go to **Variables** and add:
   ```
   DEEPSEEK_API_KEY=your_key_here
   ```
5. Railway auto-detects `railway.json` and deploys. Done.

### Option B — Railway CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway up
railway variables set DEEPSEEK_API_KEY=your_key_here
```

---

## Project Structure

```
lexbot/
├── client/                 # React + Vite frontend
│   ├── src/
│   │   ├── LexBot.jsx      # Main app component
│   │   └── main.jsx        # React entry point
│   ├── index.html
│   ├── vite.config.js      # Dev proxy: /api → localhost:3000
│   └── package.json
├── server/
│   └── index.js            # Express: /api/chat proxy + static serving
├── package.json            # Root: build + start scripts
├── railway.json            # Railway deployment config
├── .env.example
└── .gitignore
```

---

## How It Works

1. User types a grievance in the chat UI
2. Frontend sends conversation history to `/api/chat` (your Express server)
3. Express adds the `DEEPSEEK_API_KEY` header and forwards the request to DeepSeek
4. LEXBOT follows a structured intake → asks clarifying questions → drafts the bill
5. When the model outputs `BILL_READY`, the UI extracts and surfaces the bill
6. User can copy the bill and find + contact their representatives by ZIP code

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DEEPSEEK_API_KEY` | ✅ | Your DeepSeek API key |
| `PORT` | ❌ | Server port (Railway sets this automatically) |
