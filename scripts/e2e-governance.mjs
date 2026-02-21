#!/usr/bin/env node
/**
 * E2E Governance Flow for #B4mad DAO
 *
 * Full lifecycle on Base Sepolia (or local hardhat node):
 *   1. Deploy Token + TimelockController + Governor (or reuse existing)
 *   2. Create a proposal (transfer ETH from Timelock treasury)
 *   3. Vote on the proposal
 *   4. Queue the proposal
 *   5. Wait for timelock delay
 *   6. Execute the proposal
 *
 * Usage:
 *   # Against a local Hardhat node (fast — no waiting):
 *   npx hardhat node &
 *   LOCAL=1 ./scripts/e2e-governance.mjs
 *
 *   # Against Base Sepolia — reuses contracts from deployments/base-sepolia.json:
 *   PRIVATE_KEY=$(gopass show openclaw/dao-deployer) \
 *     ./scripts/e2e-governance.mjs
 *
 *   # Against Base Sepolia — deploy everything fresh (ignores saved deployment):
 *   FRESH=1 PRIVATE_KEY=$(gopass show openclaw/dao-deployer) \
 *     ./scripts/e2e-governance.mjs
 *
 * Env vars:
 *   PRIVATE_KEY          - deployer private key (required unless LOCAL=1)
 *   RPC_URL              - RPC endpoint (default: https://sepolia.base.org)
 *   LOCAL                - if "1", use http://127.0.0.1:8545 with Hardhat account #0
 *   TOKEN_ADDRESS        - skip token deployment
 *   TIMELOCK_ADDRESS     - skip timelock deployment
 *   GOVERNOR_ADDRESS     - skip governor deployment
 *   VOTING_DELAY_BLOCKS  - override voting delay (default from contract: 1)
 *   TIMELOCK_DELAY_SEC   - override min delay for fresh deploy (default: 86400)
 *   FAST                 - if "1", deploy with 1s timelock delay (for testing)
 *   FRESH                - if "1", deploy fresh contracts (ignore saved deployment)
 *   NETWORK              - deployment file name (default: "base-sepolia")
 */

import { ethers } from "ethers";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsDir = resolve(__dirname, "../artifacts/contracts");

// ── Helpers ──────────────────────────────────────────────────────────

