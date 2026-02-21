# #B4mad DAO Proposal

| | |
|---|---|
| **Title:** | E2E Test: Transfer 0.0001 ETH from Treasury |
| **Author:** | Brenner Axiom (`0xfcB81789a94A445FB0dc853b64CB48dc214daC4c`) |
| **Date:** | 2026-02-21 |
| **Status:** | `Executed` ✅ |
| **Proposal ID:** | `73820938882940344223591325950797141297912382424151838388823726628676935876668` |

## Rationale

This was the first end-to-end test of the #B4mad DAO governance pipeline on Base Sepolia. The goal was to verify that a proposal could be created, voted on, queued, and executed entirely via CLI, proving the agent-first workflow.

## Impact

A nominal amount of 0.0001 ETH was transferred from the DAO's Timelock treasury to the deployer's wallet. This had no material financial impact and served only to prove the execution machinery works.

## On-Chain Parameters

- **Targets:** `0xfcB81789a94A445FB0dc853b64CB48dc214daC4c`
- **Values:** `0.0001 ETH` (100000000000000 wei)
- **Calldatas:** `0x` (empty for a plain ETH transfer)
- **Description:** `E2E Test #1771670196757: Transfer 0.0001 ETH from treasury to deployer`

## Vote Outcome

The proposal passed unanimously with 100% of the delegated voting power (the deployer's self-delegated tokens).

| | Count |
|---|---|
| **For:** | 1,000,000,000,000,000,000,000,000,000 |
| **Against:** | 0 |
| **Abstain:** | 0 |

## Execution

- **Propose Tx:** [0x...](https://sepolia.basescan.org/tx/...)
- **Vote Tx:** [0x...](https://sepolia.basescan.org/tx/...)
- **Queue Tx:** [0x...](https://sepolia.basescan.org/tx/...)
- **Execute Tx:** [0x...](https://sepolia.basescan.org/tx/...)
