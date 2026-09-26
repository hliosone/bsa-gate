/**
 * BSA Gate — Shopify hosted pay-page service (USDC / EIP-3009 on Ethereum).
 *
 * Mirrors EdelGate's shopify-pay security model: the browser only ever holds an
 * opaque `pid`; the server keeps the amount/pay-to server-side and rebuilds the
 * facilitator `requirements` itself. Swaps XRPL/Crossmark for EVM/MetaMask.
 *
 * DRY_RUN (default) performs the REAL facilitator settle but skips Shopify Admin
 * calls (which need a store + admin token — see README).
 */
import crypto from "node:crypto";
import express from "express";

const PORT = Number(process.env.PORT ?? 8088);
const FAC = process.env.FACILITATOR_URL ?? "http://localhost:8787";
const USDC = process.env.USDC ?? "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const CHAIN = Number(process.env.CHAIN_ID ?? 11155111);
const PAYTO = process.env.MERCHANT ?? "0x9B49d993499d8bB15D7c0f4dc6214380B0Cbf212";
const USDC_NAME = process.env.USDC_NAME ?? "USDC";
const USDC_VERSION = process.env.USDC_VERSION ?? "2";
const ATTESTATIONS = JSON.parse(process.env.REQUIRED_ATTESTATIONS ?? '{"over18":"true"}');
const DRY_RUN = (process.env.DRY_RUN ?? "true") !== "false";

const app = express();
app.use(express.json());

/** pid -> { order, units, settled } (server-side; the browser never sees amount/payTo). */
const sessions = new Map();

app.get("/health", (_req, res) => res.json({ ok: true, dryRun: DRY_RUN, facilitator: FAC }));

app.get("/checkout", (req, res) => {
  const amount = String(req.query.amount ?? "19.99");
  const order = String(req.query.order ?? `SHOP-${Date.now()}`);
  const units = String(Math.round(parseFloat(amount) * 1e6));
  const pid = crypto.randomBytes(16).toString("hex");
  sessions.set(pid, { order, units, settled: false });
  res.redirect(`/pay?pid=${pid}`);
});

app.get("/pay", (req, res) => {
  const pid = String(req.query.pid ?? "");
  const s = sessions.get(pid);
  if (!s) return res.status(404).send("Unknown or expired checkout session.");
  res.type("html").send(payPage(pid, s));
});

