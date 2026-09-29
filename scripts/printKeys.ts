// Derives private keys from the configured Sepolia mnemonic and prints them, for entry into
// application-local.properties (#1-3: lab, award body, certification body) or for importing into MetaMask
// for the GUI (#4-7: beekeeper, bottler, retailer, logistics). Prints to the terminal only, writes nothing to
// disk and is not itself a network call other than resolving the mnemonic from the keystore.
//   npx hardhat run scripts/printKeys.ts                  # accounts 1,2,3 (default)
//   ACCOUNTS=4,5,6,7 npx hardhat run scripts/printKeys.ts  # accounts 4-7
import { config } from "hardhat";
import { HDNodeWallet } from "ethers";

const NETWORK = process.env.NETWORK ?? "sepolia";
const ACCOUNTS = (process.env.ACCOUNTS ?? "1,2,3").split(",").map((s) => Number(s.trim()));

const ACCOUNT_ROLES: Record<number, string> = {
  0: "admin", 1: "lab", 2: "award body", 3: "certification body",
  4: "beekeeper", 5: "bottler", 6: "retailer", 7: "logistics",
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
