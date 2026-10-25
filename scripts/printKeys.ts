import { config } from "hardhat";
import { HDNodeWallet } from "ethers";

const NETWORK = process.env.NETWORK ?? "sepolia";
const ACCOUNTS = (process.env.ACCOUNTS ?? "1,2,3").split(",").map((s) => Number(s.trim()));

const ACCOUNT_ROLES: Record<number, string> = {
  0: "admin", 1: "lab", 2: "award body", 3: "certification body",
  4: "beekeeper (runner)", 5: "bottler", 6: "retailer", 7: "logistics",
  8: "beekeeper (live case study)",
};

const networkConfig = config.networks[NETWORK];
if (networkConfig === undefined) throw new Error(`No network "${NETWORK}" in hardhat.config.ts`);
const accounts = (networkConfig as { accounts?: unknown }).accounts;
if (typeof accounts !== "object" || accounts === null || !("mnemonic" in accounts)) {
  throw new Error(`Network "${NETWORK}" is not configured with a mnemonic (accounts: { mnemonic, count })`);
}
const mnemonic = await (accounts as { mnemonic: { get(): Promise<string> } }).mnemonic.get();

console.warn("These are private keys. Do not paste them into a chat, commit them or store them in a plain file.\n");
for (const index of ACCOUNTS) {
  const account = HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`);
  const role = (ACCOUNT_ROLES[index] ?? "unknown").padEnd(20);
  console.log(`#${index} ${role} address=${account.address}  privateKey=${account.privateKey}`);
}
