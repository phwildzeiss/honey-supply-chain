import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
      },
      production: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      // A dedicated test-only mnemonic, not a wallet holding real funds. Derives the same 8 accounts as the
      // local node (#0 admin, #1-3 lab/award body/certification body, #4-7 beekeeper/bottler/retailer/logistics),
      // see scripts/createMnemonic.ts and docs/FullBatchFlowBeschreibung.md.
      accounts: { mnemonic: configVariable("SEPOLIA_MNEMONIC"), count: 8 },
    },
  },
});
