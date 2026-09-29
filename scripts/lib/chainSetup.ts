// Shared by fullBatchFlow.ts and deployAndBootstrap.ts, so the two never drift apart.
import { network } from "hardhat";
import HoneySupplyChainModule from "../../ignition/modules/HoneySupplyChain.js";

/**
 * Connects to the given network, deploys the six contracts (or reuses an existing deployment for that network)
 * and grants all roles, registers the actor names and sets the token approvals that fullBatchFlow.ts and the
 * GUI need. Everything here is idempotent: running it again on the same network only sends the transactions
 * that are still missing, so it is safe to call before every run.
 */
export async function deployAndBootstrap(networkName: string) {
  console.log(`Connecting to "${networkName}"...`);
  const { ethers, ignition } = await network.create({ network: networkName });
  const [admin, lab, awardBody, certBody, beekeeper, bottler, retailer, logistics] = await ethers.getSigners();

  // On a network with a slow block time (e.g. Sepolia), each transaction below waits for its own confirmation
  // before the next is sent, so a first run here can take several minutes. Every line logged is one more
  // transaction that has just been confirmed, so this is also how to tell the run is still making progress.
  console.log("Deploying contracts (or reusing an existing deployment)...");
  const { actorRegistry, honeyToken, qualityIndex, pricingModel, supplyChain, consumerGateway } =
    await ignition.deploy(HoneySupplyChainModule);
  console.log("Contracts ready.");

  // The beekeeper also holds BOTTLER_ROLE and RETAILER_ROLE for the shortened chains (bottling himself, direct marketing).
  const grants: [string, string][] = [
    ["LAB_ROLE", lab.address], ["AWARD_BODY_ROLE", awardBody.address], ["CERTIFICATION_BODY_ROLE", certBody.address],
    ["BEEKEEPER_ROLE", beekeeper.address], ["BOTTLER_ROLE", beekeeper.address], ["RETAILER_ROLE", beekeeper.address],
    ["BOTTLER_ROLE", bottler.address], ["RETAILER_ROLE", retailer.address], ["LOGISTICS_ROLE", logistics.address],
  ];
  for (const [roleName, address] of grants) {
    const role = await (actorRegistry as any)[roleName]();
    if (await actorRegistry.hasRole(role, address)) {
      console.log(`  ${roleName} for ${address} already granted.`);
      continue;
    }
    console.log(`  Granting ${roleName} to ${address}...`);
    const tx = await actorRegistry.connect(admin).grantRole(role, address);
    await tx.wait();
    console.log(`  Granted (tx ${tx.hash}).`);
  }

  const names: [string, string][] = [
    [beekeeper.address, "Imkerei Mustermann"], [bottler.address, "Abfuellbetrieb Honigmanufaktur"],
    [retailer.address, "Bio-Laden Eisenstadt"], [logistics.address, "Spedition Schnell"],
  ];
  for (const [address, name] of names) {
    if ((await actorRegistry.getActor(address)).registered) {
      console.log(`  ${address} already registered.`);
      continue;
    }
    console.log(`  Registering ${address} as "${name}"...`);
    const tx = await actorRegistry.connect(admin).registerActor(address, name);
    await tx.wait();
    console.log(`  Registered (tx ${tx.hash}).`);
  }

  // Every holder that passes the batch on needs to approve SupplyChain for the token transfer. Sent again on
  // every run rather than checked first (cheap, and isApprovedForAll would be one more round trip per holder).
  for (const holder of [beekeeper, bottler, logistics]) {
    console.log(`  Approving SupplyChain for ${holder.address}...`);
    const tx = await honeyToken.connect(holder).setApprovalForAll(await supplyChain.getAddress(), true);
    await tx.wait();
    console.log(`  Approved (tx ${tx.hash}).`);
  }
  console.log("Setup complete.\n");

  return {
    ethers,
    signers: { admin, lab, awardBody, certBody, beekeeper, bottler, retailer, logistics },
    contracts: { actorRegistry, honeyToken, qualityIndex, pricingModel, supplyChain, consumerGateway },
  };
}
