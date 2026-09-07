// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

library JarSizes {
    uint32 constant GRAMS_1000 = 1000;
    uint32 constant GRAMS_500 = 500;
    uint32 constant GRAMS_250 = 250;

    function isValid(uint32 grams) internal pure returns (bool) {
        return grams == GRAMS_1000 || grams == GRAMS_500 || grams == GRAMS_250;
    }
}
