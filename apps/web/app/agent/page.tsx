"use client";
import { useState } from "react";
import { FACILITATOR, connect } from "../config";

export default function AgentPage() {
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [userLabel, setUserLabel] = useState("alice");
  const [att, setAtt] = useState('{"over18":"true","jurisdiction":"CH"}');
  const [agentLabel, setAgentLabel] = useState("agent");
  const [owner, setOwner] = useState("");
  const [capName, setCapName] = useState("agent.alice.bsagate.eth");
  const [capUsdc, setCapUsdc] = useState("50");

  const say = (o: unknown) => setLog(JSON.stringify(o, null, 2));

  async function post(path: string, body?: unknown) {
    setBusy(true);
    try {
      const r = await fetch(FACILITATOR + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      say(await r.json());
    } catch (e) {
      say({ error: String((e as Error)?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  async function onConnect() {
    try {
      const a = await connect();
      setAddr(a);
      if (!owner) setOwner(a);
    } catch (e) {
      say({ error: String((e as Error)?.message ?? e) });
    }
  }

  return (
    <>
      <section style={{ padding: "40px 0 8px" }}>
        <p className="section-title">Issuer console</p>
        <h2>Manage identities & agents</h2>
        <p className="lede" style={{ fontSize: 17 }}>
          Stand up the namespace, issue a KYC&rsquo;d identity, delegate a revocable agent, and cap what it may spend.
          In production the principal signs their own revoke — their on-chain kill switch; here the issuer mediates for
          the demo.
        </p>
      </section>

      <div className="row">
        <button className="btn" onClick={onConnect}>
          {addr ? `Connected ${addr.slice(0, 6)}…${addr.slice(-4)}` : "Connect wallet"}
        </button>
        <button className="btn ghost" disabled={busy} onClick={() => post("/admin/setup")}>Setup namespace</button>
      </div>

      <div className="grid cols-3" style={{ marginTop: 18, alignItems: "start" }}>
        <div className="card">
          <h3>Issue identity</h3>
          <label>Label<input value={userLabel} onChange={(e) => setUserLabel(e.target.value)} /></label>
          <label>Owner address<input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="0x… (defaults to connected)" /></label>
          <label>Attestations (JSON)<input value={att} onChange={(e) => setAtt(e.target.value)} /></label>
          <div className="row" style={{ marginTop: 14 }}>
            <button
              className="btn sm"
              disabled={busy}
              onClick={() => {
                let a: unknown;
                try { a = JSON.parse(att); } catch { return say({ error: "attestations must be valid JSON" }); }
                return post("/admin/issue", { label: userLabel, owner: owner || addr, attestations: a });
              }}
            >Issue</button>
          </div>
        </div>

        <div className="card">
          <h3>Delegate / revoke agent</h3>
          <label>User label<input value={userLabel} onChange={(e) => setUserLabel(e.target.value)} /></label>
          <label>Agent label<input value={agentLabel} onChange={(e) => setAgentLabel(e.target.value)} /></label>
          <label>Agent owner address<input value={owner} onChange={(e) => setOwner(e.target.value)} /></label>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn sm" disabled={busy} onClick={() => post("/admin/delegate", { userLabel, agentLabel, agentOwner: owner || addr })}>Delegate</button>
            <button className="btn sm ghost" disabled={busy} onClick={() => post("/admin/revoke", { userLabel, agentLabel })}>Revoke</button>
          </div>
        </div>

        <div className="card">
          <h3>Spend cap</h3>
          <p style={{ marginTop: 0 }}>A per-payment ceiling on the agent, enforced by the gate. In this demo the issuer sets it; principal-signed updates are next.</p>
          <label>Agent name<input value={capName} onChange={(e) => setCapName(e.target.value)} /></label>
          <label>Cap (USDC)<input value={capUsdc} onChange={(e) => setCapUsdc(e.target.value)} placeholder="e.g. 50" /></label>
          <div className="row" style={{ marginTop: 14 }}>
            <button
              className="btn sm"
              disabled={busy}
              onClick={() => {
                const n = Number(capUsdc);
                if (!Number.isFinite(n) || n <= 0) return say({ error: "cap must be a positive number of USDC" });
                return post("/policy/cap", { agentName: capName, cap: String(Math.round(n * 1e6)) });
              }}
            >Set cap</button>
            <button className="btn sm ghost" disabled={busy} onClick={() => post("/policy/cap", { agentName: capName, cap: null })}>Clear</button>
          </div>
        </div>
      </div>

      {log && <pre style={{ marginTop: 18 }}>{log}</pre>}
    </>
  );
}
