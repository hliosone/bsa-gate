"use client";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { FACILITATOR, connect } from "../config";

const JURISDICTIONS = ["CH", "FR", "DE", "US", "GB", "JP"];
const rnd = () => Math.random().toString(36).slice(2, 6);
const TERMINAL = new Set(["verified", "rejected", "wallet_error", "error"]);
type Identity = { name: string; attestations: Record<string, string> };

export default function GetVerified() {
  const [addr, setAddr] = useState("");
  const [handle, setHandle] = useState("guest-" + rnd());

  // An identity this wallet already holds (fetched from the facilitator).
  const [existing, setExisting] = useState<Identity | null>(null);
  const [showVerify, setShowVerify] = useState(false);

  // Right column: self-issue (demo fallback)
  const [over18, setOver18] = useState(true);
  const [jurisdiction, setJurisdiction] = useState("CH");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ msg: string; kind?: string }>({ msg: "" });

  // Left column: EU wallet (real KYC)
  const [session, setSession] = useState<{ sessionId: string; walletUrl: string } | null>(null);
  const [eudi, setEudi] = useState<{ msg: string; kind?: string }>({ msg: "" });
  const [eudiDone, setEudiDone] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  async function checkExisting(a: string) {
    try {
      const d = await (await fetch(`${FACILITATOR}/identity/mine?owner=${a}`)).json();
      setExisting(d?.name ? { name: d.name, attestations: d.attestations || {} } : null);
    } catch { /* ignore */ }
  }

  // On load, if a wallet is already connected, look up its identity silently (no popup).
  useEffect(() => {
    const e = (globalThis as any).ethereum;
    if (!e?.request) return;
    e.request({ method: "eth_accounts" }).then((accs: string[]) => {
      if (accs?.[0]) { setAddr(accs[0]); checkExisting(accs[0]); }
    }).catch(() => {});
  }, []);

  async function onConnect() {
    try { const a = await connect(); setAddr(a); checkExisting(a); }
    catch (e) { setStatus({ msg: String((e as Error)?.message ?? e), kind: "err" }); }
  }

  // ---- Right: self-issue ----
  async function selfIssue() {
    setBusy(true); setStatus({ msg: "Connecting..." });
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
      setExisting({ name: out.name, attestations: { over18: over18 ? "true" : "false", jurisdiction } });
      setShowVerify(false);
      setStatus({ msg: "", kind: "" });
    } catch (e) { setStatus({ msg: String((e as Error)?.message ?? e), kind: "err" }); }
    finally { setBusy(false); }
  }

  // ---- Left: EU wallet ----
  async function startEudi() {
    setEudiDone(false); setSession(null); setEudi({ msg: "Connecting..." });
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
    if (!session || eudiDone) return;
    const tick = async () => {
      try {
        const st = await (await fetch(`${FACILITATOR}/kyc/eudi/status/${session.sessionId}`)).json();
        if (st.state === "pending") setEudi({ msg: st.scanned ? "Shared. Confirm in your wallet if prompted..." : "Scan the QR with your EU identity wallet (e.g. Procivis One)." });
        else if (st.state === "issuing") setEudi({ msg: "Credential verified. Issuing your identity on-chain, please wait (about 15 seconds)..." });
        else if (st.state === "verified") { setEudiDone(true); setSession(null); setExisting({ name: st.name, attestations: st.attestations || {} }); setShowVerify(false); setEudi({ msg: "", kind: "" }); }
        else if (st.state === "rejected") setEudi({ msg: `The verifier rejected the credential: ${st.cause}`, kind: "err" });
        else if (st.state === "wallet_error") setEudi({ msg: "Sharing was declined, or no matching PID in the wallet.", kind: "err" });
        else if (st.state === "error") setEudi({ msg: `Issuance failed: ${st.error}`, kind: "err" });
        if (TERMINAL.has(st.state) && poll.current) { clearInterval(poll.current); poll.current = null; }
      } catch { /* keep polling */ }
    };
    poll.current = setInterval(tick, 2000);
    tick();
    return () => { if (poll.current) { clearInterval(poll.current); poll.current = null; } };
  }, [session, eudiDone]);

  return (
    <>
      <section style={{ padding: "40px 0 8px" }}>
        <p className="section-title">Get verified</p>
        <h2>Get your BSA Gate identity</h2>
        <p className="lede" style={{ fontSize: 17 }}>
          Verify with a real EU digital identity wallet, or, if you do not have one, self-issue a demo identity. Either
          way you get a <span className="mono">&lt;handle&gt;.bsagate.eth</span> name you own, with attestations only the
          issuer can write.
        </p>
      </section>

      <div className="card" style={{ maxWidth: 620 }}>
        <div className="row">
          <button className="btn" onClick={onConnect}>
            {addr ? `Connected ${addr.slice(0, 6)}...${addr.slice(-4)}` : "Connect wallet"}
          </button>
        </div>
        {(!existing || showVerify) && (
          <label>Handle (your name will be &lt;handle&gt;.bsagate.eth)
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="guest-1a2b" />
          </label>
        )}
      </div>

      {existing && (
        <div className="card" style={{ marginTop: 16, borderColor: "var(--ok)" }}>
          <span className="pill ok">Already verified</span>
          <h3 style={{ marginTop: 10 }}>This wallet holds <span className="mono">{existing.name}</span></h3>
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            {Object.entries(existing.attestations).map(([k, v]) => <span key={k} className="pill ok">{k}: {v}</span>)}
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <a className="btn sm" href={`/checkout?name=${encodeURIComponent(existing.name)}`}>Try the checkout</a>
            <a className="btn sm ghost" href={`/agent?name=${encodeURIComponent(existing.name)}`}>Delegate an agent</a>
            {!showVerify && <button className="btn sm ghost" onClick={() => setShowVerify(true)}>Verify a different identity</button>}
          </div>
        </div>
      )}

      {(!existing || showVerify) && (
        <div className="grid cols-2" style={{ marginTop: 16, alignItems: "start" }}>
          {/* LEFT: real EU wallet */}
          <div className="card">
            <span className="pill mut">Recommended</span>
            <h3 style={{ marginTop: 10 }}>Verify with an EU digital identity wallet</h3>
            <p style={{ color: "var(--muted)", fontSize: 14 }}>
              Present your PID (ID credential). We read only your birthdate and nationality to derive <b>over 18</b> and
              <b> jurisdiction</b>. Your birthdate and name never go on-chain.
            </p>
            <div className="row">
              <button className="btn" onClick={startEudi}>{session ? "New QR" : "Verify with EU wallet"}</button>
              {session && <a className="btn ghost sm" href={session.walletUrl}>Open in wallet</a>}
            </div>
            {session && (
              <div style={{ marginTop: 14, display: "flex", justifyContent: "center", background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: 16 }}>
                <QRCodeSVG value={session.walletUrl} size={196} includeMargin />
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
      )}
    </>
  );
}
