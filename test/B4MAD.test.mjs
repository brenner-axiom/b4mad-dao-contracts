import { expect } from "chai";
import hre from "hardhat";

describe("B4MAD Token and Vesting", function() {
  const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n; // 1 billion tokens with 18 decimals
  const FOUNDER_ALLOCATION = 200_000_000n * 10n ** 18n; // 20%
  const CONTRIBUTOR_ALLOCATION = 150_000_000n * 10n ** 18n; // 15%
  const AGENT_ALLOCATION = 50_000_000n * 10n ** 18n; // 5%

  const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;

  async function deployContracts() {
    const [owner, founder, contributor, agent, otherAccount] =
    await hre.ethers.getSigners();

    const B4MAD = await hre.ethers.deployContract("B4MAD", [owner.address]);

    const B4MAD_ERC20_ADDRESS = B4MAD.target; // Using .target for ethers v6

    return {
      B4MAD,
      B4MAD_ERC20_ADDRESS,
      owner,
      founder,
      contributor,
      agent,
      otherAccount,
    };
  }

  describe("B4MAD Token Deployment and Basic Functionality", function() {
    it("Should have the correct name and symbol", async function() {
      const {
        B4MAD
      } = await deployContracts();
      expect(await B4MAD.name()).to.equal("B4MAD Token");
      expect(await B4MAD.symbol()).to.equal("B4MAD");
    });

    it("Should assign the total supply to the owner", async function() {
      const {
        B4MAD,
        owner
      } = await deployContracts();
      expect(await B4MAD.totalSupply()).to.equal(TOTAL_SUPPLY);
      expect(await B4MAD.balanceOf(owner.address)).to.equal(
        TOTAL_SUPPLY,
      );
    });

    it("Should allow transfers", async function() {
      const {
        B4MAD,
        owner,
        otherAccount
      } = await deployContracts();
      const transferAmount = 1000n * 10n ** 18n;
      await B4MAD.connect(owner).transfer(otherAccount.address, transferAmount);
      expect(await B4MAD.balanceOf(otherAccount.address)).to.equal(
        transferAmount,
      );
    });

    it("Should allow owner to burn tokens", async function() {
      const {
        B4MAD,
        owner
      } = await deployContracts();
      const burnAmount = 1000n * 10n ** 18n;
      const initialSupply = await B4MAD.totalSupply();

      await B4MAD.connect(owner).burn(burnAmount);

      expect(await B4MAD.totalSupply()).to.equal(
        initialSupply - burnAmount,
      );
      expect(await B4MAD.balanceOf(owner.address)).to.equal(
        initialSupply - burnAmount,
      );
    });

    it("Should not allow non-owner to burn tokens", async function() {
      const {
        B4MAD,
        otherAccount
      } = await deployContracts();
      const burnAmount = 1000n * 10n ** 18n;

      await expect(
        B4MAD.connect(otherAccount).burn(burnAmount),
      ).to.be.revertedWithCustomError("OwnableUnauthorizedAccount");
    });
  });

  describe("Vesting Wallet Functionality", function() {
    it("Should deploy VestingWallets and transfer allocations", async function() {
      const {
        B4MAD,
        B4MAD_ERC20_ADDRESS,
        owner,
        founder,
        contributor,
        agent,
      } = await deployContracts();

      const block = await hre.ethers.provider.getBlock("latest");
      const currentTime = BigInt(block.timestamp);
      const vestingStart = currentTime + 100n; // Vesting starts in 100 seconds
      const vestingDuration = BigInt(ONE_YEAR_IN_SECS); // 1 year

      // Deploy Founder Vesting Wallet
      const FounderVestingWallet = await hre.ethers.deployContract(
        "MyVestingWallet",
        [B4MAD_ERC20_ADDRESS, founder.address, vestingStart, vestingDuration],
      );

      // Deploy Contributor Vesting Wallet
      const ContributorVestingWallet = await hre.ethers.deployContract(
        "MyVestingWallet",
        [B4MAD_ERC20_ADDRESS, contributor.address, vestingStart, vestingDuration],
      );

      // Deploy Agent Vesting Wallet
      const AgentVestingWallet = await hre.ethers.deployContract(
        "MyVestingWallet",
        [B4MAD_ERC20_ADDRESS, agent.address, vestingStart, vestingDuration],
      );

      // Transfer tokens to vesting wallets
      await B4MAD.connect(owner).transfer(FounderVestingWallet.target, FOUNDER_ALLOCATION);
      await B4MAD.connect(owner).transfer(ContributorVestingWallet.target, CONTRIBUTOR_ALLOCATION);
      await B4MAD.connect(owner).transfer(AgentVestingWallet.target, AGENT_ALLOCATION);

      // Check balances of vesting wallets
      expect(await B4MAD.balanceOf(FounderVestingWallet.target)).to.equal(
        FOUNDER_ALLOCATION,
      );
      expect(await B4MAD.balanceOf(ContributorVestingWallet.target)).to.equal(
        CONTRIBUTOR_ALLOCATION,
      );
      expect(await B4MAD.balanceOf(AgentVestingWallet.target)).to.equal(
        AGENT_ALLOCATION,
      );

      // Check initial releasable amount (should be 0 before vesting starts)
      expect(await FounderVestingWallet.releasable(B4MAD_ERC20_ADDRESS)).to.equal(
        0n,
      );

      // Advance time and release tokens
      await hre.network.provider.send("evm_setNextBlockTimestamp", [Number(vestingStart + BigInt(ONE_YEAR_IN_SECS) / 2n)]);
      await hre.network.provider.send("evm_mine", []); // Half way through vesting
      expect(await FounderVestingWallet.releasable(B4MAD_ERC20_ADDRESS)).to.be.above(0n);

      const founderInitialBalance = await B4MAD.balanceOf(founder.address);
      await FounderVestingWallet.connect(founder).release(B4MAD_ERC20_ADDRESS); // beneficiary releases
      expect(await B4MAD.balanceOf(founder.address)).to.be.above(
        founderInitialBalance,
      );

      // Advance time to end of vesting
      await hre.network.provider.send("evm_setNextBlockTimestamp", [Number(vestingStart + BigInt(ONE_YEAR_IN_SECS))]);
      await hre.network.provider.send("evm_mine", []);
      await FounderVestingWallet.connect(founder).release(B4MAD_ERC20_ADDRESS); // beneficiary releases
      expect(await B4MAD.balanceOf(founder.address)).to.equal(
        founderInitialBalance + FOUNDER_ALLOCATION,
      ); // Should have received all tokens
    });
  });

  describe("ERC20Votes and ERC20Permit Functionality", function() {
    const TOKEN_AMOUNT = 1000n * 10n ** 18n;

    it("Should have zero votes initially", async function() {
      const { B4MAD, owner, otherAccount } = await deployContracts();
      expect(await B4MAD.getVotes(owner.address)).to.equal(0);
      expect(await B4MAD.getVotes(otherAccount.address)).to.equal(0);
    });

    it("Should allow self-delegation", async function() {
      const { B4MAD, owner } = await deployContracts();
      await B4MAD.connect(owner).delegate(owner.address);
      expect(await B4MAD.getVotes(owner.address)).to.equal(TOTAL_SUPPLY);
    });

    it("Should allow delegation to another account", async function() {
      const { B4MAD, owner, otherAccount } = await deployContracts();
      await B4MAD.connect(owner).delegate(otherAccount.address);
      expect(await B4MAD.getVotes(owner.address)).to.equal(0);
      expect(await B4MAD.getVotes(otherAccount.address)).to.equal(TOTAL_SUPPLY);
    });

    it("Should update votes after transfer and delegation", async function() {
      const { B4MAD, owner, otherAccount } = await deployContracts();

      // Owner delegates to self
      await B4MAD.connect(owner).delegate(owner.address);
      expect(await B4MAD.getVotes(owner.address)).to.equal(TOTAL_SUPPLY);

      // Owner transfers some tokens
      await B4MAD.connect(owner).transfer(otherAccount.address, TOKEN_AMOUNT);
      expect(await B4MAD.getVotes(owner.address)).to.equal(TOTAL_SUPPLY - TOKEN_AMOUNT);
      expect(await B4MAD.getVotes(otherAccount.address)).to.equal(0); // otherAccount has tokens but hasn't delegated

      // otherAccount delegates to self
      await B4MAD.connect(otherAccount).delegate(otherAccount.address);
      expect(await B4MAD.getVotes(otherAccount.address)).to.equal(TOKEN_AMOUNT);

      // Owner delegates to otherAccount after transfer
      await B4MAD.connect(owner).delegate(otherAccount.address);
      expect(await B4MAD.getVotes(owner.address)).to.equal(0);
      expect(await B4MAD.getVotes(otherAccount.address)).to.equal(TOTAL_SUPPLY);
    });

    it("Should return past votes correctly with getPastVotes", async function() {
      const { B4MAD, owner, otherAccount } = await deployContracts();
      let blockNumber = await hre.ethers.provider.getBlockNumber();

      // Initial state
      expect(await B4MAD.getPastVotes(owner.address, blockNumber)).to.equal(0);

      // Owner self-delegates
      await B4MAD.connect(owner).delegate(owner.address);
      blockNumber = await hre.ethers.provider.getBlockNumber();
      expect(await B4MAD.getPastVotes(owner.address, blockNumber)).to.equal(TOTAL_SUPPLY);
      expect(await B4MAD.getPastVotes(owner.address, blockNumber - 1)).to.equal(0);

      // Owner transfers tokens
      await B4MAD.connect(owner).transfer(otherAccount.address, TOKEN_AMOUNT);
      blockNumber = await hre.ethers.provider.getBlockNumber();
      expect(await B4MAD.getPastVotes(owner.address, blockNumber)).to.equal(TOTAL_SUPPLY - TOKEN_AMOUNT);
      expect(await B4MAD.getPastVotes(owner.address, blockNumber - 1)).to.equal(TOTAL_SUPPLY);

      // otherAccount delegates to self
      await B4MAD.connect(otherAccount).delegate(otherAccount.address);
      blockNumber = await hre.ethers.provider.getBlockNumber();
      expect(await B4MAD.getPastVotes(otherAccount.address, blockNumber)).to.equal(TOKEN_AMOUNT);
      expect(await B4MAD.getPastVotes(otherAccount.address, blockNumber - 1)).to.equal(0);

      // Owner delegates to otherAccount
      await B4MAD.connect(owner).delegate(otherAccount.address);
      blockNumber = await hre.ethers.provider.getBlockNumber();
      expect(await B4MAD.getPastVotes(owner.address, blockNumber)).to.equal(0);
      expect(await B4MAD.getPastVotes(otherAccount.address, blockNumber)).to.equal(TOTAL_SUPPLY);
    });

    it("Should allow permit for approval", async function() {
      const { B4MAD, owner, otherAccount } = await deployContracts();
      const value = TOKEN_AMOUNT;
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      // Get the current nonce for the owner
      const nonce = await B4MAD.nonces(owner.address);

      // Define the EIP712 domain (same as ERC20Permit's internal domain)
      const domain = {
        name: await B4MAD.name(),
        version: "1",
        chainId: (await hre.ethers.provider.getNetwork()).chainId,
        verifyingContract: B4MAD.target,
      };

      // Define the EIP712 types for the Permit function
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      // Define the message to sign
      const message = {
        owner: owner.address,
        spender: otherAccount.address,
        value: value,
        nonce: nonce,
        deadline: deadline,
      };

      // Sign the permit message
      const signature = await owner.signTypedData(domain, types, message);
      const { v, r, s } = hre.ethers.Signature.from(signature);

      // Use the permit function
      await B4MAD.permit(owner.address, otherAccount.address, value, deadline, v, r, s);

      // Verify the approval
      expect(await B4MAD.allowance(owner.address, otherAccount.address)).to.equal(value);
    });
  });
});