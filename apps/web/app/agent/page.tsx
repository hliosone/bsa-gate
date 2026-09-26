"use client";
import { useEffect, useState } from "react";
import { FACILITATOR, SETCAP_DOMAIN, SETCAP_TYPES, connect, eth } from "../config";

// "guest-1a2b.bsagate.eth" -> "guest-1a2b"
const labelOf = (name: string) => name.trim().replace(/\.bsagate\.eth$/i, "").split(".").pop() || "";

export default function AgentPage() {
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [userLabel, setUserLabel] = useState("");
  const [agentLabel, setAgentLabel] = useState("agent");
  const [owner, setOwner] = useState("");
  const [capUsdc, setCapUsdc] = useState("50");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("name");
    if (p) setUserLabel(labelOf(p));
  }, []);

  const capName = userLabel ? `${agentLabel}.${userLabel}.bsagate.eth` : "";
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
      setAddr(await connect());
    } catch (e) {
      say({ error: String((e as Error)?.message ?? e) });
    }
  }

  // The principal (owner of the parent identity) signs the cap change; the agent cannot.
  async function signCap(clear: boolean) {
    if (!capName) { say({ error: "enter your identity handle first (the agent lives under it)" }); return; }
    setBusy(true);
    try {
      let capBase = "0";
      if (!clear) {
        const n = Number(capUsdc);
        if (!Number.isFinite(n) || n <= 0) { say({ error: "cap must be a positive number of USDC" }); return; }
        capBase = String(Math.round(n * 1e6));
      }
      const from = await connect(); // must be the principal, e.g. the owner of your identity
      const deadline = String(Math.floor(Date.now() / 1000) + 3600);
      const message = { agentName: capName, cap: capBase, deadline };
      const typedData = { types: SETCAP_TYPES, domain: SETCAP_DOMAIN, primaryType: "SetCap", message };
      const signature = await eth().request({ method: "eth_signTypedData_v4", params: [from, JSON.stringify(typedData)] });
      const r = await fetch(FACILITATOR + "/policy/cap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentName: capName, cap: clear ? null : capBase, deadline, signature }),
      });
      say(await r.json());
    } catch (e) {
      say({ error: String((e as Error)?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section style={{ padding: "40px 0 8px" }}>
        <p className="section-title">Agent console</p>
        <h2>Delegate an AI agent to your identity</h2>
        <p className="lede" style={{ fontSize: 17 }}>
          Your agent gets its own sub-name that it owns, inherits your attestations, and can only spend up to a cap you
          set. You can revoke it on-chain at any time. The cap change is signed by you, the principal, so the agent can
          never raise its own limit.
        </p>
      </section>

      <div className="note" style={{ maxWidth: 720 }}>
        Use the identity you created on <a href="/get-verified">Get verified</a>. Open this page from there and your
        handle is filled in automatically.
      </div>

      <div className="row">
        <button className="btn" onClick={onConnect}>
          {addr ? `Connected ${addr.slice(0, 6)}...${addr.slice(-4)}` : "Connect wallet"}
        </button>
      </div>

      <div className="grid cols-2" style={{ marginTop: 18, alignItems: "start" }}>
        <div className="card">
          <h3>Delegate or revoke an agent</h3>
          <p style={{ marginTop: 0 }}>The issuer mints <span className="mono">{capName || "agent.your-handle.bsagate.eth"}</span> owned
            by the agent&rsquo;s <b>own wallet</b> (a different address from yours). The agent signs nothing to be delegated;
            it later pays by signing a gasless authorization from that wallet. Revoke removes it instantly.</p>
          <label>Your identity handle<input value={userLabel} onChange={(e) => setUserLabel(e.target.value)} placeholder="your-handle" /></label>
          <label>Agent label<input value={agentLabel} onChange={(e) => setAgentLabel(e.target.value)} /></label>
          <label>Agent wallet address (a different wallet)<input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="0x... the agent's own wallet, not yours" /></label>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn sm" disabled={busy || !userLabel || !owner} onClick={() => {
              if (owner.trim().toLowerCase() === addr.toLowerCase()) return say({ error: "the agent must use a DIFFERENT wallet than yours (that is the point of delegation)" });
              return post("/admin/delegate", { userLabel, agentLabel, agentOwner: owner.trim() });
            }}>Delegate</button>
            <button className="btn sm ghost" disabled={busy || !userLabel} onClick={() => post("/admin/revoke", { userLabel, agentLabel })}>Revoke</button>
          </div>
        </div>

        <div className="card">
          <h3>Set the spend cap</h3>
          <p style={{ marginTop: 0 }}>A per-payment ceiling on the agent, enforced by the gate. You sign the change, so
            the agent can never raise it.</p>
          <label>Agent name<input value={capName} readOnly placeholder="delegate an agent first" /></label>
          <label>Cap (USDC)<input value={capUsdc} onChange={(e) => setCapUsdc(e.target.value)} placeholder="e.g. 50" /></label>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn sm" disabled={busy || !capName} onClick={() => signCap(false)}>Sign &amp; set cap</button>
            <button className="btn sm ghost" disabled={busy || !capName} onClick={() => signCap(true)}>Sign &amp; clear</button>
          </div>
        </div>
      </div>

      {log && <pre style={{ marginTop: 18 }}>{log}</pre>}
    </>
  );
}
