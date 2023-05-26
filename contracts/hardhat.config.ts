import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";

dotenv.config({ path: "../.env.local" });

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      }
    ]
  },
  networks: {
    hardhat: {
      chainId: 1,
      forking: {
        url: process.env.MAINNET_PROVIDER || "https://eth-mainnet.alchemyapi.io/v2/xxx",
        blockNumber: 13406908,
      },
      mining: {
        auto: true,
        interval: [5000, 10000],
      },
    },
  },
};

export default config;
