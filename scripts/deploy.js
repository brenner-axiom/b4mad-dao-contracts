import hre from "hardhat";

async function main() {
  const [owner, founder, contributor, agent] = await hre.ethers.getSigners();

  console.log("Deploying B4MAD Token...");
  const B4MAD = await hre.ethers.deployContract("B4MAD", [owner.address]);
  await B4MAD.waitForDeployment();
  console.log(`B4MAD Token deployed to: ${B4MAD.target}`);

  const B4MAD_ERC20_ADDRESS = B4MAD.target;

  const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
  const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n; // 1 billion tokens with 18 decimals
  const FOUNDER_ALLOCATION = 200_000_000n * 10n ** 18n; // 20%
  const CONTRIBUTOR_ALLOCATION = 150_000_000n * 10n ** 18n; // 15%
  const AGENT_ALLOCATION = 50_000_000n * 10n ** 18n; // 5%

  const block = await hre.ethers.provider.getBlock("latest");
  const currentTime = BigInt(block.timestamp);
  const vestingStart = currentTime + 300n; // Vesting starts in 300 seconds

  console.log("Deploying Founder Vesting Wallet...");
  const FounderVestingWallet = await hre.ethers.deployContract("MyVestingWallet", [
    B4MAD_ERC20_ADDRESS,
    founder.address,
    vestingStart,
    BigInt(ONE_YEAR_IN_SECS),
  ]);
  await FounderVestingWallet.waitForDeployment();
  console.log(`Founder Vesting Wallet deployed to: ${FounderVestingWallet.target}`);

  console.log("Deploying Contributor Vesting Wallet...");
  const ContributorVestingWallet = await hre.ethers.deployContract("MyVestingWallet", [
    B4MAD_ERC20_ADDRESS,
    contributor.address,
    vestingStart,
    BigInt(ONE_YEAR_IN_SECS),
  ]);
  await ContributorVestingWallet.waitForDeployment();
  console.log(`Contributor Vesting Wallet deployed to: ${ContributorVestingWallet.target}`);

  console.log("Deploying Agent Vesting Wallet...");
  const AgentVestingWallet = await hre.ethers.deployContract("MyVestingWallet", [
    B4MAD_ERC20_ADDRESS,
    agent.address,
    vestingStart,
    BigInt(ONE_YEAR_IN_SECS),
  ]);
  await AgentVestingWallet.waitForDeployment();
  console.log(`Agent Vesting Wallet deployed to: ${AgentVestingWallet.target}`);

  // Transfer allocations to vesting wallets
  console.log("Transferring tokens to vesting wallets...");
  await B4MAD.connect(owner).transfer(FounderVestingWallet.target, FOUNDER_ALLOCATION);
  await B4MAD.connect(owner).transfer(ContributorVestingWallet.target, CONTRIBUTOR_ALLOCATION);
  await B4MAD.connect(owner).transfer(AgentVestingWallet.target, AGENT_ALLOCATION);

  console.log("Allocations transferred.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
