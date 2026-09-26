import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../../.env") });

export const CHAIN_ID = 11155111 as const;
export const LIVE_RPC =
  process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
export const FORK_RPC = process.env.FORK_RPC_URL ?? "http://127.0.0.1:8545";

/** RPC_MODE=fork (default — free, for dev + tests) or live (real Sepolia). */
export const RPC_MODE = (process.env.RPC_MODE ?? "fork") as "fork" | "live";
export const RPC_URL = RPC_MODE === "live" ? LIVE_RPC : FORK_RPC;

function must(key: string, value: string): Address {
  if (!isAddress(value)) throw new Error(`Invalid address for ${key}: ${value}`);
  return value as Address;
}

/**
 * ENSv2 Sepolia addresses — sourced from @ensdomains/ensjs (sepolia-fix tag),
 * i.e. the authoritative post-2026-09-15 redeploy set. NOTE: these differ from
 * the docs "deployments" page (which lists an older set).
 */
export const ENS = {
  ethRegistry: must("ethRegistry", "0xc960f7217d3643b525ef36bec8adf86953cd9ab8"),
  verifiableFactory: must("verifiableFactory", "0xd2a632d8a8b67c2c4398c255cbd7af8dd7236198"),
  userRegistryImpl: must("userRegistryImpl", "0x0f99e7ea74903afcb7224d0354fd7428a6f92917"),
  permResolverImpl: must("permResolverImpl", "0xdce5205a553573ffd47629327dddf36186022ffa"),
  ethRegistrar: must("ethRegistrar", "0x8c2e866b439358c41ae05de9cbe8a00bfefaffca"),
  universalResolver: must("universalResolver", "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe"),
  /** ENS's own USDC used for .eth registration fees (free-mintable), NOT the payment token. */
  registrationUsdc: must("registrationUsdc", "0x3dfc8b53dafa5ebbb071a8b97678ab534ed838d9"),
} as const;

/** Circle USDC on Sepolia (full EIP-3009) — the x402 payment token. */
export const USDC = must(
  "usdc",
  process.env.USDC ?? "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
);

export const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

export type Role = "issuer" | "alice" | "agent" | "merchant" | "bob";
const PK_ENV: Record<Role, string> = {
  issuer: "ISSUER_PK",
  alice: "ALICE_PK",
  agent: "AGENT_PK",
  merchant: "MERCHANT_PK",
  bob: "BOB_PK",
};

export function account(role: Role) {
  const pk = process.env[PK_ENV[role]];
  if (!pk) throw new Error(`Missing ${PK_ENV[role]} in .env`);
  return privateKeyToAccount(pk as `0x${string}`);
}

export function wallet(role: Role) {
  return createWalletClient({ account: account(role), chain: sepolia, transport: http(RPC_URL) });
}
