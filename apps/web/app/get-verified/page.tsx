"use client";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { FACILITATOR, connect } from "../config";

const JURISDICTIONS = ["CH", "FR", "DE", "US", "GB", "JP"];
const rnd = () => Math.random().toString(36).slice(2, 6);
const TERMINAL = new Set(["verified", "rejected", "wallet_error"]);

export default function GetVerified() {
  const [addr, setAddr] = useState("");
  const [handle, setHandle] = useState("guest-" + rnd());

  // Right column: self-issue (demo fallback)
  const [over18, setOver18] = useState(true);
  const [jurisdiction, setJurisdiction] = useState("CH");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ msg: string; kind?: string }>({ msg: "" });
  const [issued, setIssued] = useState<string | null>(null);

  // Left column: EU wallet (real KYC)
  const [session, setSession] = useState<{ sessionId: string; walletUrl: string } | null>(null);
  const [eudi, setEudi] = useState<{ msg: string; kind?: string }>({ msg: "" });
  const [eudiResult, setEudiResult] = useState<{ name: string; attestations: Record<string, string> } | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  async function onConnect() {
    try { setAddr(await connect()); } catch (e) { setStatus({ msg: String((e as Error)?.message ?? e), kind: "err" }); }
  }

  // ---- Right: self-issue ----
  async function selfIssue() {
    setBusy(true); setIssued(null); setStatus({ msg: "Connecting..." });
    try {
      const owner = addr || (await connect()); setAddr(owner);
      const label = (handle.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || "guest") + "-" + rnd();
      setStatus({ msg: "Issuing your on-chain identity..." });
      const r = await fetch(FACILITATOR + "/admin/issue", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, owner, attestations: { over18: over18 ? "true" : "false", jurisdiction } }),
      });
      const out = await r.json();
      if (!r.ok || out.error) { setStatus({ msg: out.error || "Issue failed. Try a different handle.", kind: "err" }); return; }
      setIssued(out.name);
      setStatus({ msg: "Verified. Your identity is live on-chain.", kind: "ok" });
    } catch (e) { setStatus({ msg: String((e as Error)?.message ?? e), kind: "err" }); }
    finally { setBusy(false); }
  }

  // ---- Left: EU wallet ----
  async function startEudi() {
    setEudiResult(null); setSession(null); setEudi({ msg: "Connecting..." });
    try {
      const owner = addr || (await connect()); setAddr(owner);
      setEudi({ msg: "Creating a verification request..." });
      const r = await fetch(FACILITATOR + "/kyc/eudi/start", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: handle, owner }),
      });
      const out = await r.json();
      if (!r.ok || !out.walletUrl) { setEudi({ msg: out.error || "Could not start verification.", kind: "err" }); return; }
      setSession({ sessionId: out.sessionId, walletUrl: out.walletUrl });
      setEudi({ msg: "Scan the QR with your EU identity wallet (e.g. Procivis One)." });
    } catch (e) { setEudi({ msg: String((e as Error)?.message ?? e), kind: "err" }); }
  }

  useEffect(() => {
    if (!session || eudiResult) return;
    const tick = async () => {
      try {
        const r = await fetch(`${FACILITATOR}/kyc/eudi/status/${session.sessionId}`);
        const st = await r.json();
        if (st.state === "pending") setEudi({ msg: st.scanned ? "Confirm sharing in your wallet..." : "Scan the QR with your EU identity wallet (e.g. Procivis One)." });
        else if (st.state === "verified") { setEudiResult({ name: st.name, attestations: st.attestations || {} }); setEudi({ msg: "Verified from your digital ID. Identity issued.", kind: "ok" }); }
        else if (st.state === "rejected") setEudi({ msg: `The verifier rejected the credential: ${st.cause}`, kind: "err" });
        else if (st.state === "wallet_error") setEudi({ msg: "Sharing was declined, or no matching PID in the wallet.", kind: "err" });
        if (TERMINAL.has(st.state) && poll.current) { clearInterval(poll.current); poll.current = null; }
      } catch { /* keep polling */ }
    };
    poll.current = setInterval(tick, 2000);
    tick();
    return () => { if (poll.current) { clearInterval(poll.current); poll.current = null; } };
  }, [session, eudiResult]);

  const done = eudiResult?.name ?? issued;

  return (
    <>
      <section style={{ padding: "40px 0 8px" }}>
        <p className="section-title">Get verified</p>
        <h2>Get your BSA Gate identity</h2>
        <p className="lede" style={{ fontSize: 17 }}>
          Verify with a real EU digital identity wallet, or, if you do not have one, self-issue a demo identity. Either
          way you get a <span className="mono">&lt;handle&gt;.bsagate.eth</span> name you own, with attestations only the
          issuer can write. Then try the <a href="/checkout">checkout</a>.
        </p>
      </section>

      <div className="card" style={{ maxWidth: 620 }}>
        <div className="row">
          <button className="btn" onClick={onConnect}>
            {addr ? `Connected ${addr.slice(0, 6)}...${addr.slice(-4)}` : "Connect wallet"}
          </button>
        </div>
        <label>Handle (your name will be &lt;handle&gt;.bsagate.eth)
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="guest-1a2b" />
        </label>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16, alignItems: "start" }}>
        {/* LEFT: real EU wallet */}
        <div className="card">
          <span className="pill mut">Recommended</span>
          <h3 style={{ marginTop: 10 }}>Verify with an EU digital identity wallet</h3>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            Present your PID (ID credential). We read only your birthdate and nationality to derive <b>over 18</b> and
            <b> jurisdiction</b>. Your birthdate and name never go on-chain.
          </p>
          {!eudiResult && (
            <div className="row">
              <button className="btn" onClick={startEudi}>{session ? "New QR" : "Verify with EU wallet"}</button>
              {session && <a className="btn ghost sm" href={session.walletUrl}>Open in wallet</a>}
            </div>
          )}
          {session && !eudiResult && (
            <div style={{ marginTop: 14, display: "flex", justifyContent: "center", background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: 16 }}>
              <QRCodeSVG value={session.walletUrl} size={196} includeMargin />
            </div>
          )}
          {eudiResult && (
            <div style={{ marginTop: 12 }}>
              <p>Issued <span className="mono">{eudiResult.name}</span></p>
              <div className="row" style={{ gap: 8 }}>
                {Object.entries(eudiResult.attestations).map(([k, v]) => (
                  <span key={k} className="pill ok">{k}: {v}</span>
                ))}
              </div>
            </div>
          )}
          <p className={"status " + (eudi.kind || "")}>{eudi.msg}</p>
        </div>

        {/* RIGHT: self-issue demo */}
        <div className="card">
          <span className="pill mut">No wallet? Demo</span>
          <h3 style={{ marginTop: 10 }}>Self-issue a demo identity</h3>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            For testing without an EU wallet. You pick the traits; in production these come from the verified credential
            on the left.
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 14 }}>
            <input type="checkbox" checked={over18} onChange={(e) => setOver18(e.target.checked)} style={{ width: 18, height: 18 }} />
            I am over 18
          </label>
          <label>Jurisdiction
            <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
              {JURISDICTIONS.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          </label>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn ghost" disabled={busy} onClick={selfIssue}>{busy ? "Working..." : "Self-issue (demo)"}</button>
          </div>
          <p className={"status " + (status.kind || "")}>{status.msg}</p>
        </div>
      </div>

      {done && (
        <div className="note" style={{ marginTop: 16 }}>
          Issued <span className="mono">{done}</span>. Next:{" "}
          <a href={`/checkout?name=${encodeURIComponent(done)}`}>try the checkout</a>, or{" "}
          <a href={`/agent?name=${encodeURIComponent(done)}`}>delegate an agent</a>.
        </div>
      )}
    </>
  );
}
