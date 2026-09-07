// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {HoneyToken} from "./HoneyToken.sol";

contract HoneyTokenTest is Test {
    HoneyToken internal token;
    uint256 internal constant JAR_FLAG = 1 << 255;
    uint256 internal constant JAR_SIZE_SHIFT = 223;
    uint256 internal constant BATCH_ID_MASK = (1 << JAR_SIZE_SHIFT) - 1;

    function setUp() public {
        token = new HoneyToken("");
    }

    function testFuzz_GetTokenDataDecodesBulkId(uint256 batchId) public view {
        batchId = bound(batchId, 0, BATCH_ID_MASK);

        (uint256 decodedBatchId, bool isJar, uint32 jarSizeGrams, , ) = token.getTokenData(batchId);

        assertEq(decodedBatchId, batchId);
        assertFalse(isJar);
        assertEq(jarSizeGrams, 0);
    }

    function testFuzz_GetTokenDataDecodesJarId(uint256 batchId, uint32 jarSizeGrams) public view {
        batchId = bound(batchId, 0, BATCH_ID_MASK);

        uint256 jarId = batchId | (uint256(jarSizeGrams) << JAR_SIZE_SHIFT) | JAR_FLAG;
        (uint256 decodedBatchId, bool isJar, uint32 decodedJarSize, , ) = token.getTokenData(jarId);

        assertEq(decodedBatchId, batchId);
        assertTrue(isJar);
        assertEq(decodedJarSize, jarSizeGrams);
    }
}
