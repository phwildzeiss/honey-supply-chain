// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "./ActorRegistry.sol";
import "./SupplyChain.sol";
import "./HoneyToken.sol";
import "./QualityIndex.sol";
import "./PricingModel.sol";

contract ConsumerGateway {
    ActorRegistry public actorRegistry;
    SupplyChain public supplyChain;
    HoneyToken public honeyToken;
    QualityIndex public qualityIndex;
    PricingModel public pricingModel;

    modifier onlyRole(bytes32 role) {
        require(
            actorRegistry.hasRole(role, msg.sender),
            "ConsumerGateway: missing role"
        );
        _;
    }

    constructor(
        address actorRegistryAddress,
        address supplyChainAddress,
        address honeyTokenAddress,
        address qualityIndexAddress,
        address pricingModelAddress
    ) {
        actorRegistry = ActorRegistry(actorRegistryAddress);
        supplyChain = SupplyChain(supplyChainAddress);
        honeyToken = HoneyToken(honeyTokenAddress);
        qualityIndex = QualityIndex(qualityIndexAddress);
        pricingModel = PricingModel(pricingModelAddress);
    }

    function setSupplyChain(
        address supplyChainAddress
    ) external onlyRole(actorRegistry.DEFAULT_ADMIN_ROLE()) {
        supplyChain = SupplyChain(supplyChainAddress);
    }

    function setHoneyToken(
        address honeyTokenAddress
    ) external onlyRole(actorRegistry.DEFAULT_ADMIN_ROLE()) {
        honeyToken = HoneyToken(honeyTokenAddress);
    }

    function setQualityIndex(
        address qualityIndexAddress
    ) external onlyRole(actorRegistry.DEFAULT_ADMIN_ROLE()) {
        qualityIndex = QualityIndex(qualityIndexAddress);
    }

    function setPricingModel(
        address pricingModelAddress
    ) external onlyRole(actorRegistry.DEFAULT_ADMIN_ROLE()) {
        pricingModel = PricingModel(pricingModelAddress);
    }

    function getBatchData(
        uint256 batchId
    ) external view returns (SupplyChain.Batch memory batch, address holder) {
        return supplyChain.getBatch(batchId);
    }

    function getTokenData(
        uint256 tokenId
    )
        external
        view
        returns (
            uint256 batchId,
            bool isJar,
            uint32 jarSizeGrams,
            uint256 originalQuantity,
            bool processed
        )
    {
        return honeyToken.getTokenData(tokenId);
    }

    function getQualityData(
        uint256 batchId
    )
        external
        view
        returns (
            uint256 si,
            uint256 phqi,
            uint256 mci,
            uint256 qi,
            QualityIndex.BatchState state,
            QualityIndex.GatekeeperReason reason
        )
    {
        return qualityIndex.getQualityData(batchId);
    }

    function getPrice(
        uint256 batchId,
        uint32 jarSizeGrams
    ) external view returns (uint256) {
        return pricingModel.getPrice(batchId, jarSizeGrams);
    }
}
