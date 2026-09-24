import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("HoneySupplyChain", (m) => {
  const tokenUri = m.getParameter("tokenUri", "");
  const alpha = m.getParameter("alpha", 8000);
  const referenceFloorPriceCents = m.getParameter("referenceFloorPriceCents", 480);

  const actorRegistry = m.contract("ActorRegistry");
  const honeyToken = m.contract("HoneyToken", [tokenUri]);
  const qualityIndex = m.contract("QualityIndex", [actorRegistry]);
  const pricingModel = m.contract("PricingModel", [actorRegistry, qualityIndex, alpha]);
  const supplyChain = m.contract("SupplyChain", [actorRegistry, honeyToken, qualityIndex]);
  const consumerGateway = m.contract("ConsumerGateway", [
    actorRegistry,
    supplyChain,
    honeyToken,
    qualityIndex,
    pricingModel,
  ]);

  m.call(honeyToken, "setSupplyChain", [supplyChain]);
  m.call(qualityIndex, "setSupplyChain", [supplyChain]);
  m.call(pricingModel, "setFloorPrice", [500, referenceFloorPriceCents]);

  return { actorRegistry, honeyToken, qualityIndex, pricingModel, supplyChain, consumerGateway };
});
