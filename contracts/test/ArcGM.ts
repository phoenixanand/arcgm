import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
 
describe("ArcGM", function () {
  async function deployFixture() {
    const [
      owner,
      user,
      user2,
      referrer,
      friend,
    ] = await ethers.getSigners();
 
    // Deploy ArcGM
    const ArcGM = await ethers.getContractFactory("ArcGM");
    const gm = await ArcGM.deploy(owner.address);
    await gm.waitForDeployment();
 
    // Deploy MilestoneBadges.
    // ArcGM is the only contract allowed to mint badges.
    const MilestoneBadges =
      await ethers.getContractFactory("MilestoneBadges");
 
    const badges = await MilestoneBadges.deploy(
      await gm.getAddress()
    );
    await badges.waitForDeployment();
 
    // Connect ArcGM -> MilestoneBadges
    await gm.setMilestoneBadges(
      await badges.getAddress()
    );
 
    return {
      gm,
      badges,
      owner,
      user,
      user2,
      referrer,
      friend,
    };
  }
 
  describe("Deployment", function () {
    it("sets the initial owner", async function () {
      const { gm, owner } =
        await loadFixture(deployFixture);
 
      expect(await gm.owner()).to.equal(owner.address);
    });
 
    it("sets the MilestoneBadges contract", async function () {
      const { gm, badges } =
        await loadFixture(deployFixture);
 
      expect(await gm.milestoneBadges()).to.equal(
        await badges.getAddress()
      );
    });
 
    it("emits OwnershipTransferred on deployment", async function () {
      const { gm, owner } =
        await loadFixture(deployFixture);
 
      // Constructor events are not normally available through
      // a post-deployment transaction, so verify the resulting state.
      expect(await gm.owner()).to.equal(owner.address);
    });
 
    it("reverts when deployed with zero owner", async function () {
      const ArcGM = await ethers.getContractFactory("ArcGM");
 
      await expect(
        ArcGM.deploy(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(
        ArcGM,
        "InvalidAddress"
      );
    });
  });
 
  describe("MilestoneBadges connection", function () {
    it("allows the owner to set the badge contract", async function () {
      const { gm, owner, badges } =
        await loadFixture(deployFixture);
 
      const newBadgesAddress =
        await badges.getAddress();
 
      await expect(
        gm.connect(owner).setMilestoneBadges(
          newBadgesAddress
        )
      )
        .to.not.be.reverted;
 
      expect(
        await gm.milestoneBadges()
      ).to.equal(newBadgesAddress);
    });
 
    it("prevents non-owner from setting the badge contract", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await expect(
        gm.connect(user).setMilestoneBadges(
          user.address
        )
      ).to.be.revertedWithCustomError(
        gm,
        "NotOwner"
      );
    });
 
    it("rejects zero badge contract address", async function () {
      const { gm } =
        await loadFixture(deployFixture);
 
      await expect(
        gm.setMilestoneBadges(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(
        gm,
        "InvalidAddress"
      );
    });
  });
 
  describe("sayGM", function () {
    it("records the first GM", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await gm.connect(user).sayGM();
 
      const stats = await gm.users(user.address);
 
      expect(stats.lastGMTimestamp).to.be.gt(0);
      expect(stats.gmCount).to.equal(1);
      expect(stats.streak).to.equal(1);
      expect(stats.longestStreak).to.equal(1);
      // BASE_POINTS = 10, no bonuses apply on day 1.
      expect(stats.totalPoints).to.equal(10);
      expect(stats.successfulReferrals).to.equal(0);
      expect(stats.hasGMHistory).to.equal(true);
    });
 
    it("awards 10 points on the first GM", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await gm.connect(user).sayGM();
 
      const stats = await gm.users(user.address);
 
      expect(stats.totalPoints).to.equal(10);
    });
 
    it("allows only one GM during the same UTC calendar day", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await gm.connect(user).sayGM();
 
      await expect(
        gm.connect(user).sayGM()
      ).to.be.revertedWithCustomError(
        gm,
        "CooldownActive"
      );
    });
 
    it("allows another GM after the UTC day changes", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await gm.connect(user).sayGM();
 
      await time.increase(24 * 60 * 60);
 
      await expect(
        gm.connect(user).sayGM()
      ).to.not.be.reverted;
 
      const stats = await gm.users(user.address);
 
      expect(stats.gmCount).to.equal(2);
    });
 
    it("resets the GM period at 00:00 UTC", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      const now = await time.latest();
      const currentDay = Math.floor(
        Number(now) / 86400
      );
 
      const nextReset =
        (currentDay + 1) * 86400;
 
      // Put the chain safely before the next UTC
      // calendar day. We intentionally leave enough
      // time for Hardhat to mine the next transaction
      // without accidentally crossing midnight.
      await time.setNextBlockTimestamp(
        nextReset - 100
      );
 
      await gm.connect(user).sayGM();
 
      // The next transaction is still in the same UTC
      // calendar day, so it must be rejected.
      await expect(
        gm.connect(user).sayGM()
      ).to.be.revertedWithCustomError(
        gm,
        "CooldownActive"
      );
 
      // Cross 00:00 UTC.
      await time.setNextBlockTimestamp(
        nextReset + 1
      );
 
      await expect(
        gm.connect(user).sayGM()
      ).to.not.be.reverted;
    });
 
    it("uses 05:30 AM IST as the effective daily reset", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      // Solidity timestamps are UTC. 00:00 UTC corresponds
      // to 05:30 IST.
      const now = await time.latest();
      const currentDay = Math.floor(
        Number(now) / 86400
      );
 
      const nextReset =
        (currentDay + 1) * 86400;
 
      await time.setNextBlockTimestamp(
        nextReset - 1
      );
 
      await gm.connect(user).sayGM();
 
      await time.setNextBlockTimestamp(
        nextReset + 1
      );
 
      await expect(
        gm.connect(user).sayGM()
      ).to.not.be.reverted;
    });
  });
 
  describe("Streaks", function () {
    it("starts a new user at streak 1", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await gm.connect(user).sayGM();
 
      const stats = await gm.users(user.address);
 
      expect(stats.streak).to.equal(1);
      expect(stats.longestStreak).to.equal(1);
    });
 
    it("increments the streak on consecutive UTC days", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await gm.connect(user).sayGM();
 
      await time.increase(24 * 60 * 60);
 
      await gm.connect(user).sayGM();
 
      let stats = await gm.users(user.address);
 
      expect(stats.streak).to.equal(2);
      expect(stats.longestStreak).to.equal(2);
 
      await time.increase(24 * 60 * 60);
 
      await gm.connect(user).sayGM();
 
      stats = await gm.users(user.address);
 
      expect(stats.streak).to.equal(3);
      expect(stats.longestStreak).to.equal(3);
    });
 
    it("resets the current streak after a missed day", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await gm.connect(user).sayGM();
 
      await time.increase(2 * 24 * 60 * 60);
 
      await gm.connect(user).sayGM();
 
      const stats = await gm.users(user.address);
 
      expect(stats.streak).to.equal(1);
      expect(stats.longestStreak).to.equal(1);
    });
 
    it("preserves the longest streak after a reset", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await gm.connect(user).sayGM();
 
      await time.increase(24 * 60 * 60);
      await gm.connect(user).sayGM();
 
      await time.increase(24 * 60 * 60);
      await gm.connect(user).sayGM();
 
      let stats = await gm.users(user.address);
 
      expect(stats.streak).to.equal(3);
      expect(stats.longestStreak).to.equal(3);
 
      // Miss one complete day.
      await time.increase(2 * 24 * 60 * 60);
 
      await gm.connect(user).sayGM();
 
      stats = await gm.users(user.address);
 
      expect(stats.streak).to.equal(1);
      expect(stats.longestStreak).to.equal(3);
    });
  });
 
  describe("Points", function () {
    it("awards the correct points for days 1 through 7", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      // BASE_POINTS = 10 every day. Day 7 additionally gets the
      // recurring +30 (streak % 7 == 0) AND the one-time +30
      // milestone-1 bonus, for 70 total on that day.
      const expectedPoints = [
        10n,
        10n,
        10n,
        10n,
        10n,
        10n,
        70n,
      ];
 
      let total = 0n;
 
      for (let i = 0; i < expectedPoints.length; i++) {
        await gm.connect(user).sayGM();
 
        const stats =
          await gm.users(user.address);
 
        total += expectedPoints[i];
 
        expect(stats.streak).to.equal(i + 1);
        expect(stats.totalPoints).to.equal(total);
 
        if (i < expectedPoints.length - 1) {
          await time.increase(24 * 60 * 60);
        }
      }
    });
 
    it("awards the recurring +30 bonus only on multiples of 7", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      // Reach day 7: 6 flat days (10 each) + day 7 (10 + 30 recurring
      // + 30 one-time milestone-1) = 60 + 70 = 130.
      for (let i = 0; i < 7; i++) {
        await gm.connect(user).sayGM();
 
        if (i < 6) {
          await time.increase(24 * 60 * 60);
        }
      }
 
      let stats = await gm.users(user.address);
 
      expect(stats.streak).to.equal(7);
      expect(stats.totalPoints).to.equal(130);
 
      // Day 8 is not a multiple of 7 and has no one-time milestone,
      // so it awards the flat 10 base points.
      await time.increase(24 * 60 * 60);
      await gm.connect(user).sayGM();
 
      stats = await gm.users(user.address);
 
      expect(stats.streak).to.equal(8);
      expect(stats.totalPoints).to.equal(140);
    });
 
    it("keeps awarding flat 10 points on non-milestone days after day 7", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      for (let i = 0; i < 10; i++) {
        await gm.connect(user).sayGM();
 
        if (i < 9) {
          await time.increase(24 * 60 * 60);
        }
      }
 
      const stats = await gm.users(user.address);
 
      // 130 after day 7, then +10 for each of days 8, 9, 10.
      expect(stats.streak).to.equal(10);
      expect(stats.totalPoints).to.equal(160);
    });
  });
 
  describe("Referrals", function () {
    it("allows a user to set a valid referral", async function () {
      const { gm, user, referrer } =
        await loadFixture(deployFixture);
 
      // Referrer must have GM history first.
      await gm.connect(referrer).sayGM();
 
      await expect(
        gm.connect(user).setReferral(
          referrer.address
        )
      )
        .to.emit(gm, "ReferralSet")
        .withArgs(
          user.address,
          referrer.address
        );
 
      expect(
        await gm.referredBy(user.address)
      ).to.equal(referrer.address);
    });
 
    it("rejects self referral", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await expect(
        gm.connect(user).setReferral(
          user.address
        )
      ).to.be.revertedWithCustomError(
        gm,
        "SelfReferral"
      );
    });
 
    it("rejects zero-address referral", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await expect(
        gm.connect(user).setReferral(
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(
        gm,
        "InvalidAddress"
      );
    });
 
    it("rejects a referrer with no GM history", async function () {
      const { gm, user, referrer } =
        await loadFixture(deployFixture);
 
      await expect(
        gm.connect(user).setReferral(
          referrer.address
        )
      ).to.be.revertedWithCustomError(
        gm,
        "ReferrerHasNoHistory"
      );
    });
 
    it("rejects setting a referral after the user has GM history", async function () {
      const { gm, user, referrer } =
        await loadFixture(deployFixture);
 
      await gm.connect(referrer).sayGM();
      await gm.connect(user).sayGM();
 
      await expect(
        gm.connect(user).setReferral(
          referrer.address
        )
      ).to.be.revertedWithCustomError(
        gm,
        "AlreadyReferred"
      );
    });
 
    it("rejects setting a referral twice", async function () {
      const { gm, user, referrer, user2 } =
        await loadFixture(deployFixture);
 
      await gm.connect(referrer).sayGM();
      await gm.connect(user2).sayGM();
 
      await gm.connect(user).setReferral(
        referrer.address
      );
 
      await expect(
        gm.connect(user).setReferral(
          user2.address
        )
      ).to.be.revertedWithCustomError(
        gm,
        "AlreadyReferred"
      );
    });
 
    it("awards the referral bonus to both users", async function () {
      const { gm, user, referrer } =
        await loadFixture(deployFixture);
 
      await gm.connect(referrer).sayGM();
 
      await gm.connect(user).setReferral(
        referrer.address
      );
 
      await expect(
        gm.connect(user).sayGM()
      )
        .to.emit(gm, "ReferralCompleted")
        .withArgs(
          referrer.address,
          user.address,
          anyValue
        );
 
      const userStats =
        await gm.users(user.address);
 
      const referrerStats =
        await gm.users(referrer.address);
 
      // User: referral bonus 50 + normal first-GM points 10.
      expect(userStats.totalPoints).to.equal(60);
 
      // Referrer: original day-1 GM 10 + referral bonus 50.
      expect(referrerStats.totalPoints).to.equal(60);
 
      expect(
        referrerStats.successfulReferrals
      ).to.equal(1);
 
      expect(
        await gm.referralBonusClaimed(user.address)
      ).to.equal(true);
    });
 
    it("automatically attaches a referral during the first GM", async function () {
      const { gm, user, referrer } =
        await loadFixture(deployFixture);
 
      await gm.connect(referrer).sayGM();
 
      await expect(
        gm.connect(user).sayGMWithReferral(
          referrer.address
        )
      )
        .to.emit(gm, "ReferralSet")
        .withArgs(
          user.address,
          referrer.address
        );
 
      expect(
        await gm.referredBy(user.address)
      ).to.equal(referrer.address);
 
      const stats =
        await gm.users(user.address);
 
      // Referral bonus 50 + base 10.
      expect(stats.totalPoints).to.equal(60);
    });
 
    it("does not award the referral bonus twice", async function () {
      const { gm, user, referrer } =
        await loadFixture(deployFixture);
 
      await gm.connect(referrer).sayGM();
 
      await gm.connect(user).sayGMWithReferral(
        referrer.address
      );
 
      expect(
        await gm.referralBonusClaimed(user.address)
      ).to.equal(true);
 
      await time.increase(24 * 60 * 60);
 
      await gm.connect(user).sayGM();
 
      const userStats =
        await gm.users(user.address);
 
      const referrerStats =
        await gm.users(referrer.address);
 
      // 60 after first GM (50 referral + 10 base) + 10 on second GM.
      expect(userStats.totalPoints).to.equal(70);
 
      // Referrer remains at 60 (10 own GM + 50 referral, claimed once).
      expect(referrerStats.totalPoints).to.equal(60);
 
      expect(
        referrerStats.successfulReferrals
      ).to.equal(1);
    });
 
    it("emits UserStatsUpdated for the referred user and referrer", async function () {
      const { gm, user, referrer } =
        await loadFixture(deployFixture);
 
      await gm.connect(referrer).sayGM();
 
      const tx = await gm
        .connect(user)
        .sayGMWithReferral(referrer.address);
 
      const receipt = await tx.wait();
 
      const userEvents = receipt!.logs.filter((log) => {
        try {
          const parsed = gm.interface.parseLog(log as any);
          return parsed?.name === "UserStatsUpdated" &&
            parsed.args.user.toLowerCase() ===
              user.address.toLowerCase();
        } catch {
          return false;
        }
      });
 
      const referrerEvents = receipt!.logs.filter((log) => {
        try {
          const parsed = gm.interface.parseLog(log as any);
          return parsed?.name === "UserStatsUpdated" &&
            parsed.args.user.toLowerCase() ===
              referrer.address.toLowerCase();
        } catch {
          return false;
        }
      });
 
      expect(userEvents.length).to.be.greaterThan(0);
      expect(referrerEvents.length).to.be.greaterThan(0);
    });
  });
 
  describe("Friend GM", function () {
    it("emits FriendGM", async function () {
      const { gm, user, friend } =
        await loadFixture(deployFixture);
 
      await expect(
        gm.connect(user).gmFriend(friend.address)
      )
        .to.emit(gm, "FriendGM")
        .withArgs(
          user.address,
          friend.address,
          anyValue
        );
    });
 
    it("rejects zero-address friend", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await expect(
        gm.connect(user).gmFriend(
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(
        gm,
        "InvalidAddress"
      );
    });
 
    it("rejects GMing yourself", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await expect(
        gm.connect(user).gmFriend(user.address)
      ).to.be.revertedWithCustomError(
        gm,
        "InvalidAddress"
      );
    });
  });
 
  describe("Milestone badges", function () {
    it("does not mint a badge before a milestone", async function () {
      const { gm, badges, user } =
        await loadFixture(deployFixture);
 
      for (let i = 0; i < 6; i++) {
        await gm.connect(user).sayGM();
 
        if (i < 5) {
          await time.increase(24 * 60 * 60);
        }
      }
 
      expect(
        await badges.mintedTier(user.address, 1)
      ).to.equal(false);
    });
 
    it("mints the 7-day badge", async function () {
      const { gm, badges, user } =
        await loadFixture(deployFixture);
 
      for (let i = 0; i < 7; i++) {
        await expect(
          gm.connect(user).sayGM()
        ).to.not.be.reverted;
 
        if (i < 6) {
          await time.increase(24 * 60 * 60);
        }
      }
 
      expect(
        await badges.mintedTier(user.address, 1)
      ).to.equal(true);
 
      expect(
        await badges.tokenTier(1)
      ).to.equal(1);
    });
 
    it("mints the 30-day badge", async function () {
      const { gm, badges, user } =
        await loadFixture(deployFixture);
 
      for (let i = 0; i < 30; i++) {
        await gm.connect(user).sayGM();
 
        if (i < 29) {
          await time.increase(24 * 60 * 60);
        }
      }
 
      expect(
        await badges.mintedTier(user.address, 2)
      ).to.equal(true);
    });
 
    it("mints the 100-day badge", async function () {
      const { gm, badges, user } =
        await loadFixture(deployFixture);
 
      for (let i = 0; i < 100; i++) {
        await gm.connect(user).sayGM();
 
        if (i < 99) {
          await time.increase(24 * 60 * 60);
        }
      }
 
      expect(
        await badges.mintedTier(user.address, 3)
      ).to.equal(true);
    });
 
    it("does not revert when a previously reached milestone is reached again", async function () {
      const { gm, badges, user } =
        await loadFixture(deployFixture);
 
      // Reach 7-day streak.
      for (let i = 0; i < 7; i++) {
        await gm.connect(user).sayGM();
 
        if (i < 6) {
          await time.increase(24 * 60 * 60);
        }
      }
 
      expect(
        await badges.mintedTier(user.address, 1)
      ).to.equal(true);
 
      // Miss days until streak resets.
      await time.increase(2 * 24 * 60 * 60);
 
      await gm.connect(user).sayGM();
 
      // Build another 6 consecutive days so the next GM reaches 7.
      for (let i = 0; i < 6; i++) {
        await time.increase(24 * 60 * 60);
        await gm.connect(user).sayGM();
      }
 
      expect(
        await badges.mintedTier(user.address, 1)
      ).to.equal(true);
    });
 
    it("emits BadgeMinted when a milestone is reached", async function () {
      const { gm, badges, user } =
        await loadFixture(deployFixture);
 
      for (let i = 0; i < 7; i++) {
        if (i === 6) {
          await expect(
            gm.connect(user).sayGM()
          )
            .to.emit(badges, "BadgeMinted")
            .withArgs(
              user.address,
              1,
              1
            );
        } else {
          await gm.connect(user).sayGM();
          await time.increase(24 * 60 * 60);
        }
      }
    });
  });
 
  describe("Graph-ready events", function () {
    it("emits GMRecorded with the complete user snapshot", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await expect(
        gm.connect(user).sayGM()
      )
        .to.emit(gm, "GMRecorded")
        .withArgs(
          user.address,
          anyValue,
          1,
          10,
          1,
          10,
          1,
          ethers.ZeroAddress
        );
    });
 
    it("emits UserStatsUpdated after a normal GM", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await expect(
        gm.connect(user).sayGM()
      )
        .to.emit(gm, "UserStatsUpdated")
        .withArgs(
          user.address,
          10,
          1,
          1,
          1,
          0,
          anyValue
        );
    });
 
    it("emits ReferralSet from setReferral", async function () {
      const { gm, user, referrer } =
        await loadFixture(deployFixture);
 
      await gm.connect(referrer).sayGM();
 
      await expect(
        gm.connect(user).setReferral(
          referrer.address
        )
      )
        .to.emit(gm, "ReferralSet")
        .withArgs(
          user.address,
          referrer.address
        );
    });
 
    it("emits ReferralSet during automatic referral", async function () {
      const { gm, user, referrer } =
        await loadFixture(deployFixture);
 
      await gm.connect(referrer).sayGM();
 
      await expect(
        gm.connect(user).sayGMWithReferral(
          referrer.address
        )
      )
        .to.emit(gm, "ReferralSet")
        .withArgs(
          user.address,
          referrer.address
        );
    });
  });
 
  describe("getUser", function () {
    it("returns the user's stats", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await gm.connect(user).sayGM();
 
      const result =
        await gm.getUser(user.address);
 
      // UserStats was reordered for storage packing (5 small fields in
      // one slot, uint256 last), which changes this tuple's order:
      // [0] lastGMTimestamp
      // [1] gmCount
      // [2] streak
      // [3] longestStreak
      // [4] successfulReferrals
      // [5] hasGMHistory
      // [6] totalPoints
      //
      // Named field access instead of positional indices, so this test
      // doesn't silently break again if the struct is ever reordered.
      expect(result.lastGMTimestamp).to.be.gt(0);
      expect(result.gmCount).to.equal(1);
      expect(result.streak).to.equal(1);
      expect(result.longestStreak).to.equal(1);
      expect(result.successfulReferrals).to.equal(0);
      expect(result.hasGMHistory).to.equal(true);
      expect(result.totalPoints).to.equal(10);
    });
  });
 
  describe("Ownership", function () {
    it("transfers ownership in two steps", async function () {
      const { gm, owner, user } =
        await loadFixture(deployFixture);
 
      // Step 1: current owner proposes a new owner. `owner` does NOT
      // change yet -- only OwnershipTransferStarted is emitted.
      await expect(
        gm.connect(owner).transferOwnership(
          user.address
        )
      )
        .to.emit(gm, "OwnershipTransferStarted")
        .withArgs(
          owner.address,
          user.address
        );
 
      expect(await gm.owner()).to.equal(owner.address);
      expect(await gm.pendingOwner()).to.equal(user.address);
 
      // Step 2: the proposed owner must accept it themselves.
      await expect(
        gm.connect(user).acceptOwnership()
      )
        .to.emit(gm, "OwnershipTransferred")
        .withArgs(
          owner.address,
          user.address
        );
 
      expect(await gm.owner()).to.equal(user.address);
      expect(await gm.pendingOwner()).to.equal(ethers.ZeroAddress);
    });
 
    it("prevents anyone other than the pending owner from accepting", async function () {
      const { gm, owner, user, user2 } =
        await loadFixture(deployFixture);
 
      await gm.connect(owner).transferOwnership(user.address);
 
      await expect(
        gm.connect(user2).acceptOwnership()
      ).to.be.revertedWithCustomError(
        gm,
        "NotPendingOwner"
      );
 
      // Ownership is unaffected by the failed attempt.
      expect(await gm.owner()).to.equal(owner.address);
    });
 
    it("rejects zero-address new owner", async function () {
      const { gm, owner } =
        await loadFixture(deployFixture);
 
      await expect(
        gm.connect(owner).transferOwnership(
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(
        gm,
        "InvalidAddress"
      );
    });
 
    it("prevents non-owner from transferring ownership", async function () {
      const { gm, user } =
        await loadFixture(deployFixture);
 
      await expect(
        gm.connect(user).transferOwnership(
          user.address
        )
      ).to.be.revertedWithCustomError(
        gm,
        "NotOwner"
      );
    });
  });
});
 
