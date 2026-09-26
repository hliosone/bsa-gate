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
      <h1>Manage agent</h1>
      <p className="lede">
        Issuer console: stand up the namespace, issue an identity, delegate or revoke an agent. (In
        production the principal signs their own revoke — their on-chain kill switch; here the facilitator
        issuer mediates for the demo.)
      </p>
      <div className="row">
        <button className="btn" onClick={onConnect}>
          {addr ? `Connected ${addr.slice(0, 6)}…${addr.slice(-4)}` : "Connect wallet"}
        </button>
        <button className="btn ghost" disabled={busy} onClick={() => post("/admin/setup")}>
          Setup namespace
        </button>
      </div>

      <div className="card">
        <h3>Issue identity</h3>
        <label>Label<input value={userLabel} onChange={(e) => setUserLabel(e.target.value)} /></label>
        <label>Owner address<input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="0x… (defaults to connected)" /></label>
        <label>Attestations (JSON)<input value={att} onChange={(e) => setAtt(e.target.value)} /></label>
        <div className="row">
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              let a: unknown;
              try {
                a = JSON.parse(att);
              } catch {
                return say({ error: "attestations must be valid JSON" });
              }
              return post("/admin/issue", { label: userLabel, owner: owner || addr, attestations: a });
            }}
          >
            Issue
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Delegate / revoke agent</h3>
        <label>User label<input value={userLabel} onChange={(e) => setUserLabel(e.target.value)} /></label>
        <label>Agent label<input value={agentLabel} onChange={(e) => setAgentLabel(e.target.value)} /></label>
        <label>Agent owner address<input value={owner} onChange={(e) => setOwner(e.target.value)} /></label>
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => post("/admin/delegate", { userLabel, agentLabel, agentOwner: owner || addr })}>
            Delegate
          </button>
          <button className="btn ghost" disabled={busy} onClick={() => post("/admin/revoke", { userLabel, agentLabel })}>
            Revoke
          </button>
        </div>
      </div>

      {log && <pre>{log}</pre>}
    </>
  );
}
