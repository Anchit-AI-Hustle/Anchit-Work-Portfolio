# Deploy guide, Anchit's Work

This guide gets your portfolio onto **github.com/anchittandon-create/Anchit-s-Work-Portfolio** and live on Vercel.

---

## Step 1, Push to GitHub

Open Terminal on your Mac (or Command Prompt on Windows) and navigate to the folder where these files are saved. Then run:

```bash
# initialize git in the folder
git init

# add all files
git add .

# first commit
git commit -m "Initial portfolio with chatbot and side projects"

# set main branch
git branch -M main

# connect to your existing GitHub repo
git remote add origin https://github.com/anchittandon-create/Anchit-s-Work-Portfolio.git

# push
git push -u origin main
```

If git asks for authentication, it'll prompt for your GitHub username and a **Personal Access Token** (not your password). If you don't have one:
1. Go to github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token → check the `repo` scope → copy it
3. Paste it as the password when git asks

**If the repo already has files** (like a README from when you created it), the push will fail. Fix it with:

```bash
git pull origin main --allow-unrelated-histories
git push -u origin main
```

---

## Step 2, Deploy to Vercel

### Option A, Connect GitHub (recommended)

1. Go to **vercel.com/new**
2. Sign in with GitHub
3. Find **`Anchit-s-Work-Portfolio`** in your repo list → click **Import**
4. Project name: **`anchits-work`** → this gives you `anchits-work.vercel.app`
5. Framework Preset: **Other** (it's plain HTML, no build needed)
6. Click **Deploy**

Done. Every time you `git push` to main, Vercel auto-redeploys.

### Option B, Vercel CLI (no GitHub connection needed)

```bash
npm i -g vercel
vercel --name anchits-work
```

Follow the prompts. First run goes to a preview URL; run `vercel --prod` to push to production.

---

## Step 3, Custom domain (optional)

Once live, in Vercel project settings → **Domains** → add `anchit.work` or whatever you own. Vercel walks you through the DNS records.

---

## Upgrading the chatbot to a real LLM

The chatbot is currently a keyword-matched knowledge base, works offline, ships in one HTML file. To swap in Claude for actual conversational answers:

### 1. Create `api/chat.js` in the project root

```js
// api/chat.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { message } = req.body;

  const SYSTEM_PROMPT = `You are Anchit's AI assistant. Answer questions about Anchit Tandon: Senior Product Manager at Times Internet (since Apr 2025), 5+ years across consumer tech, subscriptions, growth funnels. Past roles: PM and APM at Times Internet, SWE at Citymall and Tuple Technologies. Key wins: scaled ET Prime assisted sales 5× (₹15L → ₹80L MRR), ET Markets revamp (+27% engagement, ₹3Cr ARR, +25% DAU), Times Health+ subscriptions, Times Internet Half Marathon (Mar 2026). Side projects: Hey Yaara (AI voice for elderly), MusicGenAI, AI TeleSuite, TH+ LifeEngine. B.Tech CSE from VIT Vellore. Based in Delhi. Email: anchit.tandon@gmail.com. Keep answers short, conversational, and warm. If asked something you don't know, say so and point to email.`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: message }]
    })
  });
  const data = await r.json();
  res.status(200).json({ reply: data.content[0].text });
}
```

### 2. Add API key to Vercel

Vercel project settings → Environment Variables → add `ANTHROPIC_API_KEY` with your key from console.anthropic.com.

### 3. Swap `getBotResponse()` in `index.html`

Find the function and replace it with:

```js
async function getBotResponse(text) {
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    const data = await r.json();
    return data.reply;
  } catch (e) {
    return "Sorry, I hit an error. Try emailing me directly at <a href='mailto:anchit.tandon@gmail.com'>anchit.tandon@gmail.com</a>.";
  }
}
```

And make `handleUserMessage` async:

```js
async function handleUserMessage(text) {
  if (!text.trim()) return;
  addUserMessage(text);
  showTyping();
  const reply = await getBotResponse(text);
  hideTyping();
  addBotMessage(reply);
}
```

Push, redeploy, you're live. Costs roughly $0.001 per chat with Haiku.

---

## Files in this repo

- `index.html`, the whole site, single file
- `README.md`, repo description for GitHub
- `vercel.json`, Vercel routing + security headers
- `.gitignore`, keeps env files and OS junk out of git
- `DEPLOY.md`, this guide