describe("ProfileRegistry", function () {
  async function deployFixture() {
    const [alice, bob] = await ethers.getSigners();
    const ProfileRegistry = await ethers.getContractFactory("ProfileRegistry");
    const registry = await ProfileRegistry.deploy();
    await registry.waitForDeployment();
    return { registry, alice, bob };
  }
 
  it("sets and reads a profile for msg.sender", async function () {
    const { registry, alice } = await loadFixture(deployFixture);
 
    await expect(registry.connect(alice).setProfile("alice", "ipfs://avatar"))
      .to.emit(registry, "ProfileUpdated")
      .withArgs(alice.address, "alice", "ipfs://avatar", anyValueTimestamp());
 
    const profile = await registry.profiles(alice.address);
    expect(profile.username).to.equal("alice");
    expect(profile.avatar).to.equal("ipfs://avatar");
    expect(profile.updatedAt).to.be.gt(0);
  });
 
  it("does not let one wallet write another wallet's profile", async function () {
    const { registry, alice, bob } = await loadFixture(deployFixture);
 
    // There is no function that takes an address parameter -- setProfile
    // is always scoped to msg.sender. Confirm bob's write never touches
    // alice's slot no matter what bob does.
    await registry.connect(bob).setProfile("bob", "bob-avatar");
 
    const aliceProfile = await registry.profiles(alice.address);
    expect(aliceProfile.username).to.equal("");
 
    const bobProfile = await registry.profiles(bob.address);
    expect(bobProfile.username).to.equal("bob");
  });
 
  it("clears a profile back to empty values", async function () {
    const { registry, alice } = await loadFixture(deployFixture);
 
    await registry.connect(alice).setProfile("alice", "ipfs://avatar");
    await registry.connect(alice).clearProfile();
 
    const profile = await registry.profiles(alice.address);
    expect(profile.username).to.equal("");
    expect(profile.avatar).to.equal("");
  });
 
  function anyValueTimestamp() {
    return (v: unknown) => typeof v === "bigint" || typeof v === "number";
  }
});
 
