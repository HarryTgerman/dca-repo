import * as dotenv from "dotenv";

import { HardhatUserConfig } from "hardhat/config";

// PLUGINS
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-deploy";

dotenv.config()

// TASKS
// Comment this out and back in to compile without typechain artifacts

const ALCHEMY_ID = process.env.ALCHEMY_ID;

const PK_MAINNET = process.env.PK_MAINNET;
const PK = process.env.PK;

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;


// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  verify: {
    etherscan: {
      apiKey: ETHERSCAN_API_KEY ? ETHERSCAN_API_KEY : "",
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.6.6",
        settings: {
          optimizer: { enabled: true },
        },
      },
      {
        version: "0.8.13",
        settings: {
          optimizer: { enabled: true },
        },
      },
    ],
  },

  namedAccounts: {
    deployer: {
      default: 0,
    },
  },

  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },

  networks: {
    rinkeby: {
      chainId: 4,
      url: `https://eth-rinkeby.alchemyapi.io/v2/${ALCHEMY_ID}`,
      accounts: PK ? [PK] : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
};

export default config;
