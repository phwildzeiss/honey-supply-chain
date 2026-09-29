// Tops up the runner accounts #1-7 from account #0 up to a target balance. Sends only the missing amount, so it
// is cheap and safe to run again. Assumes account #0 already has ETH (Sepolia faucet or a transfer from your own wallet).
//   $env:NETWORK = "sepolia"
//   npx hardhat run scripts/fundRunnerAccounts.ts
// network.create() picks the network from the NETWORK environment variable, not from --network, so that flag has
// no effect here; passing --network sepolia would silently run this against "localhost" instead.
import { network } from "hardhat";
import { formatEther, parseEther } from "ethers";

const NETWORK = process.env.NETWORK ?? "localhost";

// Target balances, derived from the gas measured by fullBatchFlow.ts on the local node at roughly 5 gwei, with
// headroom for several runs and (for #4-7) GUI sessions.
const TARGETS_ETH: Record<number, { role: string; eth: string }> = {
  1: { role: "lab", eth: "0.10" },
  2: { role: "award body", eth: "0.05" },
  3: { role: "certification body", eth: "0.05" },
  4: { role: "beekeeper", eth: "0.40" },
  5: { role: "bottler", eth: "0.20" },
  6: { role: "retailer", eth: "0.10" },
  7: { role: "logistics", eth: "0.25" },
};

const { ethers } = await network.create({ network: NETWORK });
const signers = await ethers.getSigners();
const admin = signers[0];

console.log(`Network: ${NETWORK}`);
console.log(`Admin (#0, ${admin.address}) balance: ${formatEther(await ethers.provider.getBalance(admin.address))} ETH\n`);

let totalSent = 0n;
for (const [indexText, { role, eth }] of Object.entries(TARGETS_ETH)) {
  const index = Number(indexText);
  const signer = signers[index];
  const target = parseEther(eth);
  const balance = await ethers.provider.getBalance(signer.address);
  const missing = target - balance;

  if (missing <= 0n) {
    console.log(`#${index} ${role.padEnd(20)} ${signer.address}  already has ${formatEther(balance)} ETH (target ${eth})`);
    continue;
  }

  const tx = await admin.sendTransaction({ to: signer.address, value: missing });
  await tx.wait();
  totalSent += missing;
  console.log(`#${index} ${role.padEnd(20)} ${signer.address}  sent ${formatEther(missing)} ETH -> now ${eth} ETH`);
}

console.log(`\nTotal sent: ${formatEther(totalSent)} ETH`);
console.log(`Admin (#0) balance now: ${formatEther(await ethers.provider.getBalance(admin.address))} ETH`);