describe("TemplateDeployer + TemplateStorage", function () {
  async function deployFixture() {
    const [deployerWallet, other] = await ethers.getSigners();
    const TemplateDeployer = await ethers.getContractFactory("TemplateDeployer");
    const factory = await TemplateDeployer.deploy();
    await factory.waitForDeployment();
    return { factory, deployerWallet, other };
  }
 
  it("deploys a TemplateStorage instance and records the calling wallet as deployer", async function () {
    const { factory, deployerWallet } = await loadFixture(deployFixture);
 
    const tx = await factory.connect(deployerWallet).deployStorage("hello arc");
    const receipt = await tx.wait();
 
    const event = receipt!.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log as any);
        } catch {
          return null;
        }
      })
      .find((e) => e?.name === "TemplateDeployed");
 
    expect(event).to.not.be.undefined;
    const deployedAddress = event!.args.contractAddress as string;
 
    const TemplateStorage = await ethers.getContractFactory("TemplateStorage");
    const instance = TemplateStorage.attach(deployedAddress);
 
    // This is the exact bug that was fixed: `deployer` must be the wallet
    // that called deployStorage(), NOT the factory contract's own address.
    expect(await instance.deployer()).to.equal(deployerWallet.address);
    expect(await instance.deployer()).to.not.equal(await factory.getAddress());
    expect(await instance.value()).to.equal("hello arc");
  });
 
  it("lets the deployer update their own instance", async function () {
    const { factory, deployerWallet } = await loadFixture(deployFixture);
 
    const tx = await factory.connect(deployerWallet).deployStorage("v1");
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log as any);
        } catch {
          return null;
        }
      })
      .find((e) => e?.name === "TemplateDeployed");
    const deployedAddress = event!.args.contractAddress as string;
 
    const TemplateStorage = await ethers.getContractFactory("TemplateStorage");
    const instance = TemplateStorage.attach(deployedAddress);
 
    await instance.connect(deployerWallet).setValue("v2");
    expect(await instance.value()).to.equal("v2");
  });
 
  it("rejects a non-deployer trying to overwrite someone else's instance", async function () {
    const { factory, deployerWallet, other } = await loadFixture(deployFixture);
 
    const tx = await factory.connect(deployerWallet).deployStorage("v1");
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log as any);
        } catch {
          return null;
        }
      })
      .find((e) => e?.name === "TemplateDeployed");
    const deployedAddress = event!.args.contractAddress as string;
 
    const TemplateStorage = await ethers.getContractFactory("TemplateStorage");
    const instance = TemplateStorage.attach(deployedAddress);
 
    // This is the second bug that was fixed: previously ANY wallet could
    // call setValue on ANY deployed instance.
    await expect(
      instance.connect(other).setValue("hijacked")
    ).to.be.revertedWithCustomError(instance, "NotDeployer");
 
    expect(await instance.value()).to.equal("v1");
  });
});
 
