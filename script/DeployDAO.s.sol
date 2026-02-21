// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import {Script, console} from "forge-std/Script.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {Governor, GovernorSettings, IGovernor, IERC20Votes, ITimelock} from "@openzeppelin/contracts/governance/Governor.sol"; // Import GovernorSettings and interfaces
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract B4MAD is ERC20Votes {
    constructor(uint256 initialSupply) ERC20("B4MAD", "B4MAD") {
        _mint(msg.sender, initialSupply);
    }
}

contract B4MADGovernor is Governor, GovernorSettings { // Inherit from Governor and GovernorSettings
    IERC20Votes public immutable token;
    ITimelock public immutable timelock;

    constructor(
        ERC20Votes _token,
        TimelockController _timelock
    )
        Governor("B4MADGovernor")
        GovernorSettings(1, 17280, 0) // votingDelay, votingPeriod, proposalThreshold (set to 0 for now)
    {
        token = _token;
        timelock = _timelock;
    }

    // The following functions are overrides required by Solidity.
    function votingDelay() public view override(IGovernor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(IGovernor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
    }

    function proposalThreshold() public view override(IGovernor, GovernorSettings) returns (uint256) {
        return super.proposalThreshold();
    }

    // Override the quorum mechanism. For example, 5% of the token supply.
    function quorum(uint256 blockNumber) public view override returns (uint256) {
        uint256 total = token.getPastTotalSupply(blockNumber);
        return (total * 5) / 100; // 5% quorum
    }

    function _timelock() internal view override returns (address) {
        return address(timelock);
    }

    function _token() internal view override returns (address) {
        return address(token);
    }
}

contract DeployDAO is Script {
    function run() public returns (
        address b4madTokenAddress,
        address timelockAddress,
        address governorAddress
    ) {
        vm.startBroadcast();

        address deployer = msg.sender;
        console.log("Deployer address:", deployer);

        // 1. Deploy B4MAD token
        uint256 initialSupply = 100_000_000 * 10 ** 18; // 100 Million tokens
        B4MAD b4madToken = new B4MAD(initialSupply);
        b4madTokenAddress = address(b4madToken);
        console.log("B4MAD Token deployed at:", b4madTokenAddress);

        // Give deployer voting power (delegate to self)
        b4madToken.delegate(deployer);
        console.log("Deployer delegated voting power to self.");

        // 2. Deploy TimelockController
        // minDelay: 86400s (1 day)
        // proposers: [] (initially empty)
        // executors: [address(0)] (anyone can execute)
        // admin: deployer
        TimelockController timelock = new TimelockController(
            86400, // minDelay
            new address[](0), // proposers
            new address[](1), // executors: address(0)
            deployer // admin
        );
        timelockAddress = address(timelock);
        console.log("TimelockController deployed at:", timelockAddress);

        // 3. Deploy B4MADGovernor
        B4MADGovernor governor = new B4MADGovernor(b4madToken, timelock);
        governorAddress = address(governor);
        console.log("B4MADGovernor deployed at:", governorAddress);

        // 4. Configure roles

        // Get role hashes
        bytes32 proposerRole = timelock.PROPOSER_ROLE();
        bytes32 executorRole = timelock.EXECUTOR_ROLE();
        bytes32 timelockAdminRole = timelock.TIMELOCK_ADMIN_ROLE();

        // Grant PROPOSER_ROLE to governor
        timelock.grantRole(proposerRole, governorAddress);
        console.log("Granted PROPOSER_ROLE to Governor:", governorAddress);

        // Grant EXECUTOR_ROLE to address(0) (anyone can execute after timelock)
        // The TimelockController constructor sets address(0) as an executor if the array passed contains 1 element.
        // If we want anyone to execute, we need to explicitly grant it to address(0).
        // Since it's passed in the constructor, this line is redundant for that specific case.
        // However, if the intention is to allow "anyone" beyond the default, one might add more specific executors.
        // For simplicity and adherence to the prompt, we'll keep it as a constructor argument.
        // If we were to dynamically add it, it would be:
        // timelock.grantRole(executorRole, address(0));
        // For current setup, address(0) is already an executor due to constructor.

        // Renounce TIMELOCK_ADMIN_ROLE from deployer
        // The deployer must still be the admin to grant roles initially.
        // After this, the deployer will no longer be able to manage Timelock roles.
        // The governor will then manage the timelock.
        timelock.renounceRole(timelockAdminRole, deployer);
        console.log("Deployer renounced TIMELOCK_ADMIN_ROLE");

        vm.stopBroadcast();

        // Verification commands
        console.log("\n--- Verification Commands ---");
        console.log("// For B4MAD Token:");
        console.log(string.concat(
            "// forge verify-contract --chain-id <your-chain-id> --num-of-optimizations 200 ",
            b4madTokenAddress,
            " src/B4MAD.sol:B4MAD --constructor-args ",
            vm.toString(initialSupply)
        ));
        console.log("\n// For TimelockController:");
        console.log(string.concat(
            "// forge verify-contract --chain-id <your-chain-id> --num-of-optimizations 200 ",
            timelockAddress,
            " @openzeppelin/contracts/governance/TimelockController.sol:TimelockController --constructor-args ",
            vm.toString(86400),
            " ",
            vm.toString(new address[](0)),
            " ",
            vm.toString(new address[](1)),
            " ",
            vm.toString(deployer)
        ));
        console.log("\n// For B4MADGovernor:");
        console.log(string.concat(
            "// forge verify-contract --chain-id <your-chain-id> --num-of-optimizations 200 ",
            governorAddress,
            " src/B4MADGovernor.sol:B4MADGovernor --constructor-args ",
            b4madTokenAddress,
            " ",
            timelockAddress
        ));
    }
}
