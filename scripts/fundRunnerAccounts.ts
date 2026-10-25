import { network } from "hardhat";
import { formatEther, parseEther } from "ethers";

const NETWORK = process.env.NETWORK ?? "localhost";

const TARGETS_ETH: Record<number, { role: string; eth: string }> = {
  1: { role: "lab", eth: "0.10" },
  2: { role: "award body", eth: "0.05" },
  3: { role: "certification body", eth: "0.05" },
  4: { role: "beekeeper (runner)", eth: "0.40" },
  5: { role: "bottler", eth: "0.20" },
  6: { role: "retailer", eth: "0.10" },
  7: { role: "logistics", eth: "0.25" },
  8: { role: "beekeeper (live case study)", eth: "0.40" },
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
