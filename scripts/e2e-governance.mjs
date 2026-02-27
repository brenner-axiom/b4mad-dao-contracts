#!/usr/bin/env node
/**
 * E2E Governance Flow for #B4mad DAO - CronJob Version
 *
 * This script is designed to be run by a Kubernetes CronJob for periodic DAO governance operations.
 * It focuses on monitoring proposals and executing governance actions.
 *
 * Usage:
 *   # Configure environment variables:
 *   PRIVATE_KEY=$(gopass show openclaw/dao-deployer) \
 *   RPC_URL="https://sepolia.base.org" \
 *   ./scripts/e2e-governance.mjs
 *
 * Environment variables:
 *   PRIVATE_KEY          - Deployer private key (required)
 *   RPC_URL              - RPC endpoint (default: https://sepolia.base.org)
 *   NETWORK              - Network name (default: "base-sepolia")
 *   DRY_RUN              - If "1", only log what would happen without executing (default: "0")
 *   PROPOSAL_ID          - Specific proposal ID to execute (optional)
 *   ACTION               - Action to perform: "monitor" or "execute" (default: "monitor")
 */

import { ethers } from "ethers";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsDir = resolve(__dirname, "../artifacts/contracts");

// ── Helpers ─────────────────────────────────────────────────────────────────

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
 * Returns current timestamp
 */
function now() {
  return new Date().toISOString();
}

/**
 * Wraps a signer to track nonces manually, avoiding ethers v6 stale-nonce races.
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

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const rpcUrl = process.env.RPC_URL || "https://sepolia.base.org";
  const networkName = process.env.NETWORK || "base-sepolia";
  const isDryRun = process.env.DRY_RUN === "1";
  const proposalId = process.env.PROPOSAL_ID || null;
  const action = process.env.ACTION || "monitor";
  const isLocal = process.env.LOCAL === "1";

  console.log(`[${now()}] Starting E2E Governance CronJob (network: ${networkName}, action: ${action})`);
  console.log(`[${now()}] RPC: ${rpcUrl}`);
  console.log(`[${now()}] Dry run: ${isDryRun ? "YES" : "NO"}`);

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  let deployer;
  if (isLocal) {
    // Use Hardhat's default account #0 with NonceManager
    const wallet = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
    deployer = new ethers.NonceManager(wallet);
    console.log(`[${now()}] Using local Hardhat account: ${wallet.address}`);
  } else {
    const pk = process.env.PRIVATE_KEY;
    if (!pk) {
      throw new Error("PRIVATE_KEY environment variable required (or set LOCAL=1)");
    }
    deployer = new ethers.Wallet(pk, provider);
  }

  // Nonce tracker for live networks
  const seq = isLocal ? null : new SequentialSigner(deployer, provider);
  if (seq) await seq.init();
  
  /** Returns {nonce} override for live networks */
  function nonceOpt() { return seq ? { nonce: seq.nonce } : {}; }
  /** Call after tx.wait() on live networks */
  function bumpNonce() { if (seq) seq.bump(); }

  const deployerAddress = await deployer.getAddress();
  console.log(`[${now()}] Deployer address: ${deployerAddress}`);

  // ── Load existing deployment ─────────────────────────────────────────────

  const deploymentsFile = resolve(__dirname, `../deployments/${networkName}.json`);
  let savedDeployment = null;
  if (existsSync(deploymentsFile)) {
    savedDeployment = JSON.parse(readFileSync(deploymentsFile, "utf8"));
    console.log(`[${now()}] Loaded deployment from ${deploymentsFile}`);
  } else {
    console.log(`[${now()}] No deployment file found. This may be a deploy-only run.`);
    return;
  }

  const tokenAddress = savedDeployment.contracts?.B4MADToken;
  const timelockAddress = savedDeployment.contracts?.TimelockController;
  const governorAddress = savedDeployment.contracts?.B4MADGovernor;

  if (!tokenAddress || !timelockAddress || !governorAddress) {
    throw new Error("Required contracts not found in deployment file");
  }

  console.log(`[${now()}] Token: ${tokenAddress}`);
  console.log(`[${now()}] Timelock: ${timelockAddress}`);
  console.log(`[${now()}] Governor: ${governorAddress}`);

  // ── Load contract interfaces ─────────────────────────────────────────────

  const tokenContract = new ethers.Contract(tokenAddress, loadArtifact("B4MAD.sol", "B4MAD").abi, deployer);
  const timelockContract = new ethers.Contract(timelockAddress, loadTimelockArtifact().abi, deployer);
  const governorContract = new ethers.Contract(governorAddress, loadArtifact("B4MADGovernor.sol", "B4MADGovernor").abi, deployer);

  // ── Execute governance action ─────────────────────────────────────────────

  if (action === "execute") {
    if (!proposalId) {
      console.log(`[${now()}] No PROPOSAL_ID specified`);
      return;
    }

    console.log(`[${now()}] Executing proposal ${proposalId}`);

    if (isDryRun) {
      console.log(`[${now()}] DRY RUN: Would execute proposal ${proposalId}`);
      return;
    }

    try {
      const state = await governorContract.state(proposalId);
      console.log(`[${now()}] Proposal state: ${state}`);

      if (state === 4) { // Succeeded
        // Prepare proposal parameters for execution
        const proposalDetails = await governorContract.proposals(proposalId);
        const targets = proposalDetails.targets;
        const values = proposalDetails.values;
        const calldatas = proposalDetails.calldatas;
        const descriptionHash = proposalDetails.descriptionHash;

        console.log(`[${now()}] Executing proposal with targets: ${targets.join(", ")}`);

        const executeTx = await governorContract.execute(targets, values, calldatas, descriptionHash, nonceOpt());
        bumpNonce();
        await executeTx.wait();
        console.log(`[${now()}] ✅ Proposal ${proposalId} executed successfully!`);
        console.log(`[${now()}] Transaction hash: ${executeTx.hash}`);
      } else {
        console.log(`[${now()}] Proposal ${proposalId} is not in SUCCEEDED state (${state})`);
      }
    } catch (error) {
      console.error(`[${now()}] ❌ Error executing proposal ${proposalId}:`, error.message);
    }
  }

  // ── Monitor proposals ─────────────────────────────────────────────────────

  if (action === "monitor") {
    console.log(`[${now()}] Monitoring active proposals...`);
    
    // For demonstration, we'll check a few recent proposals
    const latestProposalId = await governorContract.proposalCount();
    
    if (isDryRun) {
      console.log(`[${now()}] DRY RUN: Would check proposals from 1 to ${latestProposalId}`);
    } else {
      console.log(`[${now()}] Checking proposals up to ID ${latestProposalId}`);
    }

    // Check last few proposals
    const limit = Math.min(5, Number(latestProposalId));
    for (let i = 1; i <= limit; i++) {
      try {
        const proposalState = await governorContract.state(i);
        if (proposalState === 1) { // Active
          console.log(`[${now()}] Proposal ${i} is active`);
          // Could add voting logic or notifications here
        }
      } catch (error) {
        console.log(`[${now()}] Could not check proposal ${i}: ${error.message}`);
      }
    }
  }

  console.log(`[${now()}] E2E Governance CronJob completed`);
}

main().catch((error) => {
  console.error(`[${new Date().toISOString()}] ❌ E2E failed:`, error.message || error);
  process.exitCode = 1;
});