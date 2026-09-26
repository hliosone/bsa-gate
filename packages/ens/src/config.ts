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
export const RPC_URL =
  process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

function addr(key: string, fallback: string): Address {
  const value = (process.env[key] ?? fallback) as Address;
  if (!isAddress(value)) throw new Error(`Invalid address for ${key}: ${value}`);
  return value;
}

/** Pinned ENSv2 (Sepolia) + USDC addresses; env overrides the fallback. */
export const ADDRESSES = {
  rootRegistry: addr("ENS_ROOT_REGISTRY", "0x9703dbd26dab89504490994138cf2c575251a9ce"),
  ethRegistry: addr("ENS_ETH_REGISTRY", "0x657ea849311d3d5823348dded7c2aaafb3ede09e"),
  universalResolver: addr("ENS_UNIVERSAL_RESOLVER", "0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3"),
  verifiableFactory: addr("ENS_VERIFIABLE_FACTORY", "0x9e726eb570beb6bceb495ab8cda7df517d4e841c"),
  permResolverImpl: addr("ENS_PERMISSIONED_RESOLVER_IMPL", "0x14f09fd05d4585759e54844dc9b00147131cf243"),
  ethRegistrar: addr("ENS_ETH_REGISTRAR", "0xabe76f6c8dfced81aa5a2bb8034202a7136b94ca"),
  mockUsdc: addr("ENS_MOCK_USDC", "0x16f95d91dba7da3aca778ec053df0ff6c6a8aa8e"),
  usdc: addr("USDC", "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"),
} as const;

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
