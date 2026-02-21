# E2E Treasury Transfer Test

| Field       | Value          |
|-------------|----------------|
| Proposal ID | *(auto-generated — see e2e script output)* |
| Status      | Executed |
| Author      | Deployer (e2e test) |
| Date        | 2026-02-21 |
| Network     | Base Sepolia |

## Summary

Transfer 0.0001 ETH from the Timelock treasury to the deployer address.
This was the first end-to-end governance test for the #B4mad DAO, validating
the full proposal → vote → queue → execute lifecycle.

## Rationale

Verify that the governance stack (B4MAD Token, TimelockController, B4MADGovernor)
works correctly on Base Sepolia before moving to mainnet.

## On-Chain Parameters

| Parameter | Value |
|-----------|-------|
| Targets   | `["<deployer address>"]` |
| Values    | `["100000000000000"]` (0.0001 ETH in wei) |
| Calldatas | `["0x"]` (plain ETH transfer) |

## Vote Outcome

| Metric   | Value |
|----------|-------|
| For      | 1 (deployer) |
| Against  | 0 |
| Abstain  | 0 |

## Execution

| Field    | Value |
|----------|-------|
| Governor | `0x0DA4e9a900d39F6a5F1EfcA1385F65A6F5dD88fd` |
| Network  | Base Sepolia (`https://sepolia.base.org`) |

## Links

- [Governor on BaseScan](https://sepolia.basescan.org/address/0x0DA4e9a900d39F6a5F1EfcA1385F65A6F5dD88fd)
