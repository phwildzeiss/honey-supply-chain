// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./JarSizes.sol";

contract HoneyToken is ERC1155, Ownable {
    uint256 private constant JAR_FLAG = 1 << 255;
    uint256 private constant JAR_SIZE_SHIFT = 223;
    uint256 private constant JAR_SIZE_MASK = (1 << 32) - 1;
    uint256 private constant BATCH_ID_MASK = (1 << JAR_SIZE_SHIFT) - 1;

    address public supplyChain;

    mapping(uint256 => uint256) public batchQuantities;
    mapping(uint256 => bool) public processedBatches;

    modifier onlySupplyChain() {
        require(
            msg.sender == supplyChain,
            "HoneyToken: caller is not SupplyChain"
        );
        _;
    }

    constructor(string memory uri_) ERC1155(uri_) Ownable(msg.sender) {}

    function setSupplyChain(address supplyChainAddress) external onlyOwner {
        supplyChain = supplyChainAddress;
    }

    function mintBulkBatch(
        uint256 batchId,
        uint256 quantity,
        address to
    ) external onlySupplyChain {
        require(batchId <= BATCH_ID_MASK, "HoneyToken: batchId too large");
        require(
            batchQuantities[batchId] == 0,
            "HoneyToken: batch already minted"
        );

        batchQuantities[batchId] = quantity;
        _mint(to, batchId, quantity, "");
    }

    function mintJars(
        uint256 batchId,
        address bulkHolder,
        uint32[] calldata jarSizesGrams,
        uint256[] calldata jarCounts,
        address jarRecipient
    ) external onlySupplyChain {
        require(batchQuantities[batchId] > 0, "HoneyToken: unknown batch");
        require(
            !processedBatches[batchId],
            "HoneyToken: batch already processed"
        );
        require(
            jarSizesGrams.length == jarCounts.length,
            "HoneyToken: length mismatch"
        );

        uint256 totalGrams;
        for (uint256 i = 0; i < jarSizesGrams.length; i++) {
            require(
                JarSizes.isValid(jarSizesGrams[i]),
                "HoneyToken: unsupported jar size"
            );
            totalGrams += uint256(jarSizesGrams[i]) * jarCounts[i];
        }
        require(
            totalGrams <= batchQuantities[batchId],
            "HoneyToken: jar total exceeds batch quantity"
        );

        _burn(bulkHolder, batchId, batchQuantities[batchId]);

        for (uint256 i = 0; i < jarSizesGrams.length; i++) {
            uint256 id = jarTokenId(batchId, jarSizesGrams[i]);
            _mint(jarRecipient, id, jarCounts[i], "");
        }
    }

    function markBatchProcessed(uint256 batchId) external onlySupplyChain {
        processedBatches[batchId] = true;
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
        isJar = (tokenId & JAR_FLAG) != 0;
        jarSizeGrams = uint32((tokenId >> JAR_SIZE_SHIFT) & JAR_SIZE_MASK);
        batchId = tokenId & BATCH_ID_MASK;
        originalQuantity = batchQuantities[batchId];
        processed = processedBatches[batchId];
    }

    function jarTokenId(uint256 batchId, uint32 grams) public pure returns (uint256) {
        return batchId | (uint256(grams) << JAR_SIZE_SHIFT) | JAR_FLAG;
    }
}
