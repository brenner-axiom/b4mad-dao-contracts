import { ethers } from "ethers";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsDir = resolve(__dirname, "../artifacts/contracts");

function loadArtifact(contractPath, contractName) {
  const raw = readFileSync(resolve(artifactsDir, contractPath, `${contractName}.json`), "utf8");
  return JSON.parse(raw);
}

async function main() {
  const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY env var required");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const deployer = new ethers.Wallet(PRIVATE_KEY, provider);
  
  console.log("Deploying with account:", deployer.address);
  const balance = await provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Use existing token if provided, otherwise deploy new one
  let tokenAddress = process.env.TOKEN_ADDRESS;
  
  if (!tokenAddress) {
    console.log("\n--- Step 1: Deploy B4MAD Token ---");
    const b4madArtifact = loadArtifact("B4MAD.sol", "B4MAD");
    const B4MADFactory = new ethers.ContractFactory(b4madArtifact.abi, b4madArtifact.bytecode, deployer);
    const b4mad = await B4MADFactory.deploy(deployer.address);
    await b4mad.waitForDeployment();
    tokenAddress = await b4mad.getAddress();
    console.log("B4MAD Token deployed to:", tokenAddress);

    console.log("Delegating votes to deployer...");
    const delegateTx = await b4mad.delegate(deployer.address);
    await delegateTx.wait();
    console.log("Votes delegated.");
  } else {
    console.log("\n--- Step 1: Using existing B4MAD Token ---");
    console.log("Token address:", tokenAddress);
  }

  // 2. Deploy TimelockController
  console.log("\n--- Step 2: Deploy TimelockController ---");
  const timelockArtifactPath = resolve(__dirname, "../artifacts/TimelockController/TimelockController.json");
  const timelockArtifact = JSON.parse(readFileSync(timelockArtifactPath, "utf8"));
  const TimelockFactory = new ethers.ContractFactory(timelockArtifact.abi, timelockArtifact.bytecode, deployer);
  const MIN_DELAY = 86400; // 1 day
  const timelock = await TimelockFactory.deploy(
    MIN_DELAY,
    [], // proposers
    [ethers.ZeroAddress], // executors (anyone)
    deployer.address // admin
  );
  await timelock.waitForDeployment();
  const timelockAddress = await timelock.getAddress();
  console.log("TimelockController deployed to:", timelockAddress);

  // 3. Deploy B4MADGovernor
  console.log("\n--- Step 3: Deploy B4MADGovernor ---");
  const govArtifact = loadArtifact("B4MADGovernor.sol", "B4MADGovernor");
  const GovFactory = new ethers.ContractFactory(govArtifact.abi, govArtifact.bytecode, deployer);
  const VOTING_PERIOD = Number(process.env.VOTING_PERIOD_BLOCKS || 50400);
  console.log("Voting period:", VOTING_PERIOD, "blocks");
  const governor = await GovFactory.deploy(tokenAddress, timelockAddress, VOTING_PERIOD);
  await governor.waitForDeployment();
  const governorAddress = await governor.getAddress();
  console.log("B4MADGovernor deployed to:", governorAddress);

  // 4. Configure Timelock roles
  console.log("\n--- Step 4: Configure Timelock Roles ---");
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();

  let tx = await timelock.grantRole(PROPOSER_ROLE, governorAddress);
  await tx.wait();
  console.log("Granted PROPOSER_ROLE to Governor");

  tx = await timelock.grantRole(CANCELLER_ROLE, governorAddress);
  await tx.wait();
  console.log("Granted CANCELLER_ROLE to Governor");

  tx = await timelock.renounceRole(ADMIN_ROLE, deployer.address);
  await tx.wait();
  console.log("Deployer renounced ADMIN_ROLE");

  // Summary
  console.log("\n========================================");
  console.log("       DAO DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("B4MAD Token:        ", tokenAddress);
  console.log("TimelockController: ", timelockAddress);
  console.log("B4MADGovernor:      ", governorAddress);
  console.log("========================================");
  console.log("Network: Base Sepolia");
  console.log("RPC:", RPC_URL);
  console.log("Deployer:", deployer.address);
  console.log("========================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
