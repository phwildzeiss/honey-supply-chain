// Generates a fresh BIP-39 mnemonic for the Sepolia runner accounts.
// (`npx hardhat run scripts/createMnemonic.ts`)
//
// Use a mnemonic dedicated to this thesis, not one that also holds real funds: it derives account #0 (admin),
// #1-3 (lab, award body, certification body) and #4-7 (beekeeper, bottler, retailer, logistics) with the same
// derivation path Hardhat and MetaMask use (m/44'/60'/0'/0/<index>), so the addresses match fullBatchFlow.ts
// and can be imported into MetaMask for the GUI.
//
// After this prints, store the mnemonic in the Hardhat keystore, it is then encrypted at rest and never
// written to a file in this repo:
//   npx hardhat keystore set SEPOLIA_MNEMONIC
//   npx hardhat keystore set SEPOLIA_RPC_URL
import { ethers } from "ethers";

const ACCOUNT_ROLES = [
  "admin (deployment, roles)",
  "lab",
  "award body",
  "certification body",
  "beekeeper",
  "bottler",
  "retailer",
  "logistics",
];

const wallet = ethers.Wallet.createRandom();
const phrase = wallet.mnemonic?.phrase;
if (!phrase) throw new Error("Could not generate a mnemonic");

console.log("New mnemonic (store it now, it is not saved anywhere by this script):\n");
console.log(phrase);
console.log("\nDerived accounts:\n");
for (const [index, role] of ACCOUNT_ROLES.entries()) {
  const account = ethers.HDNodeWallet.fromPhrase(phrase, undefined, `m/44'/60'/0'/0/${index}`);
  console.log(`  #${index} ${role.padEnd(28)} ${account.address}`);
}
console.log("\nNext: send Sepolia ETH to account #0, then store the mnemonic:");
console.log("  npx hardhat keystore set SEPOLIA_MNEMONIC");
console.log("  npx hardhat keystore set SEPOLIA_RPC_URL");
