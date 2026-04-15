import { useState, useRef, useEffect } from "react";

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

const WELCOME = {
  id: 0,
  role: "assistant",
  text: "LEXBOT\n\nYou witnessed something wrong. Something that should not be allowed.\n\nTell me what it was.\n\nI will help you write the law.",
};

function SendPanel({ bill, onClose }) {
  const [zip, setZip] = useState("");
  const [reps, setReps] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState({});

  const findReps = async () => {
    if (zip.length < 5) return;
    setLoading(true);
    setError("");
    setReps(null);
    try {
      const url = `https://whoismyrepresentative.com/getall_mems.php?zip=${zip}&output=json`;
      const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxy);
      const data = await res.json();
      const parsed = JSON.parse(data.contents);
      if (parsed.results && parsed.results.length > 0) {
        setReps(parsed.results);
      } else {
        setError("No representatives found for that ZIP. Try a 5-digit US ZIP code.");
      }
    } catch {
      setError("Could not fetch reps right now. Use the direct links below.");
    }
    setLoading(false);
  };

  const copyBill = () => {
    navigator.clipboard.writeText(bill);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={sp.overlay}>
      <div style={sp.panel}>
        <div style={sp.header}>
          <span style={sp.title}>SEND YOUR BILL</span>
          <button onClick={onClose} style={sp.closeBtn}>X</button>
        </div>

        <div style={sp.section}>
          <div style={sp.label}>YOUR BILL</div>
          <div style={sp.billBox}>
            <pre style={sp.billText}>{bill}</pre>
          </div>
          <button onClick={copyBill} style={sp.copyBtn}>
            {copied ? "COPIED" : "COPY BILL TEXT"}
          </button>
        </div>

        <div style={sp.section}>
          <div style={sp.label}>FIND YOUR REPRESENTATIVES</div>
          <div style={sp.zipRow}>
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              onKeyDown={(e) => e.key === "Enter" && findReps()}
              placeholder="ZIP code"
              style={sp.zipInput}
            />
            <button
              onClick={findReps}
              disabled={loading || zip.length < 5}
              style={{ ...sp.findBtn, opacity: zip.length < 5 ? 0.4 : 1 }}
            >
              {loading ? "..." : "FIND"}
            </button>
          </div>
          {error && <div style={sp.error}>{error}</div>}
        </div>

        {reps && (
          <div style={sp.section}>
            <div style={sp.label}>YOUR REPS</div>
            {reps.map((rep) => (
              <div key={rep.name} style={sp.repCard}>
                <div>
                  <div style={sp.repName}>{rep.name}</div>
                  <div style={sp.repMeta}>
                    {rep.party === "R" ? "Republican" : rep.party === "D" ? "Democrat" : rep.party}
                    {rep.district ? ` · District ${rep.district}` : " · Senator"}
                    {rep.state ? ` · ${rep.state}` : ""}
                  </div>
                  {rep.phone && <div style={sp.repPhone}>{rep.phone}</div>}
                </div>
                {rep.link && (
                  <a
                    href={rep.link}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      ...sp.contactLink,
                      background: sent[rep.name] ? "#238636" : "linear-gradient(135deg,#1f6feb,#388bfd)",
                    }}
                    onClick={() => setSent((p) => ({ ...p, [rep.name]: true }))}
                  >
                    {sent[rep.name] ? "SENT" : "CONTACT"}
                  </a>
                )}
              </div>
            ))}
            <div style={sp.instructions}>
              1. Copy bill text above &rarr; 2. Click CONTACT &rarr; 3. Paste into their form
            </div>
          </div>
        )}

        <div style={sp.fallback}>
          Direct links: &nbsp;
          <a href="https://www.house.gov/representatives/find-your-representative" target="_blank" rel="noreferrer" style={sp.link}>House.gov</a>
          &nbsp;&middot;&nbsp;
          <a href="https://www.senate.gov/senators/contact" target="_blank" rel="noreferrer" style={sp.link}>Senate.gov</a>
        </div>
      </div>
    </div>
  );
}

