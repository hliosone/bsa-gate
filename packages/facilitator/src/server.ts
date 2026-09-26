/**
 * BSA Gate facilitator HTTP API.
 *
 * The one endpoint every surface (agent, WooCommerce, Shopify) calls is POST /settle.
 * Admin routes stand up the namespace and issue identities for the demo.
 * GET /demo/quote is a self-contained x402 resource (402 -> pay -> 200).
 */
import express from "express";
import type { Address, Hex } from "viem";
import { RPC_MODE, USDC, account, wallet } from "@bsa/ens/config";
import { evaluate, type GateContext } from "./gate.js";
import { setupNamespace, issueIdentity, delegateAgent, revokeAgent } from "./issuer.js";
import { load, save } from "./deployments.js";
import type { GateResult, PaymentPayload, PaymentRequirements } from "./types.js";

const PORT = Number(process.env.PORT ?? 8787);
const app = express();
app.use(express.json());
// CORS — allow the web app (and plugins) to call the facilitator from the browser.
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT");
  if (_req.method === "OPTIONS") return void res.sendStatus(204);
  next();
});

// ── wire (JSON) <-> bigint conversions ──────────────────────────────────────
type WireReq = {
  chainId: number;
  token: Address;
  payTo: Address;
  amount: string;
  requiredAttestations?: Record<string, string>;
  maxAmount?: string | null;
};
type WirePayload = {
  ensName: string;
  authorization: {
    from: Address;
    to: Address;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: Hex;
    signature: Hex;
  };
};

const reqFromWire = (w: WireReq): PaymentRequirements => ({
  chainId: Number(w.chainId),
  token: w.token,
  payTo: w.payTo,
  amount: BigInt(w.amount),
  requiredAttestations: w.requiredAttestations ?? {},
  maxAmount: w.maxAmount != null ? BigInt(w.maxAmount) : undefined,
});
const payloadFromWire = (w: WirePayload): PaymentPayload => ({
  ensName: w.ensName,
  authorization: {
    from: w.authorization.from,
    to: w.authorization.to,
    value: BigInt(w.authorization.value),
    validAfter: BigInt(w.authorization.validAfter),
    validBefore: BigInt(w.authorization.validBefore),
    nonce: w.authorization.nonce,
    signature: w.authorization.signature,
  },
});

function context(): GateContext {
  const store = load();
  if (!store.namespace) throw new Error("namespace not set up — POST /admin/setup first");
  return {
    bsaRegistry: store.namespace.bsaRegistry,
    resolver: store.namespace.resolver,
    relayer: wallet("issuer"),
    capOf: (ensName) => {
      const c = store.agents[ensName]?.cap;
      return c ? BigInt(c) : undefined;
    },
  };
}

const wrap =
  (fn: (req: express.Request, res: express.Response) => Promise<void>) =>
  (req: express.Request, res: express.Response) =>
    fn(req, res).catch((e) => res.status(500).json({ error: String(e?.message ?? e) }));

// ── health ──────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  const store = load();
  res.json({ status: "ok", mode: RPC_MODE, namespace: store.namespace ?? null });
});

// ── admin (issuer) ────────────────────────────────────────────────────────────
app.post(
  "/admin/setup",
  wrap(async (_req, res) => {
    const store = load();
    if (store.namespace) return void res.json({ namespace: store.namespace, existing: true });
    const namespace = await setupNamespace(wallet("issuer"));
    save({ ...store, namespace });
    res.json({ namespace });
  }),
);

app.post(
  "/admin/issue",
  wrap(async (req, res) => {
    const store = load();
    if (!store.namespace) throw new Error("run /admin/setup first");
    const { label, owner, attestations } = req.body as {
      label: string;
      owner: Address;
      attestations: Record<string, string>;
    };
    const { registry, name } = await issueIdentity(wallet("issuer"), store.namespace, label, owner, attestations ?? {});
    store.users[label] = { registry, owner };
    save(store);
    res.json({ name, registry });
  }),
);

app.post(
  "/admin/delegate",
  wrap(async (req, res) => {
    const store = load();
    if (!store.namespace) throw new Error("run /admin/setup first");
    const { userLabel, agentLabel, agentOwner, cap } = req.body as {
      userLabel: string;
      agentLabel: string;
      agentOwner: Address;
      cap?: string;
    };
    const user = store.users[userLabel];
    if (!user) throw new Error(`unknown user ${userLabel}`);
    await delegateAgent(wallet("issuer"), store.namespace, user.registry, agentLabel, agentOwner);
    const agentName = `${agentLabel}.${userLabel}.bsagate.eth`;
    store.agents[agentName] = { owner: agentOwner, cap };
    save(store);
    res.json({ agentName });
  }),
);

app.post(
  "/admin/revoke",
  wrap(async (req, res) => {
    const store = load();
    const { userLabel, agentLabel } = req.body as { userLabel: string; agentLabel: string };
    const user = store.users[userLabel];
    if (!user) throw new Error(`unknown user ${userLabel}`);
    await revokeAgent(wallet("issuer"), user.registry, agentLabel);
    const agentName = `${agentLabel}.${userLabel}.bsagate.eth`;
    delete store.agents[agentName];
    save(store);
    res.json({ revoked: agentName });
  }),
);

// ── gate ──────────────────────────────────────────────────────────────────────
app.post(
  "/verify",
  wrap(async (req, res) => {
    const { payload, requirements } = req.body as { payload: WirePayload; requirements: WireReq };
    const result = await evaluate(context(), payloadFromWire(payload), reqFromWire(requirements), { settle: false });
    res.json(result as GateResult);
  }),
);

app.post(
  "/settle",
  wrap(async (req, res) => {
    const { payload, requirements } = req.body as { payload: WirePayload; requirements: WireReq };
    const result = await evaluate(context(), payloadFromWire(payload), reqFromWire(requirements));
    res.status(result.ok ? 200 : 402).json(result as GateResult);
  }),
);

// ── demo x402 resource ────────────────────────────────────────────────────────
function demoRequirements(): WireReq {
  return {
    chainId: 11155111,
    token: USDC,
    payTo: account("merchant").address,
    amount: "10000", // 0.01 USDC
    requiredAttestations: { over18: "true" },
  };
}

app.get(
  "/demo/quote",
  wrap(async (req, res) => {
    const header = req.header("X-PAYMENT");
    if (!header) {
      return void res
        .status(402)
        .json({ error: "Payment Required", accepts: [demoRequirements()] });
    }
    const payload = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as WirePayload;
    const result = await evaluate(context(), payloadFromWire(payload), reqFromWire(demoRequirements()));
    if (!result.ok) return void res.status(402).json(result);
    res.json({ quote: { pair: "ETH/USD", price: 3990.12, ts: Date.now() }, payment: result });
  }),
);

app.listen(PORT, () => console.log(`[bsa-gate] facilitator on :${PORT} (mode=${RPC_MODE})`));
