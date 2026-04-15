import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fetch from "node-fetch";
import { Telegraf, session } from "telegraf";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const SYSTEM_PROMPT = `You are LEXBOT — a legislative drafting assistant that helps ordinary citizens transform their lived experiences and grievances into real, structured legislation.

Your mission: take someone's raw emotion, outrage, or witnessed injustice and walk them through creating an actual bill.

YOUR PERSONALITY:
- Direct, sharp, a little electric. You match the user's energy.
- You believe in ordinary people having real power to change things.
- You never condescend. You treat every grievance as worthy of the law.
- Short responses. Punchy. No fluff.

YOUR PROCESS — follow this flow:

STEP 1 — INTAKE: When the user shares their grievance, respond with empathy and ONE sharp clarifying question about: who does this harm?

STEP 2 — SCOPE: Ask ONE question: is this already illegal somewhere, or is this a gap in the law?

STEP 3 — REMEDY: Ask ONE question: what should the consequence be? (fine, disclosure, prohibition, criminal penalty?)

STEP 4 — DRAFT: Once you have enough (after 3-5 exchanges), say exactly "BILL_READY" on its own line, then produce the complete bill in this EXACT structure:

---
[BILL TITLE IN ALL CAPS]
A Bill to [purpose statement]

SECTION 1 — SHORT TITLE
This Act shall be known as the "[Catchy Name] Act of [current year]."

SECTION 2 — LEGISLATIVE FINDINGS
Congress finds: (numbered findings based on the user's grievance)

SECTION 3 — DEFINITIONS
Key terms defined.

SECTION 4 — PROHIBITED CONDUCT
What is banned or required.

SECTION 5 — ENFORCEMENT & PENALTIES
Who enforces it and what the penalties are.

SECTION 6 — EFFECTIVE DATE
This Act takes effect [timeframe] after enactment.
---

After the bill, add one line: "This is yours. Now send it."

IMPORTANT RULES:
- Never generate the bill until you have asked at least 3 questions
- Keep each response UNDER 80 words except for the final bill
- The word BILL_READY must appear alone on its own line before the bill text
- Never say certainly, absolutely, of course, or great question
- You are not a lawyer. This is civic empowerment, not legal advice.
- Every grievance deserves a bill. No dismissals.`;

const WELCOME_TEXT = "⚖ LEXBOT\n\nYou witnessed something wrong. Something that should not be allowed.\n\nTell me what it was.\n\nI will help you write the law.";

// ── Telegram Bot (Webhook) ──────────────────────────────────────────────────
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.MINI_APP_URL?.replace("https://", "");
let bot;

if (botToken) {
  bot = new Telegraf(botToken);
  bot.use(session());

  // Error handling
  bot.catch((err, ctx) => {
    console.error(`Telegraf error for ${ctx.updateType}:`, err);
  });

  bot.start((ctx) => {
    try {
      ctx.session = { messages: [] };
      const domain = publicDomain || "localhost:3000";
      const miniAppUrl = process.env.MINI_APP_URL || (domain.startsWith("http") ? domain : `https://${domain}`);
      
      console.log(`Sending start message with Mini App URL: ${miniAppUrl}`);
      
      return ctx.reply(WELCOME_TEXT, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🚀 Open LexBot Mini App", web_app: { url: miniAppUrl } }]
          ]
        }
      });
    } catch (err) {
      console.error("Error in start command:", err);
    }
  });

  bot.on("text", async (ctx) => {
    try {
      if (!ctx.session) ctx.session = { messages: [] };
      const userText = ctx.message.text;
      ctx.session.messages.push({ role: "user", content: userText });

      const apiMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...ctx.session.messages
      ];

      const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          max_tokens: 1200,
          messages: apiMessages,
        }),
      });

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || "Error. Try again.";
      ctx.session.messages.push({ role: "assistant", content: raw });
      const cleanMsg = raw.replace("BILL_READY", "").trim();
      return ctx.reply(cleanMsg);
    } catch (err) {
      console.error("Bot text handler error:", err);
      return ctx.reply("My circuits are jammed. Try again in a second.");
    }
  });

  // Use Webhooks if domain is available, else fallback to polling for local dev
  if (publicDomain && !publicDomain.includes("localhost")) {
    const secretPath = `/telegraf/${bot.secretPathComponent()}`;
    bot.telegram.setWebhook(`https://${publicDomain}${secretPath}`).catch(err => {
      console.error("Failed to set webhook:", err);
    });
    app.use(bot.webhookCallback(secretPath));
    console.log(`Telegram Bot configured with Webhook: https://${publicDomain}${secretPath}`);
  } else {
    bot.launch().then(() => console.log("Telegram Bot started (Polling)")).catch(err => {
      console.error("Failed to launch bot (polling):", err);
    });
  }
} else {
  console.log("TELEGRAM_BOT_TOKEN not found. Bot disabled.");
}

// ── DeepSeek proxy (Mini App API) ───────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "DEEPSEEK_API_KEY not configured on server." });
  }

  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    console.error("DeepSeek proxy error:", err);
    res.status(502).json({ error: "Failed to reach DeepSeek API." });
  }
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── Serve React build ─────────────────────────────────────────────────────────
const clientDist = join(__dirname, "../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(join(clientDist, "index.html"));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const server = createServer(app);
server.listen(PORT, () => {
  console.log(`LEXBOT server running on port ${PORT}`);
});

// Graceful stop
process.once("SIGINT", () => {
  if (bot) bot.stop("SIGINT");
  process.exit();
});
process.once("SIGTERM", () => {
  if (bot) bot.stop("SIGTERM");
  process.exit();
});
