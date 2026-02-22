# The #B4mad DAO

On-chain governance for **#B4mad Industries** — built with [OpenZeppelin Governor](https://docs.openzeppelin.com/contracts/5.x/governance) and [Hardhat 3](https://hardhat.org/).

## Overview

The #B4mad DAO enables decentralized decision-making for #B4mad Industries through token-weighted governance. Token holders can propose, vote on, and execute on-chain actions via a timelock-controlled Governor contract.

### Architecture

| Contract | Purpose |
|---|---|
| **B4MAD** (`#B4MAD`) | ERC-20 governance token with voting power (ERC20Votes) — 1 billion supply, 18 decimals |
| **B4MADGovernor** | OpenZeppelin Governor with counting, quorum (4%), timelock, and configurable voting period |
| **TimelockController** | Enforces a delay between proposal approval and execution |

### Governance Parameters

| Parameter | Testnet | Production |
|---|---|---|
| Voting delay | 1 block | 1 block |
| Voting period | 50 blocks | 50,400 blocks (~1 week) |
| Quorum | 4% | 4% |
| Proposal threshold | 0 | TBD |
| Timelock delay | 1 second | 86,400 seconds (1 day) |

## Development

### Prerequisites

- Node.js ≥ 22
- npm

### Setup

```shell
npm install
```

### Run Tests

```shell
npx hardhat test              # all tests
npx hardhat test solidity      # Solidity unit tests only
npx hardhat test nodejs        # TypeScript integration tests only
```

### Deploy

Deploy to a local simulated chain:

```shell
cp .env.example .env
# Edit .env with your RPC URL and deployer private key
node scripts/deploy-dao.mjs
```

### End-to-End Governance

Run a full governance lifecycle (propose → vote → queue → execute):

```shell
node scripts/e2e-governance.mjs
```

## Proposals

On-chain proposals are documented in [`proposals/`](proposals/). See the [proposal template](proposals/TEMPLATE.md) for the standard format.

## License

[GPL-3.0-or-later](LICENSE)
