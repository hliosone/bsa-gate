"use client";
import { useEffect, useState } from "react";
import { FACILITATOR, DOMAIN, EIP3009_TYPES, connect, eth, randomNonce } from "../config";

const JURISDICTIONS = ["", "CH", "FR", "DE", "US", "GB", "JP"]; // "" = any
const PRESETS = ["agent.alice.bsagate.eth", "bob.bsagate.eth"];

export default function CheckoutPage() {
  const [ensName, setEns] = useState("agent.alice.bsagate.eth");
  const [reqOver18, setReqOver18] = useState(true);
  const [reqJur, setReqJur] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ msg: string; kind?: string }>({ msg: "" });
  const [out, setOut] = useState<any>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("name");
    if (p) setEns(p);
  }, []);

  function requiredAttestations(): Record<string, string> {
    const r: Record<string, string> = {};
    if (reqOver18) r.over18 = "true";
    if (reqJur) r.jurisdiction = reqJur;
    return r;
  }

  async function run(settle: boolean) {
    setBusy(true);
    setOut(null);
    setStatus({ msg: "Connecting…" });
    try {
      const from = await connect();
      setStatus({ msg: "Fetching payment terms…" });
      const probe = await fetch(FACILITATOR + "/demo/quote");
      if (probe.status !== 402) { setStatus({ msg: "Resource is not gated.", kind: "err" }); return; }
      const terms = (await probe.json()).accepts[0] as { payTo: string; amount: string; token: string; chainId: number };
      const now = Math.floor(Date.now() / 1000);
      const message = { from, to: terms.payTo, value: String(terms.amount), validAfter: "0", validBefore: String(now + 3600), nonce: randomNonce() };
      const typedData = { types: EIP3009_TYPES, domain: DOMAIN, primaryType: "TransferWithAuthorization", message };
      setStatus({ msg: "Sign the authorization in your wallet…" });
      const signature = await eth().request({ method: "eth_signTypedData_v4", params: [from, JSON.stringify(typedData)] });
      const payload = { ensName, authorization: { ...message, signature } };
      const requirements = {
        chainId: terms.chainId,
        token: terms.token,
        payTo: terms.payTo,
        amount: String(terms.amount),
        requiredAttestations: requiredAttestations(),
      };
      setStatus({ msg: settle ? "Settling through the gate…" : "Checking eligibility (no payment)…" });
      const res = await fetch(FACILITATOR + (settle ? "/settle" : "/verify"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload, requirements, surface: "checkout" }),
      });
      const body = await res.json();
      setOut(body);
      if (body.ok && settle) setStatus({ msg: "Settled — USDC moved through the gate.", kind: "ok" });
      else if (body.ok) setStatus({ msg: "Eligible — you pass the gate (no payment made).", kind: "ok" });
      else setStatus({ msg: `Blocked at ${body.stage || "gate"}: ${(body.reasons || []).join("; ") || body.error || "not approved"}`, kind: "err" });
    } catch (e) {
      setStatus({ msg: String((e as Error)?.message ?? e), kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section style={{ padding: "40px 0 8px" }}>
        <p className="section-title">Checkout</p>
        <h2>Try the gate</h2>
        <p className="lede" style={{ fontSize: 17 }}>
          <b>Check eligibility</b> runs the real ENS + Intercepta checks with <b>no payment</b> (no USDC needed) — perfect
          right after you <a href="/get-verified">get verified</a>. <b>Pay</b> also settles 0.01 USDC (needs USDC in your wallet).
        </p>
      </section>

      <div className="card" style={{ maxWidth: 560 }}>
        <label>Your BSA Gate name<input value={ensName} onChange={(e) => setEns(e.target.value)} /></label>
        <div className="row" style={{ marginTop: 10 }}>
          {PRESETS.map((p) => (
            <button key={p} className="pill mut" style={{ cursor: "pointer", background: ensName === p ? "var(--accent-weak)" : undefined }} onClick={() => setEns(p)}>
              {p.split(".")[0]}
            </button>
          ))}
        </div>

        <p style={{ marginTop: 18, marginBottom: 2, fontWeight: 600, fontSize: 13 }}>What this merchant requires</p>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
          <input type="checkbox" checked={reqOver18} onChange={(e) => setReqOver18(e.target.checked)} style={{ width: 18, height: 18 }} /> Over 18
        </label>
        <label>Jurisdiction
          <select value={reqJur} onChange={(e) => setReqJur(e.target.value)}>
            {JURISDICTIONS.map((j) => <option key={j} value={j}>{j || "any"}</option>)}
          </select>
        </label>

        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn" disabled={busy} onClick={() => run(false)}>{busy ? "Working…" : "Check eligibility (free)"}</button>
          <button className="btn ghost" disabled={busy} onClick={() => run(true)}>Pay 0.01 USDC</button>
        </div>
        <p className={"status " + (status.kind || "")}>{status.msg}</p>
      </div>

      {out ? <pre style={{ maxWidth: 560, marginTop: 16 }}>{JSON.stringify(out, null, 2)}</pre> : null}
    </>
  );
}
