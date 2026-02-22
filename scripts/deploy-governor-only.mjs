import { ethers } from "ethers";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY env var required");

  const TOKEN_ADDRESS = "0x0bb081b0769cd8211b6d316779a33D11D2F7900A";
  const TIMELOCK_ADDRESS = "0xd3711fCbEE659dF6E830A523e14efC4b9c5F1279";

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const deployer = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Deployer:", deployer.address);
  const balance = await provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");
  const nonce = await provider.getTransactionCount(deployer.address);
  console.log("Current nonce:", nonce);

  // First, delegate votes to deployer (was skipped due to nonce error)
  console.log("\n--- Delegating votes to deployer ---");
  const tokenArtifact = JSON.parse(readFileSync(resolve(__dirname, "../artifacts/contracts/B4MAD.sol/B4MAD.json"), "utf8"));
  const token = new ethers.Contract(TOKEN_ADDRESS, tokenArtifact.abi, deployer);
  const currentDelegate = await token.delegates(deployer.address);
  if (currentDelegate === ethers.ZeroAddress) {
    const delegateTx = await token.delegate(deployer.address);
    await delegateTx.wait();
    console.log("Votes delegated.");
  } else {
    console.log("Already delegated to:", currentDelegate);
  }

  // Deploy Governor
  console.log("\n--- Deploying B4MADGovernor ---");
  const govArtifact = JSON.parse(readFileSync(resolve(__dirname, "../artifacts/contracts/B4MADGovernor.sol/B4MADGovernor.json"), "utf8"));
  const GovFactory = new ethers.ContractFactory(govArtifact.abi, govArtifact.bytecode, deployer);
  const VOTING_PERIOD = 50400; // ~1 week on Base
  const governor = await GovFactory.deploy(TOKEN_ADDRESS, TIMELOCK_ADDRESS, VOTING_PERIOD);
  await governor.waitForDeployment();
  const governorAddress = await governor.getAddress();
  console.log("B4MADGovernor deployed to:", governorAddress);

  // Configure Timelock roles
  console.log("\n--- Configuring Timelock Roles ---");
  const timelockArtifact = JSON.parse(readFileSync(resolve(__dirname, "../artifacts/TimelockController/TimelockController.json"), "utf8"));
  const timelock = new ethers.Contract(TIMELOCK_ADDRESS, timelockArtifact.abi, deployer);

  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();

  let tx = await timelock.grantRole(PROPOSER_ROLE, governorAddress);
  await tx.wait();
  console.log("Granted PROPOSER_ROLE to Governor");

  tx = await timelock.grantRole(CANCELLER_ROLE, governorAddress);
  await tx.wait();
  console.log("Granted CANCELLER_ROLE to Governor");

  // Summary
  console.log("\n========================================");
  console.log("    #B4MAD DAO DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("B4MAD Token:        ", TOKEN_ADDRESS);
  console.log("TimelockController: ", TIMELOCK_ADDRESS);
  console.log("B4MADGovernor:      ", governorAddress);
  console.log("========================================");
  console.log("Network: Base Sepolia (Chain ID: 84532)");
  console.log("Deployer:", deployer.address);
  console.log("========================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
