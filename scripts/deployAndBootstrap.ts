// Deploys the six contracts (or reuses an existing deployment) and sets up all roles, names and token approvals,
// without running any scenario and without needing the simulator. Useful as a clean first step on a new network,
// most importantly Sepolia: the six contract addresses only exist after a deployment, and the simulator's
// application-local.properties needs them before fullBatchFlow.ts can get past its first simulator call.
//   $env:NETWORK = "sepolia"
//   npx hardhat run scripts/deployAndBootstrap.ts
import { deployAndBootstrap } from "./lib/chainSetup.js";

const NETWORK = process.env.NETWORK ?? "localhost";

console.log(`Deploying and setting up roles on "${NETWORK}"...\n`);
const { contracts } = await deployAndBootstrap(NETWORK);

for (const [name, contract] of Object.entries(contracts)) {
  console.log(`${name.padEnd(14)} ${await contract.getAddress()}`);
}
console.log("\nAlso written to ignition/deployments/<chain-id>/deployed_addresses.json");
console.log("Next: put these addresses into the simulator's application-local.properties, then run fullBatchFlow.ts.");