export default function LexBot() {
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [bill, setBill] = useState(null);
  const [showSend, setShowSend] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg = { id: Date.now(), role: "user", text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    // Build message array for DeepSeek (OpenAI-compatible format)
    // System prompt goes as first message with role "system"
    const apiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...newMessages
        .filter((m) => m.id !== 0)
        .map((m) => ({ role: m.role, content: m.text })),
    ];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "deepseek-chat",
          max_tokens: 1200,
          messages: apiMessages,
        }),
      });

      const data = await res.json();

      // DeepSeek returns OpenAI-compatible: choices[0].message.content
      const raw = data.choices?.[0]?.message?.content || "Error. Try again.";

      const marker = raw.indexOf("BILL_READY");
      if (marker !== -1) {
        const extracted = raw.slice(marker + "BILL_READY".length).trim();
        setBill(extracted);
      }
      const displayText = raw.replace("BILL_READY", "").trim();
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: "assistant", text: displayText }]);
    } catch {
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: "assistant", text: "Connection error. Try again." }]);
    }
    setLoading(false);
    inputRef.current?.focus();
  };

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.avatar}>⚖</div>
          <div>
            <div style={s.botName}>LEXBOT</div>
            <div style={s.botSub}>Democracy on demand</div>
          </div>
        </div>
        <div style={s.headerRight}>
          {bill && (
            <button onClick={() => setShowSend(true)} style={s.sendBillBtn}>
              SEND THIS BILL
            </button>
          )}
          <button onClick={() => { setMessages([WELCOME]); setInput(""); setBill(null); setShowSend(false); }} style={s.newBtn}>
            NEW
          </button>
        </div>
      </div>

      <div style={s.feed}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ ...s.row, justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            {msg.role === "assistant" && <div style={s.avy}>⚖</div>}
            <div style={msg.role === "user" ? s.bubU : s.bubA}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ ...s.row, justifyContent: "flex-start" }}>
            <div style={s.avy}>⚖</div>
            <div style={s.bubA}>
              <div style={s.dots}>
                {[0,1,2].map(i => <span key={i} style={{ ...s.dot, animationDelay: `${i*0.25}s` }} />)}
              </div>
            </div>
          </div>
        )}
        {bill && !showSend && (
          <div style={s.billBanner}>
            <div style={s.billBannerText}>Your bill is ready.</div>
            <button onClick={() => setShowSend(true)} style={s.sendBillBtn}>
              SEND TO YOUR REPRESENTATIVES
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={s.bar}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }}}
          placeholder="Tell me what's wrong with the world…"
          style={s.ta}
          rows={1}
          disabled={loading}
        />
        <button onClick={send} disabled={loading || !input.trim()} style={{ ...s.go, opacity: (loading || !input.trim()) ? 0.4 : 1 }}>
          &#10148;
        </button>
      </div>

      {showSend && bill && <SendPanel bill={bill} onClose={() => setShowSend(false)} />}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@400;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes blink{0%,100%{opacity:.15}50%{opacity:1}}
        @keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        textarea:focus{border-color:#388bfd!important;outline:none;}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#30363d;border-radius:2px}
      `}</style>
    </div>
  );
}

const s = {
  root:{fontFamily:"'IBM Plex Sans',sans-serif",background:"#0d1117",color:"#e6edf3",height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"},
  header:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 18px",borderBottom:"1px solid #21262d",background:"#161b22",flexShrink:0},
  headerLeft:{display:"flex",alignItems:"center",gap:11},
  headerRight:{display:"flex",gap:8,alignItems:"center"},
  avatar:{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#1f6feb,#58a6ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,color:"#fff",flexShrink:0},
  botName:{fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:14,letterSpacing:3,color:"#58a6ff"},
  botSub:{fontSize:10,color:"#3fb950",letterSpacing:1,marginTop:2,fontFamily:"'IBM Plex Mono',monospace"},
  sendBillBtn:{background:"linear-gradient(135deg,#1f6feb,#388bfd)",border:"none",color:"#fff",borderRadius:6,padding:"6px 13px",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,letterSpacing:1.5,cursor:"pointer",fontWeight:700},
  newBtn:{background:"none",border:"1px solid #30363d",color:"#8b949e",borderRadius:6,padding:"5px 11px",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,letterSpacing:2,cursor:"pointer"},
  feed:{flex:1,overflowY:"auto",padding:"18px 14px",display:"flex",flexDirection:"column",gap:11},
  row:{display:"flex",alignItems:"flex-end",gap:7},
  avy:{width:26,height:26,borderRadius:"50%",background:"linear-gradient(135deg,#1f6feb,#58a6ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",flexShrink:0,fontWeight:700},
  bubA:{maxWidth:"78%",background:"#161b22",border:"1px solid #21262d",borderRadius:"16px 16px 16px 3px",padding:"11px 15px",fontSize:14,lineHeight:1.65,whiteSpace:"pre-wrap",wordBreak:"break-word"},
  bubU:{maxWidth:"72%",background:"linear-gradient(135deg,#1f6feb,#388bfd)",borderRadius:"16px 16px 3px 16px",padding:"11px 15px",fontSize:14,lineHeight:1.65,color:"#fff",whiteSpace:"pre-wrap",wordBreak:"break-word"},
  dots:{display:"flex",gap:4,alignItems:"center",height:14},
  dot:{width:6,height:6,borderRadius:"50%",background:"#58a6ff",display:"inline-block",animation:"blink 1.2s infinite"},
  billBanner:{display:"flex",flexDirection:"column",alignItems:"center",gap:11,padding:"18px 0",animation:"up 0.4s ease"},
  billBannerText:{fontFamily:"'IBM Plex Mono',monospace",fontSize:12,color:"#3fb950",letterSpacing:1},
  bar:{display:"flex",alignItems:"flex-end",gap:9,padding:"10px 14px 14px",borderTop:"1px solid #21262d",background:"#161b22",flexShrink:0},
  ta:{flex:1,background:"#0d1117",border:"1px solid #30363d",borderRadius:11,color:"#e6edf3",fontSize:14,padding:"11px 15px",resize:"none",fontFamily:"'IBM Plex Sans',sans-serif",lineHeight:1.5,maxHeight:110,overflowY:"auto"},
  go:{width:42,height:42,borderRadius:"50%",background:"linear-gradient(135deg,#1f6feb,#58a6ff)",border:"none",color:"#fff",fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},
};

const sp = {
  overlay:{position:"absolute",inset:0,background:"rgba(0,0,0,0.88)",zIndex:100,display:"flex",alignItems:"flex-end",backdropFilter:"blur(4px)"},
  panel:{width:"100%",maxHeight:"88vh",background:"#161b22",borderTop:"2px solid #388bfd",borderRadius:"14px 14px 0 0",overflowY:"auto",paddingBottom:28,animation:"up 0.3s ease"},
  header:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px 13px",borderBottom:"1px solid #21262d",position:"sticky",top:0,background:"#161b22",zIndex:10},
  title:{fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:13,letterSpacing:2.5,color:"#58a6ff"},
  closeBtn:{background:"none",border:"none",color:"#8b949e",fontSize:17,cursor:"pointer"},
  section:{padding:"15px 20px",borderBottom:"1px solid #21262d"},
  label:{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,letterSpacing:2.5,color:"#8b949e",marginBottom:9,textTransform:"uppercase"},
  billBox:{background:"#0d1117",border:"1px solid #21262d",borderRadius:7,padding:"10px 13px",maxHeight:160,overflowY:"auto",marginBottom:9},
  billText:{fontFamily:"'IBM Plex Mono',monospace",fontSize:10.5,lineHeight:1.7,color:"#c9d1d9",whiteSpace:"pre-wrap",wordBreak:"break-word"},
  copyBtn:{background:"#21262d",border:"1px solid #30363d",color:"#58a6ff",borderRadius:6,padding:"8px 0",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,letterSpacing:2,cursor:"pointer",width:"100%",fontWeight:700},
  zipRow:{display:"flex",gap:8},
  zipInput:{flex:1,background:"#0d1117",border:"1px solid #30363d",borderRadius:7,color:"#e6edf3",fontSize:16,padding:"9px 13px",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:3,outline:"none"},
  findBtn:{background:"linear-gradient(135deg,#1f6feb,#388bfd)",border:"none",color:"#fff",borderRadius:7,padding:"9px 16px",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,letterSpacing:1.5,cursor:"pointer",fontWeight:700},
  error:{color:"#f85149",fontSize:11,fontFamily:"'IBM Plex Mono',monospace",marginTop:7},
  repCard:{background:"#0d1117",border:"1px solid #21262d",borderRadius:9,padding:"11px 13px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:11,marginBottom:7},
  repName:{fontWeight:700,fontSize:13,color:"#e6edf3",marginBottom:3},
  repMeta:{fontSize:10,color:"#8b949e",fontFamily:"'IBM Plex Mono',monospace",marginBottom:2},
  repPhone:{fontSize:10,color:"#3fb950",fontFamily:"'IBM Plex Mono',monospace"},
  contactLink:{display:"inline-block",color:"#fff",borderRadius:6,padding:"7px 11px",textDecoration:"none",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,letterSpacing:1.5,fontWeight:700},
  instructions:{marginTop:11,fontSize:10,color:"#8b949e",textAlign:"center",fontFamily:"'IBM Plex Mono',monospace",lineHeight:1.7},
  fallback:{padding:"13px 20px",fontSize:11,color:"#8b949e",textAlign:"center",fontFamily:"'IBM Plex Mono',monospace"},
  link:{color:"#58a6ff",textDecoration:"none"},
};
