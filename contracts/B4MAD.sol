// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract B4MAD is ERC20, Ownable, ERC20Votes, ERC20Permit {
    // Defines the clock mode for ERC20Votes
    string public constant override CLOCK_MODE = "mode=block.number";
    constructor(address initialOwner)
        ERC20("B4MAD Token", "B4MAD")
        Ownable(initialOwner)
        ERC20Permit("B4MAD Token")
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

    /// @dev See {ERC20Permit-nonces}.
    function nonces(address owner) public view override(ERC20Permit, ERC20Votes) returns (uint256) {
        return super.nonces(owner);
    }

    /// @dev See {ERC20Votes-_update}.
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }
}