function loadArtifact(contractPath, contractName) {
  const p = resolve(artifactsDir, contractPath, `${contractName}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

function loadTimelockArtifact() {
  const p = resolve(__dirname, "../artifacts/TimelockController/TimelockController.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Wraps a signer to track nonces manually, avoiding ethers v6 stale-nonce races.
 * After each tx.wait(), we increment the local counter.
 */
class SequentialSigner {
  constructor(signer, provider) {
    this._signer = signer;
    this._provider = provider;
    this._nonce = null;
  }
  async init() {
    const addr = await this._signer.getAddress();
    this._nonce = await this._provider.getTransactionCount(addr, "pending");
  }
  get nonce() { return this._nonce; }
  bump() { this._nonce++; }
}
/** Mine a single block on a local Hardhat/Anvil node */
async function mineBlock(provider) {
  await provider.send("evm_mine", []);
}

/** Advance time by `seconds` on a local node */
async function increaseTime(provider, seconds) {
  await provider.send("evm_increaseTime", [seconds]);
  await mineBlock(provider);
}

const PROPOSAL_STATES = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
];

function stateName(n) {
  return PROPOSAL_STATES[Number(n)] || `Unknown(${n})`;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const isLocal = process.env.LOCAL === "1";
  const isFast = process.env.FAST === "1" || isLocal;
  const rpcUrl = process.env.RPC_URL || (isLocal ? "http://127.0.0.1:8545" : "https://sepolia.base.org");
  const timelockDelaySec = isFast ? 1 : Number(process.env.TIMELOCK_DELAY_SEC || 86400);
  const votingPeriodBlocks = isFast ? 50 : Number(process.env.VOTING_PERIOD_BLOCKS || 50400);

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  let deployer;
  if (isLocal) {
    // Use Hardhat's default account #0 with NonceManager (needed for automining)
    const wallet = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
    deployer = new ethers.NonceManager(wallet);
    console.log("🏠 LOCAL mode — using Hardhat account:", wallet.address);
  } else {
    const pk = process.env.PRIVATE_KEY;
    if (!pk) throw new Error("PRIVATE_KEY env var required (or set LOCAL=1)");
    deployer = new ethers.Wallet(pk, provider);
  }

  // Nonce tracker for live networks (avoids ethers v6 stale nonce bugs)
  const seq = isLocal ? null : new SequentialSigner(deployer, provider);
  if (seq) await seq.init();
  /** Returns {nonce} override for live networks, empty for local */
  function nonceOpt() { return seq ? { nonce: seq.nonce } : {}; }
  /** Call after tx.wait() on live networks */
  function bumpNonce() { if (seq) seq.bump(); }

  const deployerAddress = await deployer.getAddress();

  // Load saved deployment if available (not in LOCAL or FRESH mode)
  const networkName = process.env.NETWORK || "base-sepolia";
  const deploymentsFile = resolve(__dirname, `../deployments/${networkName}.json`);
  const isFresh = process.env.FRESH === "1";
  let savedDeployment = null;
  if (!isLocal && !isFresh && existsSync(deploymentsFile)) {
    savedDeployment = JSON.parse(readFileSync(deploymentsFile, "utf8"));
    console.log(`📁 Loaded deployment from deployments/${networkName}.json`);
  }

  const balance = await provider.getBalance(deployerAddress);
  console.log(`Deployer: ${deployerAddress}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} ETH`);
  console.log(`RPC:      ${rpcUrl}`);
  console.log(`Timelock delay: ${timelockDelaySec}s ${isFast ? "(FAST mode)" : ""}`);
  console.log();

  // ── 1. Deploy / Reuse Contracts ──────────────────────────────────

  let tokenAddress = process.env.TOKEN_ADDRESS || savedDeployment?.contracts?.B4MADToken || null;
  let timelockAddress = process.env.TIMELOCK_ADDRESS || savedDeployment?.contracts?.TimelockController || null;
  let governorAddress = process.env.GOVERNOR_ADDRESS || savedDeployment?.contracts?.B4MADGovernor || null;

  // Token
  let token;
  if (tokenAddress) {
    console.log(`📦 Reusing B4MAD Token at ${tokenAddress}`);
    const art = loadArtifact("B4MAD.sol", "B4MAD");
    token = new ethers.Contract(tokenAddress, art.abi, deployer);
  } else {
    console.log("🚀 Deploying B4MAD Token...");
    const art = loadArtifact("B4MAD.sol", "B4MAD");
    const factory = new ethers.ContractFactory(art.abi, art.bytecode, deployer);
    token = await factory.deploy(deployerAddress, nonceOpt());
    bumpNonce();
    await token.waitForDeployment();
    tokenAddress = await token.getAddress();
    console.log(`   ✅ Token: ${tokenAddress}`);
    // Self-delegate so deployer has voting power
    const tx = await token.delegate(deployerAddress, nonceOpt());
    bumpNonce();
    await tx.wait();
    console.log("   ✅ Votes self-delegated");
  }

  // Timelock
  let timelock;
  if (timelockAddress) {
    console.log(`📦 Reusing TimelockController at ${timelockAddress}`);
    const art = loadTimelockArtifact();
    timelock = new ethers.Contract(timelockAddress, art.abi, deployer);
  } else {
    console.log("🚀 Deploying TimelockController...");
    const art = loadTimelockArtifact();
    const factory = new ethers.ContractFactory(art.abi, art.bytecode, deployer);
    timelock = await factory.deploy(timelockDelaySec, [], [ethers.ZeroAddress], deployerAddress, nonceOpt());
    bumpNonce();
    await timelock.waitForDeployment();
    timelockAddress = await timelock.getAddress();
    console.log(`   ✅ Timelock: ${timelockAddress}`);
  }

  // Governor
  let governor;
  if (governorAddress) {
    console.log(`📦 Reusing B4MADGovernor at ${governorAddress}`);
    const art = loadArtifact("B4MADGovernor.sol", "B4MADGovernor");
    governor = new ethers.Contract(governorAddress, art.abi, deployer);
  } else {
    console.log("🚀 Deploying B4MADGovernor...");
    const art = loadArtifact("B4MADGovernor.sol", "B4MADGovernor");
    const factory = new ethers.ContractFactory(art.abi, art.bytecode, deployer);
    governor = await factory.deploy(tokenAddress, timelockAddress, votingPeriodBlocks, nonceOpt());
    bumpNonce();
    await governor.waitForDeployment();
    governorAddress = await governor.getAddress();
    console.log(`   ✅ Governor: ${governorAddress}`);

    // Grant roles
    console.log("🔧 Configuring Timelock roles...");
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
    const ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();

    let tx = await timelock.grantRole(PROPOSER_ROLE, governorAddress, nonceOpt());
    bumpNonce();
    await tx.wait();
    console.log("   ✅ Granted PROPOSER_ROLE to Governor");
    tx = await timelock.grantRole(CANCELLER_ROLE, governorAddress, nonceOpt());
    bumpNonce();
    await tx.wait();
    console.log("   ✅ Granted CANCELLER_ROLE to Governor");
    tx = await timelock.renounceRole(ADMIN_ROLE, deployerAddress, nonceOpt());
    bumpNonce();
    await tx.wait();
    console.log("   ✅ Deployer renounced ADMIN_ROLE");
    console.log("   ✅ Roles configured, admin renounced");
  }

  console.log();
  console.log("════════════════════════════════════════");
  console.log("  Contracts Ready");
  console.log("════════════════════════════════════════");
  console.log(`  Token:    ${tokenAddress}`);
  console.log(`  Timelock: ${timelockAddress}`);
  console.log(`  Governor: ${governorAddress}`);
  console.log("════════════════════════════════════════");

  // Save deployment addresses for reuse
  if (!isLocal) {
    const deployment = {
      network: networkName,
      chainId: Number((await provider.getNetwork()).chainId),
      rpc: rpcUrl,
      deployer: deployerAddress,
      contracts: {
        B4MADToken: tokenAddress,
        TimelockController: timelockAddress,
        B4MADGovernor: governorAddress,
      },
      params: { votingPeriodBlocks, timelockDelaySec, quorumPercent: 4 },
      deployedAt: new Date().toISOString(),
    };
    writeFileSync(deploymentsFile, JSON.stringify(deployment, null, 2) + "\n");
    console.log(`\n📁 Saved deployment to deployments/${networkName}.json`);
  }
  console.log();

  // ── 2. Fund the Timelock treasury ────────────────────────────────

  const treasuryBalance = await provider.getBalance(timelockAddress);
  const FUND_AMOUNT = ethers.parseEther("0.001");
  if (treasuryBalance < FUND_AMOUNT) {
    console.log("💰 Funding Timelock treasury with 0.001 ETH...");
    const tx = await deployer.sendTransaction({ to: timelockAddress, value: FUND_AMOUNT, ...nonceOpt() });
    bumpNonce();
    await tx.wait();
    console.log("   ✅ Treasury funded");
  } else {
    console.log(`💰 Treasury already has ${ethers.formatEther(treasuryBalance)} ETH`);
  }

  // ── 3. Create a Proposal ─────────────────────────────────────────

  // Proposal: transfer 0.0001 ETH from Timelock to deployer
  const transferAmount = ethers.parseEther("0.0001");
  const targets = [deployerAddress];
  const values = [transferAmount];
  const calldatas = ["0x"]; // plain ETH transfer, no calldata
  const runId = Date.now();
  const description = `E2E Test #${runId}: Transfer 0.0001 ETH from treasury to deployer`;
  const descriptionHash = ethers.id(description);

  console.log("\n📜 Creating proposal...");
  console.log(`   "${description}"`);
  const proposeTx = await governor.propose(targets, values, calldatas, description, nonceOpt());
  bumpNonce();
  const proposeReceipt = await proposeTx.wait();

  // Extract proposal ID from ProposalCreated event
  const proposalCreatedEvent = proposeReceipt.logs
    .map((log) => {
      try { return governor.interface.parseLog(log); } catch { return null; }
    })
    .find((e) => e && e.name === "ProposalCreated");

  if (!proposalCreatedEvent) throw new Error("ProposalCreated event not found");
  const proposalId = proposalCreatedEvent.args.proposalId;
  console.log(`   ✅ Proposal ID: ${proposalId}`);
  if (!isLocal) await sleep(5000); // Wait for RPC to fully index the new block

  // ── 4. Wait for voting to open ───────────────────────────────────

  const votingDelay = await governor.votingDelay();
  console.log(`\n⏳ Voting delay: ${votingDelay} block(s)`);

  if (isLocal) {
    await provider.send("hardhat_mine", ["0x" + (Number(votingDelay) + 1).toString(16)]);
    console.log("   ⛏️  Mined blocks to pass voting delay");
  } else {
    console.log("   Waiting for voting delay blocks...");
    let state = await governor.state(proposalId);
    while (Number(state) === 0) { // Pending
      await sleep(3000);
      state = await governor.state(proposalId);
    }
  }

  let state = await governor.state(proposalId);
  console.log(`   State: ${stateName(state)}`);
  if (Number(state) !== 1) throw new Error(`Expected Active (1), got ${stateName(state)}`);

  // ── 5. Cast vote ─────────────────────────────────────────────────

  console.log("\n🗳️  Casting vote (For)...");
  const voteTx = await governor.castVote(proposalId, 1, nonceOpt()); // 1 = For
  bumpNonce();
  await voteTx.wait();
  console.log("   ✅ Vote cast");

  // ── 6. Wait for voting period to end ─────────────────────────────

  const votingPeriod = await governor.votingPeriod();
  console.log(`\n⏳ Voting period: ${votingPeriod} blocks`);

  if (isLocal) {
    // Use hardhat_mine to batch-mine (much faster than individual evm_mine calls)
    await provider.send("hardhat_mine", ["0x" + (Number(votingPeriod) + 1).toString(16)]);
    console.log("   ⛏️  Mined blocks to end voting period");
  } else {
    console.log("   ⚠️  On a live network this takes ~1 week (50400 blocks).");
    console.log("   Polling state every 30s... (Ctrl+C to stop)");
    state = await governor.state(proposalId);
    while (Number(state) === 1) { // Active
      await sleep(30000);
      state = await governor.state(proposalId);
      process.stdout.write(`\r   State: ${stateName(state)}  `);
    }
    console.log();
  }

  state = await governor.state(proposalId);
  console.log(`   State: ${stateName(state)}`);
  if (Number(state) !== 4) throw new Error(`Expected Succeeded (4), got ${stateName(state)}`);

  // ── 7. Queue the proposal ────────────────────────────────────────

  console.log("\n📥 Queuing proposal in Timelock...");
  const queueTx = await governor.queue(targets, values, calldatas, descriptionHash, nonceOpt());
  bumpNonce();
  await queueTx.wait();
  console.log("   ✅ Queued");

  state = await governor.state(proposalId);
  console.log(`   State: ${stateName(state)}`);

  // ── 8. Wait for timelock delay ───────────────────────────────────

  console.log(`\n⏳ Timelock delay: ${timelockDelaySec}s`);
  if (isLocal) {
    await increaseTime(provider, timelockDelaySec + 1);
    console.log("   ⏩ Fast-forwarded time");
  } else {
    console.log(`   Sleeping ${timelockDelaySec}s...`);
    await sleep(timelockDelaySec * 1000 + 2000);
  }

  // ── 9. Execute the proposal ──────────────────────────────────────

  console.log("\n🚀 Executing proposal...");
  const balanceBefore = await provider.getBalance(deployerAddress);
  // Retry execution — on live networks, block timestamps may not have advanced enough
  let executeTx;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      executeTx = await governor.execute(targets, values, calldatas, descriptionHash, nonceOpt());
      bumpNonce();
      break;
    } catch (e) {
      if (attempt >= 9) throw e;
      console.log(`   ⏳ Timelock not ready yet, retrying in 5s... (attempt ${attempt + 1}/10)`);
      await sleep(5000);
    }
  }
  await executeTx.wait();
  const balanceAfter = await provider.getBalance(deployerAddress);
  console.log("   ✅ Executed!");

  state = await governor.state(proposalId);
  console.log(`   State: ${stateName(state)}`);

  const received = balanceAfter - balanceBefore;
  // Note: received will be slightly less than 0.0001 ETH due to gas costs
  console.log(`   Deployer balance change: ~${ethers.formatEther(received)} ETH (minus gas)`);

  // ── Summary ──────────────────────────────────────────────────────

  // ── Write proposal record ────────────────────────────────────────

  const proposalsDir = resolve(__dirname, "../proposals");
  // Find next proposal number
  const existingFiles = existsSync(proposalsDir)
    ? readdirSync(proposalsDir).filter((f) => /^\d{4}-/.test(f))
    : [];
  const nextNum = existingFiles.length > 0
    ? Math.max(...existingFiles.map((f) => parseInt(f.slice(0, 4), 10))) + 1
    : 1;
  const padNum = String(nextNum).padStart(4, "0");
  const proposalFile = resolve(proposalsDir, `${padNum}-e2e-treasury-transfer.md`);
  const dateStr = new Date().toISOString().slice(0, 10);
  const explorerBase = networkName === "base-sepolia"
    ? "https://sepolia.basescan.org"
    : "https://basescan.org";
  const executeTxHash = executeTx.hash;

  const record = `# E2E Treasury Transfer Test (#${runId})

| Field       | Value          |
|-------------|----------------|
| Proposal ID | \`${proposalId}\` |
| Status      | Executed |
| Author      | \`${deployerAddress}\` |
| Date        | ${dateStr} |
| Network     | ${networkName} |

## Summary

Transfer ${ethers.formatEther(transferAmount)} ETH from Timelock treasury to deployer.

## On-Chain Parameters

| Parameter | Value |
|-----------|-------|
| Targets   | \`["${deployerAddress}"]\` |
| Values    | \`["${transferAmount.toString()}"]\` (${ethers.formatEther(transferAmount)} ETH) |
| Calldatas | \`["0x"]\` |
| Description Hash | \`${descriptionHash}\` |

## Vote Outcome

| Metric   | Value |
|----------|-------|
| For      | 1 (deployer) |
| Against  | 0 |
| Abstain  | 0 |

## Execution

| Field    | Value |
|----------|-------|
| Tx Hash  | \`${executeTxHash}\` |
| Governor | \`${governorAddress}\` |
| Timelock | \`${timelockAddress}\` |

## Links

- [Governor](${explorerBase}/address/${governorAddress})
- [Execution Tx](${explorerBase}/tx/${executeTxHash})
`;

  writeFileSync(proposalFile, record);
  console.log(`\n📝 Proposal record written to proposals/${padNum}-e2e-treasury-transfer.md`);

  console.log("\n════════════════════════════════════════");
  console.log("  🎉 E2E GOVERNANCE FLOW COMPLETE!");
  console.log("════════════════════════════════════════");
  console.log("  Proposal created, voted, queued, and executed successfully.");
  console.log(`  Token:       ${tokenAddress}`);
  console.log(`  Timelock:    ${timelockAddress}`);
  console.log(`  Governor:    ${governorAddress}`);
  console.log(`  Proposal ID: ${proposalId}`);
  console.log("════════════════════════════════════════");
}

main().catch((err) => {
  console.error("❌ E2E failed:", err.message || err);
  process.exitCode = 1;
});