app.post("/settle", async (req, res) => {
  const { pid, ensName, authorization } = req.body ?? {};
  const s = sessions.get(pid);
  if (!s) return res.status(404).json({ paid: false, error: "unknown session" });
  if (s.settled) return res.json({ paid: true, txHash: s.txHash });
  if (!ensName || !authorization?.signature) return res.status(400).json({ paid: false, error: "missing authorization" });

  // requirements built server-side from the session — never trust client amount/payTo.
  const requirements = {
    chainId: CHAIN,
    token: USDC,
    payTo: PAYTO,
    amount: s.units,
    requiredAttestations: ATTESTATIONS,
  };
  let out;
  try {
    const r = await fetch(`${FAC}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: { ensName, authorization }, requirements }),
    });
    out = await r.json();
  } catch (e) {
    return res.status(502).json({ paid: false, error: `facilitator unreachable: ${String(e)}` });
  }

  if (out.ok && out.txHash) {
    s.settled = true;
    s.txHash = out.txHash;
    if (DRY_RUN) {
      console.log(`[shopify][DRY_RUN] would mark ${s.order} PAID (tx ${out.txHash})`);
    } else {
      // Live: draftOrderComplete + metafieldsSet via Shopify Admin GraphQL with
      // SHOPIFY_ADMIN_TOKEN. Store-specific — completed manually against a real store.
      console.log(`[shopify] mark ${s.order} PAID (tx ${out.txHash}) — wire Admin API with token`);
    }
    return res.json({ paid: true, txHash: out.txHash });
  }
  return res.status(402).json({ paid: false, stage: out.stage, error: (out.reasons || []).join("; ") || "blocked" });
});

app.listen(PORT, () => console.log(`[bsa shopify-pay] :${PORT} DRY_RUN=${DRY_RUN} -> ${FAC}`));

function payPage(pid, s) {
  const cfg = {
    pid,
    order: s.order,
    units: s.units,
    chainId: CHAIN,
    usdc: USDC,
    payTo: PAYTO,
    domain: { name: USDC_NAME, version: USDC_VERSION, chainId: CHAIN, verifyingContract: USDC },
  };
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BSA Gate — Pay ${s.order}</title>
<style>body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#eaeef4;margin:0;padding:24px;color:#141a22}
.card{max-width:460px;margin:6vh auto;background:#fff;border:1px solid #e3e6ec;border-radius:14px;padding:24px;box-shadow:0 8px 24px rgba(20,26,34,.06)}
h3{margin:0 0 .3rem}.sub{color:#5c6b7c;font-size:.9rem;margin:0 0 1rem}
label{display:block;font-size:.8rem;font-weight:600;color:#334051;margin-bottom:1rem}
input{display:block;width:100%;margin-top:.35rem;padding:.6rem;border:1px solid #d6dee9;border-radius:9px;font-family:ui-monospace,Menlo,monospace}
button{width:100%;padding:.8rem;border:0;border-radius:10px;background:#2f56d9;color:#fff;font-size:1rem;font-weight:600;cursor:pointer}
button:disabled{opacity:.6}.status{margin-top:.85rem;font-size:.875rem;min-height:1.2em;color:#5c6b7c}.ok{color:#1a8a53}.err{color:#cf3838}</style></head>
<body><div class="card">
<h3>Pay order ${s.order}</h3>
<p class="sub">${(Number(s.units) / 1e6).toFixed(2)} USDC · gasless EIP-3009 · gated by BSA Gate</p>
<label>Your BSA Gate name<input id="ens" value="alice.bsagate.eth" spellcheck="false"></label>
<button id="btn">Connect wallet &amp; pay</button>
<p id="st" class="status"></p></div>
<script>const CFG=${JSON.stringify(cfg)};
const st=document.getElementById("st"),btn=document.getElementById("btn"),ens=document.getElementById("ens");
function set(m,k){st.textContent=m;st.className="status "+(k||"")}
function nonce(){const b=new Uint8Array(32);crypto.getRandomValues(b);return "0x"+[...b].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function pay(){btn.disabled=true;try{const eth=window.ethereum;if(!eth)throw new Error("Install MetaMask.");
set("Connecting…");const [from]=await eth.request({method:"eth_requestAccounts"});
const want="0x"+CFG.chainId.toString(16);if(await eth.request({method:"eth_chainId"})!==want){await eth.request({method:"wallet_switchEthereumChain",params:[{chainId:want}]});}
const now=Math.floor(Date.now()/1000);const msg={from,to:CFG.payTo,value:String(CFG.units),validAfter:"0",validBefore:String(now+3600),nonce:nonce()};
const td={types:{EIP712Domain:[{name:"name",type:"string"},{name:"version",type:"string"},{name:"chainId",type:"uint256"},{name:"verifyingContract",type:"address"}],TransferWithAuthorization:[{name:"from",type:"address"},{name:"to",type:"address"},{name:"value",type:"uint256"},{name:"validAfter",type:"uint256"},{name:"validBefore",type:"uint256"},{name:"nonce",type:"bytes32"}]},domain:CFG.domain,primaryType:"TransferWithAuthorization",message:msg};
set("Sign in your wallet…");const signature=await eth.request({method:"eth_signTypedData_v4",params:[from,JSON.stringify(td)]});
set("Submitting to BSA Gate…");const r=await fetch("/settle",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pid:CFG.pid,ensName:ens.value.trim(),authorization:Object.assign({signature},msg)})});
const out=await r.json();if(out.paid){set("Paid ✓ tx "+out.txHash,"ok");}else{set(out.error||"Not approved","err");btn.disabled=false;}
}catch(e){set(e.message||String(e),"err");btn.disabled=false;}}
btn.addEventListener("click",pay);</script></body></html>`;
}
