import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fetch from "node-fetch";
import { Telegraf, session, Markup } from "telegraf";
import Phaxio from "phaxio";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Phaxio Client ───────────────────────────────────────────────────────────
let phaxio;
if (process.env.PHAXIO_KEY && process.env.PHAXIO_SECRET) {
  phaxio = new Phaxio(process.env.PHAXIO_KEY, process.env.PHAXIO_SECRET);
}

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
      ctx.session = { messages: [], waitingForZip: false, currentBill: "" };
      const domain = publicDomain || "localhost:3000";
      let miniAppUrl = process.env.MINI_APP_URL || (domain.startsWith("http") ? domain : `https://${domain}`);
      
      if (!miniAppUrl.startsWith("https://") && !miniAppUrl.includes("localhost")) {
        miniAppUrl = `https://${miniAppUrl.replace(/^http:\/\//, "")}`;
      }
      
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

  bot.command("new", (ctx) => {
    ctx.session = { messages: [], waitingForZip: false, currentBill: "" };
    return ctx.reply("Session reset. Tell me what's wrong.");
  });

  bot.on("text", async (ctx) => {
    try {
      if (!ctx.session) ctx.session = { messages: [], waitingForZip: false, currentBill: "" };
      const userText = ctx.message.text.trim();

      // Handle ZIP code input if we are waiting for it
      if (ctx.session.waitingForZip && /^\d{5}$/.test(userText)) {
        await ctx.reply("Locating your representatives and their fax lines...");
        try {
          // Fetch master list of legislators for FAX numbers
          const res = await fetch("https://theunitedstates.io/congress-legislators/legislators-current.json");
          const allReps = await res.json();
          
          // Use ZIP to find names
          const zipRes = await fetch(`https://whoismyrepresentative.com/getall_mems.php?zip=${userText}&output=json`);
          const zipData = await zipRes.json();
          
          if (zipData.results && zipData.results.length > 0) {
            let foundCount = 0;
            for (const r of zipData.results) {
              // Match by name
              const match = allReps.find(lr => 
                lr.name.official_full === r.name || 
                lr.name.last === r.name.split(" ").pop()
              );
              
              if (match && match.terms) {
                const term = match.terms[match.terms.length - 1];
                const fax = term.fax;
                const name = match.name.official_full || r.name;
                
                const buttons = [];
                // Add the specific test fax number provided by the user
                const testFax = "12066578208";
                buttons.push([{ text: `📠 TEST FAX TO LEXBOT LINE`, callback_data: `fax_${testFax}` }]);

                if (fax && phaxio) {
                  buttons.push([{ text: `📠 FAX BILL TO ${r.name}`, callback_data: `fax_${fax.replace(/\D/g,"")}` }]);
                }
                if (r.link) {
                  buttons.push([{ text: `🔗 WEB FORM: ${r.name}`, url: r.link }]);
                }

                await ctx.reply(`🏛 ${name}\nFax: ${fax || "Not available"}\nPhone: ${r.phone}`, 
                  buttons.length > 0 ? Markup.inlineKeyboard(buttons) : null
                );
                foundCount++;
              }
            }

            ctx.session.waitingForZip = false;
            if (foundCount === 0) return ctx.reply("Found your reps but couldn't verify their fax numbers. Use the web forms above.");
            return ctx.reply("Ready. Click a FAX button above to actually send your bill to that office.");
          } else {
            return ctx.reply("No representatives found for that ZIP. Try another 5-digit ZIP code.");
          }
        } catch (e) {
          console.error("Lookup error:", e);
          return ctx.reply("Couldn't reach representative database. Try again later or use House.gov.");
        }
      }

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

      if (raw.includes("BILL_READY")) {
        ctx.session.currentBill = raw.replace("BILL_READY", "").trim();
        await ctx.reply(ctx.session.currentBill);
        ctx.session.waitingForZip = true;
        return ctx.reply("🔥 YOUR BILL IS READY.\n\nTo find your representatives and fax this to them, reply with your 5-digit ZIP code.");
      }

      return ctx.reply(raw.trim());
    } catch (err) {
      console.error("Bot text handler error:", err);
      return ctx.reply("My circuits are jammed. Try again in a second.");
    }
  });

  bot.on("callback_query", async (ctx) => {
    try {
      const data = ctx.callbackQuery.data;
      if (data.startsWith("fax_")) {
        if (!phaxio) return ctx.answerCbQuery("Fax service not configured on server.", { show_alert: true });
        
        const faxNumber = data.split("_")[1];
        const billText = ctx.session?.currentBill;

        if (!billText) return ctx.answerCbQuery("Bill text missing. Start over with /new", { show_alert: true });

        await ctx.answerCbQuery("Sending fax... please wait.");
        await ctx.reply(`📤 Initiating fax to ${faxNumber}...`);

        const result = await phaxio.faxes.create({
          to: faxNumber,
          string_data: billText,
          string_data_type: "text"
        });

        if (result.success) {
          return ctx.reply(`✅ FAX SENT!\nTracking ID: ${result.data.id}\n\nThe legislative office will receive your bill shortly.`);
        } else {
          return ctx.reply(`❌ FAX FAILED: ${result.message}`);
        }
      }
    } catch (err) {
      console.error("Fax callback error:", err);
      return ctx.reply("❌ ERROR: Could not reach the fax service.");
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
