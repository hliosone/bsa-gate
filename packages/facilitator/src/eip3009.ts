/**
 * EIP-3009 (transferWithAuthorization) for Circle USDC — the x402 settlement rail.
 *
 * The payer signs a gasless authorization; the facilitator submits it. We READ the
 * token's EIP-712 domain (name/version) from chain and verify it against the
 * on-chain DOMAIN_SEPARATOR rather than assuming it (per review guidance).
 */
import {
  type Address,
  type Hex,
  encodeAbiParameters,
  keccak256,
  parseSignature,
  recoverTypedDataAddress,
  stringToHex,
} from "viem";
import { publicClient } from "@bsa/ens/config";
import type { Signer } from "@bsa/ens";
import type { Eip3009Authorization } from "./types.js";

export const usdcAbi = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "version", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "DOMAIN_SEPARATOR", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  {
    name: "authorizationState",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ type: "bool" }],
  },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const EIP712_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

const DOMAIN_TYPEHASH = keccak256(
  stringToHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
);

function computeDomainSeparator(name: string, version: string, chainId: number, token: Address): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [DOMAIN_TYPEHASH, keccak256(stringToHex(name)), keccak256(stringToHex(version)), BigInt(chainId), token],
    ),
  );
}

let cachedDomain: { name: string; version: string; chainId: number; verifyingContract: Address } | null = null;

/** Read + verify the token's real EIP-712 domain (never assumed). */
export async function usdcDomain(token: Address) {
  if (cachedDomain && cachedDomain.verifyingContract === token) return cachedDomain;
  const chainId = await publicClient.getChainId();
  const name = await publicClient.readContract({ address: token, abi: usdcAbi, functionName: "name" });
  const onchain = await publicClient.readContract({ address: token, abi: usdcAbi, functionName: "DOMAIN_SEPARATOR" });
  // version() may not exist; find the version whose computed separator matches on-chain.
  const candidates: string[] = [];
  try {
    candidates.push(await publicClient.readContract({ address: token, abi: usdcAbi, functionName: "version" }));
  } catch {
    /* no version() */
  }
  candidates.push("2", "1");
  for (const version of candidates) {
    if (computeDomainSeparator(name, version, chainId, token) === onchain) {
      cachedDomain = { name, version, chainId, verifyingContract: token };
      return cachedDomain;
    }
  }
  throw new Error(`Could not match USDC EIP-712 domain for ${token} (tried versions ${candidates.join(", ")})`);
}

export function randomNonce(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return `0x${Buffer.from(b).toString("hex")}` as Hex;
}

/** Payer signs a gasless transfer authorization. */
export async function signTransferAuthorization(
  signer: Signer,
  token: Address,
  params: { to: Address; value: bigint; validAfter?: bigint; validBefore?: bigint; nonce?: Hex },
): Promise<Eip3009Authorization> {
  const domain = await usdcDomain(token);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const message = {
    from: signer.account.address,
    to: params.to,
    value: params.value,
    validAfter: params.validAfter ?? 0n,
    validBefore: params.validBefore ?? now + 3600n,
    nonce: params.nonce ?? randomNonce(),
  };
  const signature = await signer.signTypedData({
    domain,
    types: EIP712_TYPES,
    primaryType: "TransferWithAuthorization",
    message,
  });
  return { ...message, signature };
}

export type VerifyResult = { ok: boolean; reason?: string };

/** Offline-ish verification (one RPC read for nonce reuse). */
export async function verifyAuthorization(
  token: Address,
  auth: Eip3009Authorization,
  expected: { to: Address; minValue: bigint },
): Promise<VerifyResult> {
  const domain = await usdcDomain(token);
  const recovered = await recoverTypedDataAddress({
    domain,
    types: EIP712_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: auth.from,
      to: auth.to,
      value: auth.value,
      validAfter: auth.validAfter,
      validBefore: auth.validBefore,
      nonce: auth.nonce,
    },
    signature: auth.signature,
  });
  if (recovered.toLowerCase() !== auth.from.toLowerCase()) return { ok: false, reason: "signature does not match `from`" };
  if (auth.to.toLowerCase() !== expected.to.toLowerCase()) return { ok: false, reason: "wrong payment recipient" };
  if (auth.value < expected.minValue) return { ok: false, reason: "insufficient payment amount" };
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now < auth.validAfter) return { ok: false, reason: "authorization not yet valid" };
  if (now >= auth.validBefore) return { ok: false, reason: "authorization expired" };
  const used = await publicClient.readContract({
    address: token,
    abi: usdcAbi,
    functionName: "authorizationState",
    args: [auth.from, auth.nonce],
  });
  if (used) return { ok: false, reason: "authorization already used" };
  return { ok: true };
}

/** Facilitator submits the authorization on-chain, waits for the receipt, and
 *  confirms it succeeded (it pays gas; funds move payer→payee). */
export async function settleAuthorization(relayer: Signer, token: Address, auth: Eip3009Authorization): Promise<Hex> {
  const sig = parseSignature(auth.signature);
  const v = Number(sig.v ?? (sig.yParity === 1 ? 28n : 27n));
  const hash = await relayer.writeContract({
    address: token,
    abi: usdcAbi,
    functionName: "transferWithAuthorization",
    args: [auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, v, sig.r, sig.s],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`settlement reverted on-chain (${hash})`);
  return hash;
}

export async function usdcBalance(token: Address, who: Address): Promise<bigint> {
  return publicClient.readContract({ address: token, abi: usdcAbi, functionName: "balanceOf", args: [who] });
}
