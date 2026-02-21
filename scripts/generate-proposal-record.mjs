#!/usr/bin/env node
/**
 * generate-proposal-record.mjs
 *
 * Generates a structured proposal markdown record from on-chain data.
 *
 * Usage:
 *   node scripts/generate-proposal-record.mjs \
 *     --proposal-id <on-chain-proposal-id> \
 *     --network base-sepolia \
 *     --number <NNNN> \
 *     --title "Human-readable title" \
 *     --author "author name"
 *
 * Requires: DEPLOYER_PRIVATE_KEY or RPC_URL env vars, or hardhat config.
 */

import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia, base } from "viem/chains";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROPOSALS_DIR = join(__dirname, "..", "proposals");

// Contract addresses per network
const CONTRACTS = {
  "base-sepolia": {
    governor: "0x0DA4e9a900d39F6a5F1EfcA1385F65A6F5dD88fd",
    token: "0xa7EF0e699c5d696BeAa58363F3462588fC84F8A2",
    timelock: "0xB8229B5ADcdeC794495b3d07f414E6C979FF5E9C",
    chain: baseSepolia,
    rpc: "https://sepolia.base.org",
  },
  // Add base-mainnet when deployed
};

const GOVERNOR_ABI = parseAbi([
  "function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)",
  "function state(uint256 proposalId) view returns (uint8)",
  "function proposalSnapshot(uint256 proposalId) view returns (uint256)",
  "function proposalDeadline(uint256 proposalId) view returns (uint256)",
  "function proposalEta(uint256 proposalId) view returns (uint256)",
]);

const STATE_NAMES = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
];

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--proposal-id") parsed.proposalId = args[++i];
    else if (args[i] === "--network") parsed.network = args[++i];
    else if (args[i] === "--number") parsed.number = args[++i];
    else if (args[i] === "--title") parsed.title = args[++i];
    else if (args[i] === "--author") parsed.author = args[++i];
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.proposalId) {
    console.error("Error: --proposal-id is required");
    process.exit(1);
  }

  const networkName = args.network || "base-sepolia";
  const network = CONTRACTS[networkName];
  if (!network) {
    console.error(`Error: Unknown network "${networkName}". Available: ${Object.keys(CONTRACTS).join(", ")}`);
    process.exit(1);
  }

  const rpcUrl = process.env.RPC_URL || network.rpc;
  const client = createPublicClient({
    chain: network.chain,
    transport: http(rpcUrl),
  });

  console.log(`Fetching proposal ${args.proposalId} from ${networkName}...`);

  const proposalId = BigInt(args.proposalId);

  // Fetch on-chain data
  let state, votes, snapshot, deadline;
  try {
    [state, votes, snapshot, deadline] = await Promise.all([
      client.readContract({ address: network.governor, abi: GOVERNOR_ABI, functionName: "state", args: [proposalId] }),
      client.readContract({ address: network.governor, abi: GOVERNOR_ABI, functionName: "proposalVotes", args: [proposalId] }),
      client.readContract({ address: network.governor, abi: GOVERNOR_ABI, functionName: "proposalSnapshot", args: [proposalId] }),
      client.readContract({ address: network.governor, abi: GOVERNOR_ABI, functionName: "proposalDeadline", args: [proposalId] }),
    ]);
  } catch (err) {
    console.error("Failed to fetch proposal data:", err.message);
    process.exit(1);
  }

  const stateName = STATE_NAMES[state] || `Unknown(${state})`;
  const [againstVotes, forVotes, abstainVotes] = votes;
  const quorumReached = forVotes > 0n ? "Yes" : "No"; // Simplified check

  const number = args.number || "NNNN";
  const title = args.title || "Untitled Proposal";
  const author = args.author || "Unknown";
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const date = new Date().toISOString().split("T")[0];

  const record = `# Proposal ${number}: ${title}

| Field | Value |
|---|---|
| **Proposal ID** | \`${number}\` |
| **Author** | ${author} |
| **Status** | ${stateName} |
| **Created** | ${date} |
| **Network** | ${networkName} |
| **Governor** | \`${network.governor}\` |
| **On-Chain Proposal ID** | \`${args.proposalId}\` |

## Summary

_TODO: Add summary_

## Rationale

_TODO: Add rationale_

## Specification

_TODO: Add targets and calldata_

## Impact Analysis

_TODO: Add impact analysis_

## Vote

| Metric | Value |
|---|---|
| **Voting start block** | ${snapshot.toString()} |
| **Voting end block** | ${deadline.toString()} |
| **For** | ${forVotes.toString()} |
| **Against** | ${againstVotes.toString()} |
| **Abstain** | ${abstainVotes.toString()} |
| **Quorum reached** | ${quorumReached} |
| **Result** | ${stateName} |

## Execution

| Step | Tx Hash | Timestamp |
|---|---|---|
| Proposal created | _TODO_ | |
| Voting started | _(block ${snapshot.toString()})_ | |
| Voting ended | _(block ${deadline.toString()})_ | |
| Queued in Timelock | _TODO_ | |
| Executed | _TODO_ | |

## Notes

Auto-generated by \`generate-proposal-record.mjs\` on ${date}.
`;

  const filename = `${number}-${slug}.md`;
  const filepath = join(PROPOSALS_DIR, filename);

  if (existsSync(filepath)) {
    console.warn(`Warning: ${filename} already exists. Writing to ${filename}.new`);
    writeFileSync(filepath + ".new", record);
  } else {
    writeFileSync(filepath, record);
  }

  console.log(`✓ Wrote ${filename}`);
  console.log(`  State: ${stateName}`);
  console.log(`  Votes — For: ${forVotes}, Against: ${againstVotes}, Abstain: ${abstainVotes}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
