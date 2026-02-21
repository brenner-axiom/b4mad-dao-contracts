# #B4mad DAO Proposals

This directory contains the governance paper trail for all #B4mad DAO proposals.

## Structure

```
proposals/
├── README.md          # This file
├── TEMPLATE.md        # Proposal template
└── NNNN-<slug>.md     # Individual proposal records
```

## Naming Convention

Proposals are numbered sequentially: `0001-first-proposal.md`, `0002-treasury-allocation.md`, etc.

The number matches the order of on-chain submission, not drafting order.

## Workflow

1. **Draft** — Copy `TEMPLATE.md` → `proposals/NNNN-<slug>.md`, fill in Summary, Rationale, Specification
2. **Review** — Get feedback before submitting on-chain (comment on the bead, discuss in Signal)
3. **Submit** — Execute the on-chain proposal transaction, update the record with tx hash and proposal ID
4. **Vote** — Update vote tallies after voting period ends
5. **Execute** — Record execution tx hash and final status

## Automated Records

The `scripts/generate-proposal-record.mjs` script can auto-generate a proposal record from on-chain data:

```bash
node scripts/generate-proposal-record.mjs --proposal-id <on-chain-id> --network base-sepolia
```

## Deployed Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| B4MAD Token | `0xa7EF0e699c5d696BeAa58363F3462588fC84F8A2` |
| TimelockController | `0xB8229B5ADcdeC794495b3d07f414E6C979FF5E9C` |
| B4MADGovernor | `0x0DA4e9a900d39F6a5F1EfcA1385F65A6F5dD88fd` |
