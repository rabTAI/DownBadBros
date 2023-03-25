require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const FTMSCAN_API_KEY = process.env.FTMSCAN_API_KEY;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    localhost: {
      gas: "auto",
      gasPrice: "auto"
    },
    hardhat: {},
    ftm_testnet: {
      url: "https://rpc.ankr.com/fantom_testnet",
      chainId: 4002,
      accounts: [DEPLOYER_PRIVATE_KEY],
      tags: ["test"],
    },
    ftm_mainnet: {
      url: "https://rpc.ftm.tools",
      chainId: 250,
      accounts: [DEPLOYER_PRIVATE_KEY],
      tags: ["main"],
    },
  },
  etherscan: {
    apiKey: FTMSCAN_API_KEY,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 4000000000
  }
};