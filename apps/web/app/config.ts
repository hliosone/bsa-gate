export const FACILITATOR = process.env.NEXT_PUBLIC_FACILITATOR_URL ?? "http://localhost:8787";
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111);
export const USDC = (process.env.NEXT_PUBLIC_USDC ?? "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238") as `0x${string}`;
export const DOMAIN = {
  name: process.env.NEXT_PUBLIC_USDC_NAME ?? "USDC",
  version: process.env.NEXT_PUBLIC_USDC_VERSION ?? "2",
  chainId: CHAIN_ID,
  verifyingContract: USDC,
};
export const EIP3009_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

// Principal-signed cap update (must match the facilitator's policy.CAP_EIP712).
export const SETCAP_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
  ],
  SetCap: [
    { name: "agentName", type: "string" },
    { name: "cap", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};
export const SETCAP_DOMAIN = { name: "BSA Gate", version: "1", chainId: CHAIN_ID };

export function randomNonce(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return "0x" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function eth(): any {
  const e = (globalThis as any).ethereum;
  if (!e) throw new Error("No EVM wallet found. Install MetaMask.");
  return e;
}

export async function connect(): Promise<string> {
  const e = eth();
  const [addr] = await e.request({ method: "eth_requestAccounts" });
  const want = "0x" + CHAIN_ID.toString(16);
  if ((await e.request({ method: "eth_chainId" })) !== want) {
    await e.request({ method: "wallet_switchEthereumChain", params: [{ chainId: want }] });
  }
  return addr;
}
