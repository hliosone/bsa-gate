# Integration feedback

## Intercepta (Web3 Antivirus)

**Where we call it:** `packages/facilitator/src/intercepta.ts` (`screen()` → `quickScan()`),
invoked from `packages/facilitator/src/gate.ts` (stage 3, before any settlement). Endpoint:
`GET https://api.web3antivirus.io/api/public/v2/extension/account/{address}/quick-scan`,
header `X-API-KEY`; we block on sanction/scam/mixer traits or a toxic score over a threshold, and
screen both `payer` and `payTo`.

Feedback (3–5 lines):
- The address-scan verdict shape (`toxicScore` + named `traits`) maps cleanly onto a pay/block
  decision — it was easy to turn into a gate.
- Clear, well-documented point that risk data is mainnet-only; knowing to screen the mainnet
  address from a testnet flow up front saved confusion.
- One improvement with the most impact: a single "screen this payment" call that takes payer +
  payTo + token + the EIP-3009/authorization together and returns one verdict, so a facilitator
  makes one round-trip instead of three.
- _Time-to-first-successful-call and any friction: to be completed against the live key (the key
  arrives by email; our integration is live-call-ready — set `INTERCEPTA_API_KEY`)._

## ENS (ENSv2)

**Where we use it:** `packages/ens/src/ens.ts` and `packages/facilitator/src/{issuer,ensGate}.ts`.

Feedback:
- The `sepolia-fix` build of `@ensdomains/ensjs` was essential — the docs "deployments" page lists
  a pre-redeploy address set; sourcing addresses/ABIs from the package avoided building on dead
  contracts. Surfacing the current addresses more prominently in the docs would help.
- Per-key resolver authorization (`authorizeTextRoles(name, key, account)`) + registering names
  without `ROLE_SET_RESOLVER` is exactly what an attestation authority needs (owner can't forge).
  This is a genuinely differentiated capability.
- Small sharp edges that cost time: `grantRoles` reverts on `ROOT_RESOURCE` (must use
  `grantRootRoles`); `getSubregistry` takes the string label while `getState` takes the labelhash.
