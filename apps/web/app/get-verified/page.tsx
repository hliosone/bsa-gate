"use client";
import { useState } from "react";
import { FACILITATOR, connect } from "../config";

const JURISDICTIONS = ["CH", "FR", "DE", "US", "GB", "JP"];
const rnd = () => Math.random().toString(36).slice(2, 6);

export default function GetVerified() {
  const [addr, setAddr] = useState("");
  const [handle, setHandle] = useState("guest-" + rnd());
  const [over18, setOver18] = useState(true);
  const [jurisdiction, setJurisdiction] = useState("CH");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ msg: string; kind?: string }>({ msg: "" });
  const [issued, setIssued] = useState<string | null>(null);

  async function onConnect() {
    try { setAddr(await connect()); } catch (e) { setStatus({ msg: String((e as Error)?.message ?? e), kind: "err" }); }
  }

  async function getVerified() {
    setBusy(true);
    setIssued(null);
    setStatus({ msg: "Connecting…" });
    try {
      const owner = addr || (await connect());
      setAddr(owner);
      const label = (handle.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || "guest") + "-" + rnd();
      setStatus({ msg: "Issuing your on-chain identity…" });
      const r = await fetch(FACILITATOR + "/admin/issue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, owner, attestations: { over18: over18 ? "true" : "false", jurisdiction } }),
      });
      const out = await r.json();
      if (!r.ok || out.error) {
        setStatus({ msg: out.error || "Issue failed — try a different handle.", kind: "err" });
        return;
      }
      setIssued(out.name);
      setStatus({ msg: "Verified. Your identity is live on-chain.", kind: "ok" });
    } catch (e) {
      setStatus({ msg: String((e as Error)?.message ?? e), kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section style={{ padding: "40px 0 8px" }}>
        <p className="section-title">Get verified</p>
        <h2>Issue yourself a BSA Gate identity</h2>
        <p className="lede" style={{ fontSize: 17 }}>
          Connect your wallet, pick your traits, and the issuer mints you a <span className="mono">&lt;handle&gt;.bsagate.eth</span>{" "}
          identity with attestations only the issuer can write. Then try the checkout — the gate reads your real
          attestations and decides. (Demo: you self-select traits; in production these come from real KYC.)
        </p>
      </section>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="row">
          <button className="btn" onClick={onConnect}>
            {addr ? `Connected ${addr.slice(0, 6)}…${addr.slice(-4)}` : "Connect wallet"}
          </button>
        </div>
        <label>Handle<input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="guest-1a2b" /></label>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, fontSize: 14 }}>
          <input type="checkbox" checked={over18} onChange={(e) => setOver18(e.target.checked)} style={{ width: 18, height: 18 }} />
          I am over 18
        </label>
        <label>Jurisdiction
          <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
            {JURISDICTIONS.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
        </label>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" disabled={busy} onClick={getVerified}>{busy ? "Working…" : "Get verified"}</button>
        </div>
        <p className={"status " + (status.kind || "")}>{status.msg}</p>
        {issued && (
          <p style={{ marginTop: 12 }}>
            Issued <span className="mono">{issued}</span>. →{" "}
            <a href={`/checkout?name=${encodeURIComponent(issued)}`}>Try the checkout with this identity →</a>
          </p>
        )}
      </div>
    </>
  );
}
