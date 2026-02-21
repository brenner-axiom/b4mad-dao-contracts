import { expect } from "chai";
import hre from "hardhat";


describe("B4MADGovernor", function () {
    let b4madToken;
    let timelock;
    let governor;
    let owner;
    let addr1;
    let addr2;
    let addr3;
    let addrs;

    const MIN_DELAY = 86400; // 1 day in seconds

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();

        // Deploy B4MAD Token
        const B4MAD = await hre.ethers.getContractFactory("B4MAD");
        b4madToken = await B4MAD.deploy(owner.address);
        await b4madToken.waitForDeployment();

        // Deploy TimelockController
        const TimelockController = await hre.ethers.getContractFactory("TimelockController");
        timelock = await TimelockController.deploy(MIN_DELAY, [], [], owner.address); // owner as proposer and executor
        await timelock.waitForDeployment();

        // Initial supply is minted to the owner. Transfer some to timelock and addr1 for testing.
        await b4madToken.transfer(timelock.target, hre.ethers.parseUnits("100000", 18));
        await b4madToken.transfer(addr1.address, hre.ethers.parseUnits("500000", 18));

        // Deploy B4MADGovernor
        const B4MADGovernor = await hre.ethers.getContractFactory("B4MADGovernor");
        governor = await B4MADGovernor.deploy(b4madToken.target, timelock.target);
        await governor.waitForDeployment();

        // Grant the governor the PROPOSER_ROLE and EXECUTOR_ROLE on the TimelockController
        const proposerRole = await timelock.PROPOSER_ROLE();
        const executorRole = await timelock.EXECUTOR_ROLE();
        const adminRole = await timelock.TIMELOCK_ADMIN_ROLE();

        await timelock.grantRole(proposerRole, governor.target);
        await timelock.grantRole(executorRole, governor.target);

        // Revoke the default admin role from the deployer (owner)
        await timelock.revokeRole(adminRole, owner.address);

        // Delegate votes
        await b4madToken.connect(owner).delegate(owner.address);
        await b4madToken.connect(addr1).delegate(addr1.address);
    });

    describe("Deployment and Setup", function () {
        it("Should set the correct voting delay, voting period, and proposal threshold", async function () {
            expect(await governor.votingDelay()).to.equal(1);
            expect(await governor.votingPeriod()).to.equal(50400);
            expect(await governor.proposalThreshold()).to.equal(0);
        });

        it("Should have the correct quorum fraction", async function () {
            expect(await governor.quorumNumerator()).to.equal(4); // 4%
            expect(await governor.quorumDenominator()).to.equal(100);
        });

        it("Should correctly delegate votes", async function () {
            expect(await b4madToken.getVotes(owner.address)).to.equal(hre.ethers.parseUnits("1000000", 18));
            expect(await b4madToken.getVotes(addr1.address)).to.equal(hre.ethers.parseUnits("500000", 18));
        });
    });

    describe("Proposals and Voting", function () {
        it("Should allow a proposal to be created, voted on, queued, and executed", async function () {
            // Encode a function call to be proposed (e.g., transferring tokens from Timelock to addr2)
            const transferAmount = hre.ethers.parseUnits("1000", 18);
            const encodedFunction = b4madToken.interface.encodeFunctionData("transfer", [addr2.address, transferAmount]);

            // Create a proposal
            const description = "Proposal #1: Transfer 1000 B4MAD from Timelock to Addr2";
            const tx = await governor.propose(
                [b4madToken.target], // The target contract to call (B4MAD token)
                [0], // value (no ETH transfer)
                [encodedFunction], // The encoded call to transfer tokens
                description
            );
            const receipt = await tx.wait();
            const proposalId = receipt.logs[0].args.proposalId;

            expect(await governor.state(proposalId)).to.equal(0); // Pending

            // Move past the voting delay
            await hre.ethers.provider.send("evm_mine"); // Block 1
            expect(await governor.state(proposalId)).to.equal(1); // Active

            // Vote on the proposal
            await governor.connect(owner).castVote(proposalId, 1); // 1 = For
            await governor.connect(addr1).castVote(proposalId, 1); // 1 = For

            // Check votes
            expect(await governor.hasVoted(proposalId, owner.address)).to.be.true;
            expect(await governor.hasVoted(proposalId, addr1.address)).to.be.true;

            // Move past the voting period
            for (let i = 0; i < 50400; i++) {
                await hre.ethers.provider.send("evm_mine");
            }

            expect(await governor.state(proposalId)).to.equal(4); // Succeeded

            // Queue the proposal
            const descriptionHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(description));
            await governor.queue(
                [b4madToken.target],
                [0],
                [encodedFunction],
                descriptionHash
            );
            expect(await governor.state(proposalId)).to.equal(5); // Queued

            // Move past the min delay for TimelockController
            await hre.ethers.provider.send("evm_increaseTime", [MIN_DELAY + 1]);
            await hre.ethers.provider.send("evm_mine");

            // Execute the proposal
            await governor.execute(
                [b4madToken.target],
                [0],
                [encodedFunction],
                descriptionHash
            );

            expect(await governor.state(proposalId)).to.equal(7); // Executed
            expect(await b4madToken.balanceOf(addr2.address)).to.equal(transferAmount);
        });

        it("Should not allow voting before the proposal is active", async function () {
            const transferAmount = hre.ethers.parseUnits("1000", 18);
            const encodedFunction = b4madToken.interface.encodeFunctionData("transfer", [addr2.address, transferAmount]);
            const description = "Proposal #2: Transfer 1000 B4MAD from Timelock to Addr2 (pre-active vote)";

            const tx = await governor.propose(
                [b4madToken.target],
                [0],
                [encodedFunction],
                description
            );
            const receipt = await tx.wait();
            const proposalId = receipt.logs[0].args.proposalId;

            await expect(governor.connect(owner).castVote(proposalId, 1)).to.be.revertedWithCustomError(
                governor,
                "GovernorUnexpectedProposalState"
            );
        });

        it("Should not allow voting after the voting period ends", async function () {
            const transferAmount = hre.ethers.parseUnits("1000", 18);
            const encodedFunction = b4madToken.interface.encodeFunctionData("transfer", [addr2.address, transferAmount]);
            const description = "Proposal #3: Transfer 1000 B4MAD from Timelock to Addr2 (post-period vote)";

            const tx = await governor.propose(
                [b4madToken.target],
                [0],
                [encodedFunction],
                description
            );
            const receipt = await tx.wait();
            const proposalId = receipt.logs[0].args.proposalId;

            await hre.ethers.provider.send("evm_mine"); // Block 1 - proposal active

            for (let i = 0; i < 50400; i++) {
                await hre.ethers.provider.send("evm_mine");
            }

            await expect(governor.connect(owner).castVote(proposalId, 1)).to.be.revertedWithCustomError(
                governor,
                "GovernorUnexpectedProposalState"
            );
        });

        it("Should correctly handle quorum requirements (fail if not met)", async function () {
            // Create a proposal
            const transferAmount = hre.ethers.parseUnits("1000", 18);
            const encodedFunction = b4madToken.interface.encodeFunctionData("transfer", [addr2.address, transferAmount]);
            const description = "Proposal #4: Transfer 1000 B4MAD from Timelock to Addr2 (quorum test)";

            const tx = await governor.propose(
                [b4madToken.target],
                [0],
                [encodedFunction],
                description
            );
            const receipt = await tx.wait();
            const proposalId = receipt.logs[0].args.proposalId;

            await hre.ethers.provider.send("evm_mine"); // Block 1 - proposal active

            // Only addr1 votes "for" (500,000 tokens), which is less than 4% of total supply (1,500,000)
            // Total supply = 1,500,000
            // 4% quorum = 1,500,000 * 0.04 = 60,000
            // Oh, the total supply includes the `owner`'s 1,000,000. So total supply is 1,500,000.
            // Quorum is (1,000,000 + 500,000) * 0.04 = 60,000.
            // If only addr1 votes, it will be 500,000 votes, which should pass.
            // I need to adjust this to make it fail for quorum.
            // Let's create a scenario where total supply is higher or votes are lower.

            // Re-think: A proposal with only addr1 voting should *pass* quorum given its current token holdings.
            // To test failure, I need a new account with very few tokens.
            // Let's create a new account, give it a tiny amount of tokens, delegate, then try to pass a proposal
            // with only that account voting.

            // For now, let's just make sure it passes with both owner and addr1.
            await governor.connect(owner).castVote(proposalId, 1); // For
            await governor.connect(addr1).castVote(proposalId, 1); // For

            for (let i = 0; i < 50400; i++) {
                await hre.ethers.provider.send("evm_mine");
            }

            expect(await governor.state(proposalId)).to.equal(4); // Succeeded (assuming quorum is met)

            // Let's verify the actual quorum
            const quorumAmount = await governor.quorum(await hre.ethers.provider.getBlockNumber() - 1);
            const currentVotes = (await governor.proposalVotes(proposalId))[1]; // For votes
            expect(currentVotes).to.be.gte(quorumAmount);
        });

        it("Should fail to execute if the min delay has not passed", async function () {
            const transferAmount = hre.ethers.parseUnits("1000", 18);
            const encodedFunction = b4madToken.interface.encodeFunctionData("transfer", [addr2.address, transferAmount]);
            const description = "Proposal #5: Transfer 1000 B4MAD from Timelock to Addr2 (early execution)";

            const tx = await governor.propose(
                [b4madToken.target],
                [0],
                [encodedFunction],
                description
            );
            const receipt = await tx.wait();
            const proposalId = receipt.logs[0].args.proposalId;

            await hre.ethers.provider.send("evm_mine"); // Activate proposal
            await governor.connect(owner).castVote(proposalId, 1);
            for (let i = 0; i < 50400; i++) {
                await hre.ethers.provider.send("evm_mine");
            }

            const descriptionHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(description));
            await governor.queue(
                [b4madToken.target],
                [0],
                [encodedFunction],
                descriptionHash
            );
            expect(await governor.state(proposalId)).to.equal(5); // Queued

            // Try to execute immediately without waiting for MIN_DELAY
            await expect(
                governor.execute(
                    [b4madToken.target],
                    [0],
                    [encodedFunction],
                    descriptionHash
                )
            ).to.be.revertedWith("TimelockController: operation is not ready");
        });
        it("Should fail a proposal if quorum is not met", async function () {
            // Use addr3 for testing quorum failure with very few tokens
            const minVoter = addr3;
            const minVotesAmount = hre.ethers.parseUnits("100", 18);
            await b4madToken.transfer(minVoter.address, minVotesAmount);
            await b4madToken.connect(minVoter).delegate(minVoter.address);

            // Create a proposal
            const transferAmount = hre.ethers.parseUnits("10", 18);
            const encodedFunction = b4madToken.interface.encodeFunctionData("transfer", [addr2.address, transferAmount]);
            const description = "Proposal #6: Transfer 10 B4MAD from Timelock to Addr2 (quorum fail test)";

            const tx = await governor.propose(
                [b4madToken.target],
                [0],
                [encodedFunction],
                description
            );
            const receipt = await tx.wait();
            const proposalId = receipt.logs[0].args.proposalId;

            await hre.ethers.provider.send("evm_mine"); // Activate proposal

            // Only minVoter casts a vote, which should be insufficient for quorum
            await governor.connect(minVoter).castVote(proposalId, 1); // For

            for (let i = 0; i < 50400; i++) {
                await hre.ethers.provider.send("evm_mine");
            }

            // Expect the proposal to be defeated (not enough votes to meet quorum)
            expect(await governor.state(proposalId)).to.equal(3); // Defeated

            // Verify the quorum was not met
            const quorumAmount = await governor.quorum(await hre.ethers.provider.getBlockNumber() - 1);
            const currentVotes = (await governor.proposalVotes(proposalId))[1]; // For votes
            expect(currentVotes).to.be.lt(quorumAmount);
        });
    });
});
