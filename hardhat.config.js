import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

const config = defineConfig({
  solidity: {
    compilers: [
      {
        version: "0.8.28", // Updated version
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      // Configuration for Hardhat Network (local development)
      type: 'edr-simulated',
    },
    // Temporarily comment out other networks to debug HHE15
    // statusTestnet: {
    //     type: 'http',
    //     url: 'http://localhost:8545', // Placeholder, as no URL is provided in prompt
    //     accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    // },
    // ...(process.env.BASE_SEPOLIA_RPC_URL && {
    //   baseSepolia: {
    //     type: 'http',
    //     url: process.env.BASE_SEPOLIA_RPC_URL,
    //     accounts:
    //       process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    //   },
    // }),
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  plugins: [hardhatToolboxMochaEthers],
});

export default config;