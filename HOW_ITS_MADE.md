# How it's made

BSA Gate inserts one checkpoint before a stablecoin payment settles: it decides **who may pay**
(ENSv2 permissions) and **whether the payment is safe** (Intercepta), then settles USDC over x402.

## Architecture

One facilitator gate, two checks, three front doors (an AI agent paying an x402 API, a WooCommerce
checkout, a Shopify checkout). The gate is `packages/facilitator/src/gate.ts`:

```
evaluate() = verifyAuthorization (EIP-3009) → cap → resolvePayerIdentity + checkAttestations (ENS) → screen (Intercepta) → settleAuthorization
```

Money-safe development: everything is built and tested against a **local Anvil fork of Sepolia**
(the real ENS/USDC contracts are copied in, so registrations/settlements are free); a single
tiny-value pass runs against live Sepolia at the end. `RPC_MODE=fork|live` switches transport.

## How ENSv2 is used (and why it's load-bearing)

Files: `packages/ens/src/ens.ts` (ops), `packages/facilitator/src/{issuer,ensGate}.ts`.

- **Namespace**: BSA Gate deploys a shared `PermissionedResolver` + a `bsagate.eth` `UserRegistry`
  via the `VerifiableFactory` (`deployProxy(impl, salt, initialize(admin, roleBitmap))`).
- **Identity**: `issueIdentity` deploys the principal's own `UserRegistry` (so agents don't
  collide across users — registry aliasing shares whole namespaces), grants the principal
  `ROLE_UNREGISTER` (root) as a kill switch, and registers `<label>.bsagate.eth` owned by the
  principal with `roleBitmap = ROLE_RENEW` only — **no** `SET_RESOLVER`/`SET_SUBREGISTRY`/`CAN_TRANSFER`.
- **Attestations**: `over18`/`jurisdiction` are `setText` records on the shared resolver, written
  only by the issuer (the principal holds no resolver roles → cannot forge them).
- **Delegation**: `delegateAgent` registers `agent.<user>.bsagate.eth` in the principal's registry
  with an empty owner bitmap (non-transferable). Revocation = the principal `unregister`s it.
- **Gate read**: `resolvePayerIdentity` **walks the registries** (`getState` → `getSubregistry`),
  asserts the leaf is `REGISTERED`, unexpired and owned by the EIP-3009 `from`, then reads the
  attestations on the first-level identity name. Remove ENSv2 and there is nothing to issue,
  attest, delegate, revoke or check.

Verified invariants (`packages/ens/src/ens.test.ts`): owner cannot forge `over18`; owner cannot
mint their own agents; ownership/subregistry hierarchy is correct.

## How Intercepta is used

File: `packages/facilitator/src/intercepta.ts`, called from `gate.ts` (stage 3, before settle).
It screens the payer and payee via **Quick Scan Address**
(`GET /api/public/v2/extension/account/{address}/quick-scan`, header `X-API-KEY`), blocking on a
sanction/scam/mixer trait or a toxic score over a threshold. Intercepta's data is mainnet, so we
screen the real mainnet addresses even though settlement is on a testnet (per Intercepta's guidance).
When `INTERCEPTA_API_KEY` is set the call is live; otherwise a dev stub (`INTERCEPTA_TEST_DENYLIST`)
keeps flows testable — the submitted demo uses the live call.

## x402 / EIP-3009 settlement

File: `packages/facilitator/src/eip3009.ts`. The payer signs a gasless
`TransferWithAuthorization` (EIP-712) for Circle USDC on Sepolia; the facilitator verifies the
signature, recipient, amount, time window and nonce-reuse, then submits `transferWithAuthorization`
(it pays gas; it never holds funds). We **read and verify the token's real EIP-712 domain**
(`name`/`version` against the on-chain `DOMAIN_SEPARATOR`) rather than assuming it. The x402 loop
is `GET /demo/quote` → `402` + terms → sign → `X-PAYMENT` → `200`.

## Technologies
TypeScript, viem, `@ensdomains/ensjs`(+`-abi`) `sepolia-fix`, Foundry/Anvil (fork), Express, vitest, pnpm workspaces.

## Notable / hacky bits
- **ensjs addresses ≠ the docs "deployments" page** — the docs list a pre-redeploy set; the
  authoritative post-2026-09-15 addresses come from the `sepolia-fix` package. Sourcing from the
  package (not a doc summary) saved us from building on dead contracts.
- **`grantRoles` rejects `ROOT_RESOURCE`** — root grants must use `grantRootRoles`.
- **PermissionedResolver `getSubregistry` takes the string label**, not the labelhash.
- Anvil forks against a non-archival RPC lose pinned historical state after ~25 min — re-fork at
  latest for long sessions.
