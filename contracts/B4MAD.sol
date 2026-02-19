// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract B4MAD is ERC20, Ownable {
    constructor(address initialOwner)
        ERC20("B4MAD Token", "B4MAD")
        Ownable(initialOwner)
    {
        // Mint the total supply to the deployer (which will then distribute to vesting contracts, etc.)
        // Total Supply: 1,000,000,000 B4MAD (1 billion)
        // Using 18 decimals, so 1 billion * (10 ** 18)
        _mint(msg.sender, 1_000_000_000 * 10 ** 18);
    }

    // Function to burn tokens
    function burn(uint256 amount) public onlyOwner {
        _burn(msg.sender, amount);
    }
}
