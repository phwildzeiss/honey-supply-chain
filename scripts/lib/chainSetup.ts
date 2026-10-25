import { network } from "hardhat";
import { FeeData, parseUnits } from "ethers";
import HoneySupplyChainModule from "../../ignition/modules/HoneySupplyChain.js";


export async function deployAndBootstrap(networkName: string) {
  console.log(`Connecting to "${networkName}"...`);
  const { ethers, ignition } = await network.create({ network: networkName });
  const [admin, lab, awardBody, certBody, beekeeper, bottler, retailer, logistics, liveBeekeeper] = await ethers.getSigners();


  if (networkName === "sepolia") {
    const maxFeePerGas = parseUnits("20", "gwei");
    const maxPriorityFeePerGas = parseUnits("1", "gwei");
    ethers.provider.getFeeData = async () => new FeeData(maxFeePerGas, maxFeePerGas, maxPriorityFeePerGas);
  }


  console.log("Deploying contracts (or reusing an existing deployment)...");
  const deployed = await ignition.deploy(HoneySupplyChainModule);
  const [actorRegistry, honeyToken, qualityIndex, pricingModel, supplyChain, productGateway] = await Promise.all([
    ethers.getContractAt("ActorRegistry", await deployed.actorRegistry.getAddress()),
    ethers.getContractAt("HoneyToken", await deployed.honeyToken.getAddress()),
    ethers.getContractAt("QualityIndex", await deployed.qualityIndex.getAddress()),
    ethers.getContractAt("PricingModel", await deployed.pricingModel.getAddress()),
    ethers.getContractAt("SupplyChain", await deployed.supplyChain.getAddress()),
    ethers.getContractAt("ProductGateway", await deployed.productGateway.getAddress()),
  ]);
  console.log("Contracts ready.");


  const grants: [string, string][] = [
    ["LAB_ROLE", lab.address], ["AWARD_BODY_ROLE", awardBody.address], ["CERTIFICATION_BODY_ROLE", certBody.address],
    ["BEEKEEPER_ROLE", beekeeper.address], ["BOTTLER_ROLE", beekeeper.address], ["RETAILER_ROLE", beekeeper.address],
    ["BOTTLER_ROLE", bottler.address], ["RETAILER_ROLE", retailer.address], ["LOGISTICS_ROLE", logistics.address],
    ["BEEKEEPER_ROLE", liveBeekeeper.address], ["BOTTLER_ROLE", liveBeekeeper.address], ["RETAILER_ROLE", liveBeekeeper.address],
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
    [beekeeper.address, "Testimkerei B"], [bottler.address, "Musterabfuellbetrieb"],
    [retailer.address, "Musterhandel"], [logistics.address, "Musterspedition"],
    [liveBeekeeper.address, "Musterimkerei A"],
    [lab.address, "Musterlabor"], [certBody.address, "Musterkontrollstelle"], [awardBody.address, "Musterpraemierungsstelle"],
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

  for (const holder of [beekeeper, bottler, logistics, liveBeekeeper]) {
    console.log(`  Approving SupplyChain for ${holder.address}...`);
    const tx = await honeyToken.connect(holder).setApprovalForAll(await supplyChain.getAddress(), true);
    await tx.wait();
    console.log(`  Approved (tx ${tx.hash}).`);
  }
  console.log("Setup complete.\n");

  return {
    ethers,
    signers: { admin, lab, awardBody, certBody, beekeeper, bottler, retailer, logistics, liveBeekeeper },
    contracts: { actorRegistry, honeyToken, qualityIndex, pricingModel, supplyChain, productGateway },
  };
}
