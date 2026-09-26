import type { Address, Hex } from "viem";

/** An EIP-3009 transferWithAuthorization the payer signed off-chain (gasless). */
export type Eip3009Authorization = {
  from: Address;
  to: Address;
  value: bigint; // USDC base units (6 dp)
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex; // bytes32
  signature: Hex;
};

/** What the resource server / merchant demands (the x402 "accepts" terms + BSA gate). */
export type PaymentRequirements = {
  chainId: number;
  token: Address; // USDC
  payTo: Address; // merchant
  amount: bigint; // required minimum, base units
  /** BSA gate: the ENS attestations the payer's identity must carry (e.g. { over18: "true" }). */
  requiredAttestations: Record<string, string>;
  /** BSA gate: facilitator-enforced per-payment spend cap for the paying name (base units). */
  maxAmount?: bigint;
};

/** What the client sends back to pay (the x402 X-PAYMENT payload). */
export type PaymentPayload = {
  authorization: Eip3009Authorization;
  /** The ENS name the payer controls, e.g. "agent.alice.bsagate.eth" or "alice.bsagate.eth". */
  ensName: string;
};

export type GateStage = "verify" | "ens" | "intercepta" | "settle";

export type GateResult = {
  ok: boolean;
  stage: GateStage;
  reasons: string[];
  identityName?: string;
  txHash?: Hex;
};
