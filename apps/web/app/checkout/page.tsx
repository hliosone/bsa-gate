"use client";
import { useState } from "react";
import { FACILITATOR, DOMAIN, EIP3009_TYPES, connect, eth, randomNonce } from "../config";

export default function CheckoutPage() {
  const [ensName, setEns] = useState("agent.alice.bsagate.eth");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ msg: string; kind?: string }>({ msg: "" });
  const [out, setOut] = useState<unknown>(null);

  async function pay() {
    setBusy(true);
    setOut(null);
    setStatus({ msg: "Connecting…" });
    try {
      const from = await connect();
      setStatus({ msg: "Fetching payment terms…" });
      const probe = await fetch(FACILITATOR + "/demo/quote");
      if (probe.status !== 402) {
        setStatus({ msg: "Resource is not gated.", kind: "err" });
        return;
      }
      const terms = (await probe.json()).accepts[0] as { payTo: string; amount: string };
      const now = Math.floor(Date.now() / 1000);
      const message = {
        from,
        to: terms.payTo,
        value: String(terms.amount),
        validAfter: "0",
        validBefore: String(now + 3600),
        nonce: randomNonce(),
      };
      const typedData = { types: EIP3009_TYPES, domain: DOMAIN, primaryType: "TransferWithAuthorization", message };
      setStatus({ msg: "Sign the authorization in your wallet…" });
      const signature = await eth().request({ method: "eth_signTypedData_v4", params: [from, JSON.stringify(typedData)] });
      const header = btoa(JSON.stringify({ ensName, authorization: { ...message, signature } }));
      setStatus({ msg: "Submitting to BSA Gate…" });
      const res = await fetch(FACILITATOR + "/demo/quote", { headers: { "X-PAYMENT": header } });
      const body = await res.json();
      setOut(body);
      if (res.status === 200) setStatus({ msg: "Settled ✓", kind: "ok" });
      else setStatus({ msg: "Blocked: " + ((body.reasons || []).join("; ") || body.error || "not approved"), kind: "err" });
    } catch (e) {
      setStatus({ msg: String((e as Error)?.message ?? e), kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Checkout demo</h1>
      <p className="lede">
        A merchant selling 18+ content requires <span className="mono">over18=true</span>. Pay 0.01 USDC through
        the gate. Try <span className="mono">agent.alice.bsagate.eth</span> (passes) vs{" "}
        <span className="mono">bob.bsagate.eth</span> (blocked — not 18+).
      </p>
      <div className="card">
        <label>Your BSA Gate name<input value={ensName} onChange={(e) => setEns(e.target.value)} /></label>
        <div className="row">
          <button className="btn" disabled={busy} onClick={pay}>Connect wallet &amp; pay 0.01 USDC</button>
        </div>
        <p className={"status " + (status.kind || "")}>{status.msg}</p>
      </div>
      {out ? <pre>{JSON.stringify(out, null, 2)}</pre> : null}
    </>
  );
}
