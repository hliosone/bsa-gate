"use client";
import { useEffect, useState } from "react";
import { FACILITATOR } from "./config";

type Tx = {
  id: string; ts: number; surface: string; ok: boolean; stage: string; txHash?: string;
  from: string; to: string; amount: string; token: string; ensName: string; reasons?: string[];
};

const usdc = (base: string) => (Number(base) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });
const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
function ago(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/** Turn the raw gate reason into a short, human label (full text stays in the hover tooltip). */
function reasonText(t: Tx): string {
  const r = (t.reasons || []).join(" ").toLowerCase();
  if (!r) return t.ok ? "" : t.stage;
  if (r.includes("over18")) return "not verified 18+";
  if (r.includes("jurisdiction")) return "wrong jurisdiction";
  if (r.includes("cap")) return "over the spend cap";
  if (/sanction|scam|blacklist|mixer|flagged|drainer|toxic/.test(r)) {
    const traits: string[] = [];
    if (r.includes("sanction")) traits.push("sanctioned");
    if (r.includes("scam")) traits.push("known scammer");
    if (r.includes("blacklist")) traits.push("blacklisted");
    if (r.includes("mixer")) traits.push("mixer exposure");
    if (r.includes("drainer")) traits.push("wallet drainer");
    if (r.includes("toxic")) traits.push("high risk score");
    return traits.length ? `Intercepta: ${traits.join(", ")}` : "flagged by Intercepta";
  }
  if (/not registered|does not own|subname|expired/.test(r)) return "no valid identity";
  if (t.stage === "verify") return "bad payment signature";
  return t.stage;
}

export default function Activity() {
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [err, setErr] = useState(false);
  const [mode, setMode] = useState("");

  useEffect(() => {
    let live = true;
    fetch(FACILITATOR + "/health").then((r) => r.json()).then((d) => { if (live) setMode(d.mode); }).catch(() => {});
    const load = () =>
      fetch(FACILITATOR + "/transactions")
        .then((r) => r.json())
        .then((d) => { if (live) { setTxs(d.transactions ?? []); setErr(false); } })
        .catch(() => { if (live) setErr(true); });
    load();
    const t = setInterval(load, 5000);
    return () => { live = false; clearInterval(t); };
  }, []);

  const rows = txs ?? [];
  const settled = rows.filter((t) => t.ok);
  const blocked = rows.filter((t) => !t.ok);
  const volume = settled.reduce((s, t) => s + Number(t.amount), 0) / 1e6;

  return (
    <section id="activity">
      <p className="section-title">Live activity</p>
      <div className="stats">
        <div className="stat"><div className="label">Settled</div><div className="value ok">{settled.length}</div></div>
        <div className="stat"><div className="label">Blocked at the gate</div><div className="value bad">{blocked.length}</div></div>
        <div className="stat"><div className="label">USDC settled</div><div className="value">{volume.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div></div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="head">
          <h3>Recent payments</h3>
          <span className="pill mut">auto-refresh</span>
        </div>
        <div className="tbl-scroll">
          <table>
            <thead>
              <tr><th>When</th><th>Identity</th><th>Amount</th><th>Surface</th><th>Result</th><th>Reason</th><th>Tx</th></tr>
            </thead>
            <tbody>
              {txs === null && !err && <tr><td colSpan={7} className="empty">Loading…</td></tr>}
              {err && <tr><td colSpan={7} className="empty">The facilitator is not reachable right now. Try again in a moment.</td></tr>}
              {txs !== null && rows.length === 0 && !err && (
                <tr><td colSpan={7} className="empty">No payments yet. Run the checkout demo to see one here.</td></tr>
              )}
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{ago(t.ts)}</td>
                  <td className="mono">{t.ensName}</td>
                  <td className="num">{usdc(t.amount)} USDC</td>
                  <td>{t.surface}</td>
                  <td>{t.ok ? <span className="pill ok">settled</span> : <span className="pill bad">blocked · {t.stage}</span>}</td>
                  <td style={{ maxWidth: 220 }}>
                    {t.ok ? (
                      <span style={{ color: "var(--muted)" }}>all checks passed</span>
                    ) : (
                      <span title={(t.reasons || []).join("; ")}>{reasonText(t)}</span>
                    )}
                  </td>
                  <td>
                    {!t.txHash ? (
                      <span className="mono" style={{ color: "var(--muted)" }}>&middot;</span>
                    ) : mode === "live" ? (
                      <a className="mono" href={`https://sepolia.etherscan.io/tx/${t.txHash}`} target="_blank" rel="noreferrer">{short(t.txHash)}</a>
                    ) : (
                      <span className="mono" title="Settled on a local Anvil fork, not on public Sepolia.">
                        {short(t.txHash)} <span className="pill mut">local fork</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