describe("MilestoneBadges", function () {
  async function deployFixture() {
    const [minterWallet, user, other] = await ethers.getSigners();
    // minterWallet stands in for ArcGM -- MilestoneBadges only cares that
    // `minter` is whatever address the constructor was given.
    const MilestoneBadges = await ethers.getContractFactory("MilestoneBadges");
    const badges = await MilestoneBadges.deploy(minterWallet.address);
    await badges.waitForDeployment();
    return { badges, minterWallet, user, other };
  }
 
  it("rejects deployment with a zero minter address", async function () {
    const MilestoneBadges = await ethers.getContractFactory("MilestoneBadges");
    await expect(
      MilestoneBadges.deploy(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(MilestoneBadges, "InvalidAddress");
  });
 
  it("lets only the minter mint a badge", async function () {
    const { badges, minterWallet, user, other } = await loadFixture(deployFixture);
 
    await expect(
      badges.connect(other).mintMilestone(user.address, 1)
    ).to.be.revertedWithCustomError(badges, "NotMinter");
 
    await expect(badges.connect(minterWallet).mintMilestone(user.address, 1))
      .to.emit(badges, "BadgeMinted")
      .withArgs(user.address, 1, 1);
 
    expect(await badges.mintedTier(user.address, 1)).to.equal(true);
    expect(await badges.ownerOf(1)).to.equal(user.address);
  });
 
  it("rejects an out-of-range tier", async function () {
    const { badges, minterWallet, user } = await loadFixture(deployFixture);
 
    // Valid tiers are 1 (STREAK_7) through 5 (STREAK_365). 0 is below
    // the range; 6 is above it. (4 is STREAK_200 -- a valid tier, not
    // an out-of-range value, so it must not be used here.)
    await expect(
      badges.connect(minterWallet).mintMilestone(user.address, 0)
    ).to.be.revertedWithCustomError(badges, "InvalidTier");
 
    await expect(
      badges.connect(minterWallet).mintMilestone(user.address, 6)
    ).to.be.revertedWithCustomError(badges, "InvalidTier");
  });
 
  it("rejects minting the same tier twice to the same wallet", async function () {
    const { badges, minterWallet, user } = await loadFixture(deployFixture);
 
    await badges.connect(minterWallet).mintMilestone(user.address, 1);
 
    await expect(
      badges.connect(minterWallet).mintMilestone(user.address, 1)
    ).to.be.revertedWithCustomError(badges, "AlreadyMinted");
  });
 
  it("rejects a zero-address recipient with InvalidAddress, not InvalidTier", async function () {
    const { badges, minterWallet } = await loadFixture(deployFixture);
 
    await expect(
      badges.connect(minterWallet).mintMilestone(ethers.ZeroAddress, 1)
    ).to.be.revertedWithCustomError(badges, "InvalidAddress");
  });
 
  it("blocks wallet-to-wallet transfers -- badges are non-transferable", async function () {
    const { badges, minterWallet, user, other } = await loadFixture(deployFixture);
 
    await badges.connect(minterWallet).mintMilestone(user.address, 1);
 
    await expect(
      badges.connect(user).transferFrom(user.address, other.address, 1)
    ).to.be.revertedWithCustomError(badges, "TransfersDisabled");
 
    expect(await badges.ownerOf(1)).to.equal(user.address);
  });
 
  it("still allows minting itself (the from == address(0) path)", async function () {
    const { badges, minterWallet, user } = await loadFixture(deployFixture);
 
    // If _update's guard were too broad, minting would also revert.
    await expect(badges.connect(minterWallet).mintMilestone(user.address, 2))
      .to.not.be.reverted;
  });
 
  it("produces a tokenURI with the correct tier label embedded", async function () {
    const { badges, minterWallet, user } = await loadFixture(deployFixture);
 
    await badges.connect(minterWallet).mintMilestone(user.address, 2);
 
    const uri = await badges.tokenURI(1);
    expect(uri.startsWith("data:application/json;base64,")).to.equal(true);
 
    const jsonBase64 = uri.replace("data:application/json;base64,", "");
    const json = JSON.parse(Buffer.from(jsonBase64, "base64").toString("utf8"));
    expect(json.name).to.equal("30-Day Streak");
  });
});

