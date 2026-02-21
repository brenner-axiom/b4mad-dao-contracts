// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/finance/VestingWallet.sol";

// This is a wrapper contract to make VestingWallet discoverable by Hardhat.
// It doesn't add any new logic, just exposes the OpenZeppelin VestingWallet.
contract MyVestingWallet is VestingWallet {
    constructor(
        address beneficiary,
        uint64 start,
        uint64 duration
    ) VestingWallet(beneficiary, start, duration) payable {}
}
