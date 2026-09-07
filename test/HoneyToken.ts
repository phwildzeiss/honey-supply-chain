import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("HoneyToken", function () {
  const JAR_FLAG = 1n << 255n;
  const JAR_SIZE_SHIFT = 223n;

  function jarTokenId(batchId: bigint, jarSizeGrams: bigint) {
    return batchId | (jarSizeGrams << JAR_SIZE_SHIFT) | JAR_FLAG;
  }

  async function deploy() {
    const [admin, supplyChain, beekeeper, bottler, outsider] = await ethers.getSigners();
    const token = await ethers.deployContract("HoneyToken", [""], admin);
    await token.connect(admin).setSupplyChain(supplyChain.address);
    return { token, admin, supplyChain, beekeeper, bottler, outsider };
  }

  it("sets the deployer as owner", async function () {
    const { token, admin } = await deploy();
    expect(await token.owner()).to.equal(admin.address);
  });

  it("rejects setSupplyChain from a non-owner", async function () {
    const { token, outsider, supplyChain } = await deploy();
    await expect(token.connect(outsider).setSupplyChain(supplyChain.address)).to.revert(ethers);
  });

  it("allows SupplyChain to mint a bulk batch", async function () {
    const { token, supplyChain, beekeeper } = await deploy();
    await token.connect(supplyChain).mintBulkBatch(7, 1000, beekeeper.address);

    expect(await token.balanceOf(beekeeper.address, 7)).to.equal(1000);
    expect(await token.batchQuantities(7)).to.equal(1000);
  });

  it("rejects mintBulkBatch from a caller that is not SupplyChain", async function () {
    const { token, outsider, beekeeper } = await deploy();
    await expect(token.connect(outsider).mintBulkBatch(7, 1000, beekeeper.address)).to.revert(ethers);
  });

  it("rejects minting the same batch twice", async function () {
    const { token, supplyChain, beekeeper } = await deploy();
    await token.connect(supplyChain).mintBulkBatch(7, 1000, beekeeper.address);

    await expect(token.connect(supplyChain).mintBulkBatch(7, 100, beekeeper.address)).to.revert(ethers);
  });

  it("burns the bulk token and mints several jar sizes", async function () {
    const { token, supplyChain, beekeeper, bottler } = await deploy();
    await token.connect(supplyChain).mintBulkBatch(7, 1000, beekeeper.address);

    await token.connect(supplyChain).mintJars(7, beekeeper.address, [500, 250], [1, 2], bottler.address);

    expect(await token.balanceOf(beekeeper.address, 7)).to.equal(0);
    expect(await token.balanceOf(bottler.address, jarTokenId(7n, 500n))).to.equal(1);
    expect(await token.balanceOf(bottler.address, jarTokenId(7n, 250n))).to.equal(2);
  });

  it("rejects mintJars for an unknown batch", async function () {
    const { token, supplyChain, beekeeper, bottler } = await deploy();
    await expect(
      token.connect(supplyChain).mintJars(7, beekeeper.address, [500], [1], bottler.address),
    ).to.revert(ethers);
  });

  it("rejects mintJars when the size and count arrays have different lengths", async function () {
    const { token, supplyChain, beekeeper, bottler } = await deploy();
    await token.connect(supplyChain).mintBulkBatch(7, 1000, beekeeper.address);

    await expect(
      token.connect(supplyChain).mintJars(7, beekeeper.address, [500, 250], [1], bottler.address),
    ).to.revert(ethers);
  });

  it("rejects an unsupported jar size", async function () {
    const { token, supplyChain, beekeeper, bottler } = await deploy();
    await token.connect(supplyChain).mintBulkBatch(7, 1000, beekeeper.address);

    await expect(
      token.connect(supplyChain).mintJars(7, beekeeper.address, [333], [3], bottler.address),
    ).to.revert(ethers);
  });

  it("rejects a jar total that exceeds the batch quantity", async function () {
    const { token, supplyChain, beekeeper, bottler } = await deploy();
    await token.connect(supplyChain).mintBulkBatch(7, 1000, beekeeper.address);

    await expect(
      token.connect(supplyChain).mintJars(7, beekeeper.address, [1000], [2], bottler.address),
    ).to.revert(ethers);
  });

  it("marks a batch as processed only via markBatchProcessed", async function () {
    const { token, supplyChain } = await deploy();
    expect(await token.processedBatches(7)).to.equal(false);

    await token.connect(supplyChain).markBatchProcessed(7);

    expect(await token.processedBatches(7)).to.equal(true);
  });

  it("rejects markBatchProcessed from a caller that is not SupplyChain", async function () {
    const { token, outsider } = await deploy();
    await expect(token.connect(outsider).markBatchProcessed(7)).to.revert(ethers);
  });

  it("decodes bulk and jar token IDs correctly via getTokenData", async function () {
    const { token, supplyChain, beekeeper, bottler } = await deploy();
    await token.connect(supplyChain).mintBulkBatch(7, 1000, beekeeper.address);
    await token.connect(supplyChain).mintJars(7, beekeeper.address, [500, 250], [1, 2], bottler.address);
    await token.connect(supplyChain).markBatchProcessed(7);

    const bulkData = await token.getTokenData(7);
    expect(bulkData.batchId).to.equal(7);
    expect(bulkData.isJar).to.equal(false);
    expect(bulkData.jarSizeGrams).to.equal(0);
    expect(bulkData.originalQuantity).to.equal(1000);
    expect(bulkData.processed).to.equal(true);

    const jarData = await token.getTokenData(jarTokenId(7n, 500n));
    expect(jarData.batchId).to.equal(7);
    expect(jarData.isJar).to.equal(true);
    expect(jarData.jarSizeGrams).to.equal(500);
    expect(jarData.originalQuantity).to.equal(1000);
    expect(jarData.processed).to.equal(true);
  });
});
