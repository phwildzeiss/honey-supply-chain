import { config, network } from "hardhat";
import { HDNodeWallet, formatEther } from "ethers";

const ROLES: Record<number, string> = {
  0: "admin", 1: "lab", 2: "award body", 3: "certification body",
  4: "beekeeper (runner)", 5: "bottler", 6: "retailer", 7: "logistics",
  8: "beekeeper (live case study)",
};

const networkConfig = config.networks.sepolia as { accounts?: { mnemonic: { get(): Promise<string> } } };
const mnemonic = await networkConfig.accounts!.mnemonic.get();

const { ethers } = await network.create({ network: "sepolia" });

for (let index = 0; index <= 8; index++) {
  const account = HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`);
  const balance = await ethers.provider.getBalance(account.address);
  console.log(`#${index} ${ROLES[index].padEnd(26)} ${account.address}  ${formatEther(balance)} ETH`);
}
