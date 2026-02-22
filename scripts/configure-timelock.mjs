import { ethers } from "ethers";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const TIMELOCK_ADDRESS = "0xd3711fCbEE659dF6E830A523e14efC4b9c5F1279";
  const GOVERNOR_ADDRESS = "0x3D72176Bf9E921Db85170e3Cc3b40502f5a55281";

  const timelockArtifact = JSON.parse(readFileSync(resolve(__dirname, "../artifacts/TimelockController/TimelockController.json"), "utf8"));
  const timelock = new ethers.Contract(TIMELOCK_ADDRESS, timelockArtifact.abi, deployer);

  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();

  console.log("Granting PROPOSER_ROLE to Governor...");
  let tx = await timelock.grantRole(PROPOSER_ROLE, GOVERNOR_ADDRESS);
  await tx.wait();
  console.log("Done. TX:", tx.hash);

  console.log("Granting CANCELLER_ROLE to Governor...");
  tx = await timelock.grantRole(CANCELLER_ROLE, GOVERNOR_ADDRESS);
  await tx.wait();
  console.log("Done. TX:", tx.hash);

  console.log("\n========================================");
  console.log("    #B4MAD DAO DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("B4MAD Token:        ", "0x0bb081b0769cd8211b6d316779a33D11D2F7900A");
  console.log("TimelockController: ", TIMELOCK_ADDRESS);
  console.log("B4MADGovernor:      ", GOVERNOR_ADDRESS);
  console.log("========================================");
  console.log("Network: Base Sepolia (Chain ID: 84532)");
  console.log("Explorer: https://sepolia.basescan.org");
  console.log("========================================");
}

main().catch(e => { console.error(e); process.exitCode = 1; });
