// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMilestoneBadges {
    function mintMilestone(address to, uint8 tier) external;
    function mintedTier(address to, uint8 tier) external view returns (bool);
}

contract ArcGM {
    uint256 public constant DAY = 1 days;
    uint256 public constant BASE_POINTS = 10;
    uint256 public constant STREAK_MILESTONE_BONUS = 30;
    uint32 public constant STREAK_MILESTONE = 7;
    uint256 public constant REFERRAL_BONUS = 50;

    // Reordered so the small fields (20 + 4 + 1 = 25 bytes) pack into a
    // single 32-byte storage slot, with the uint256 last in its own slot.
    // Original ordering split the small fields across the uint256, forcing
    // 3 slots per user instead of 2 -- this saves an SSTORE on every
    // sayGM() call.
    struct UserStats {
        uint64 lastGMTimestamp;
        uint32 gmCount;
        uint32 streak;
        uint32 longestStreak;
        uint32 successfulReferrals;
        bool hasGMHistory;
        uint256 totalPoints;
    }

    mapping(address => UserStats) public users;
    mapping(address => address) public referredBy;
    mapping(address => bool) public referralBonusClaimed;
    mapping(address => mapping(uint8 => bool)) public milestoneRewardClaimed;

    IMilestoneBadges public milestoneBadges;

    address public owner;
    // Two-step ownership transfer: `owner` only changes once the proposed
    // address actively calls acceptOwnership(). Prevents permanently
    // bricking ownership via a typo'd address in transferOwnership().
    address public pendingOwner;

    event GMRecorded(
        address indexed user,
        uint256 timestamp,
        uint32 streak,
        uint256 pointsAwarded,
        uint32 gmCount,
        uint256 totalPoints,
        uint32 longestStreak,
        address indexed referrer
    );

    event FriendGM(
        address indexed sender,
        address indexed friend,
        uint256 timestamp
    );

    event ReferralCompleted(
        address indexed referrer,
        address indexed referred,
        uint256 timestamp
    );

    event ReferralSet(
        address indexed referred,
        address indexed referrer
    );

    event UserStatsUpdated(
        address indexed user,
        uint256 totalPoints,
        uint32 gmCount,
        uint32 streak,
        uint32 longestStreak,
        uint32 successfulReferrals,
        uint256 timestamp
    );

    event BadgeContractSet(address indexed badgeContract);

    // Emitted instead of reverting when the badge contract call fails.
    // Milestone badges are a bonus, not the core product -- a bug, an
    // out-of-gas, or a bad address in `milestoneBadges` must never stop
    // a user from recording their GM.
    event BadgeMintFailed(address indexed user, uint8 indexed tier);

    event OwnershipTransferStarted(
        address indexed previousOwner,
        address indexed newOwner
    );

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    error CooldownActive(uint256 nextAllowedAt);
    error InvalidAddress();
    error SelfReferral();
    error AlreadyReferred();
    error ReferrerHasNoHistory();
    error NotOwner();
    error NotPendingOwner();

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert InvalidAddress();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setMilestoneBadges(address badgeContract) external onlyOwner {
        if (badgeContract == address(0)) revert InvalidAddress();
        milestoneBadges = IMilestoneBadges(badgeContract);
        emit BadgeContractSet(badgeContract);
    }

    /// @notice Step 1 of 2: propose a new owner. Does NOT change `owner`.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Step 2 of 2: the proposed owner must call this themselves
    /// to finalize the transfer. A typo'd address in transferOwnership()
    /// can never brick ownership, since that address would have to be
    /// able to sign a transaction to actually take control.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }

    function setReferral(address referrer) public {
        if (users[msg.sender].hasGMHistory) revert AlreadyReferred();
        if (referredBy[msg.sender] != address(0)) revert AlreadyReferred();
        if (referrer == msg.sender) revert SelfReferral();
        if (referrer == address(0)) revert InvalidAddress();
        if (!users[referrer].hasGMHistory) revert ReferrerHasNoHistory();

        referredBy[msg.sender] = referrer;
        emit ReferralSet(msg.sender, referrer);
    }

    function sayGM() external {
        _sayGM(msg.sender, referredBy[msg.sender]);
    }

    function sayGMWithReferral(address referrer) external {
        if (
            !users[msg.sender].hasGMHistory &&
            referredBy[msg.sender] == address(0) &&
            referrer != address(0)
        ) {
            if (referrer == msg.sender) revert SelfReferral();
            if (!users[referrer].hasGMHistory) {
                revert ReferrerHasNoHistory();
            }

            referredBy[msg.sender] = referrer;
            emit ReferralSet(msg.sender, referrer);
        }

        _sayGM(msg.sender, referredBy[msg.sender]);
    }

    function gmFriend(address friend) external {
        if (friend == address(0) || friend == msg.sender) {
            revert InvalidAddress();
        }

        emit FriendGM(msg.sender, friend, block.timestamp);
    }

    function _sayGM(address user, address referrer) internal {
        UserStats storage s = users[user];
        uint256 currentDay = block.timestamp / DAY;

        if (s.hasGMHistory) {
            uint256 lastGMDay = uint256(s.lastGMTimestamp) / DAY;
            if (currentDay == lastGMDay) {
                revert CooldownActive((currentDay + 1) * DAY);
            }
        }

        uint32 newStreak;

        if (!s.hasGMHistory) {
            newStreak = 1;
        } else {
            uint256 lastGMDay = uint256(s.lastGMTimestamp) / DAY;
            newStreak = currentDay == lastGMDay + 1
                ? s.streak + 1
                : 1;
        }

        s.lastGMTimestamp = uint64(block.timestamp);
        s.gmCount += 1;
        s.streak = newStreak;
        s.hasGMHistory = true;

        if (newStreak > s.longestStreak) {
            s.longestStreak = newStreak;
        }

        uint256 points = BASE_POINTS;

        // Recurring bonus: every 7th consecutive day
        if (newStreak % STREAK_MILESTONE == 0) {
            points += STREAK_MILESTONE_BONUS;
        }

        // One-time lifetime milestone rewards
        if (newStreak == 7 && !milestoneRewardClaimed[user][1]) {
            points += 30;
            milestoneRewardClaimed[user][1] = true;
        }

        if (newStreak == 30 && !milestoneRewardClaimed[user][2]) {
            points += 30;
            milestoneRewardClaimed[user][2] = true;
        }

        if (newStreak == 100 && !milestoneRewardClaimed[user][3]) {
            points += 50;
            milestoneRewardClaimed[user][3] = true;
        }

        if (newStreak == 200 && !milestoneRewardClaimed[user][4]) {
            points += 500;
            milestoneRewardClaimed[user][4] = true;
        }

        if (newStreak == 365 && !milestoneRewardClaimed[user][5]) {
            points += 1000;
            milestoneRewardClaimed[user][5] = true;
        }

        bool referralJustCompleted =
            s.gmCount == 1 &&
            referrer != address(0) &&
            !referralBonusClaimed[user];

        if (referralJustCompleted) {
            UserStats storage r = users[referrer];

            s.totalPoints += REFERRAL_BONUS;
            r.totalPoints += REFERRAL_BONUS;
            r.successfulReferrals += 1;
            referralBonusClaimed[user] = true;
        }

        s.totalPoints += points;

        // --- All state for this transaction is now final. ---
        // Everything below is either an event (safe) or an external call
        // (milestoneBadges). External calls are kept last, after every
        // state write, so a malicious or buggy badge contract can never
        // observe or influence unwritten state -- checks-effects-
        // interactions, applied strictly rather than "checked to be safe
        // this time."

        if (referralJustCompleted) {
            emit ReferralCompleted(referrer, user, block.timestamp);
            UserStats storage r = users[referrer];
            emit UserStatsUpdated(
                referrer,
                r.totalPoints,
                r.gmCount,
                r.streak,
                r.longestStreak,
                r.successfulReferrals,
                block.timestamp
            );
        }

        emit GMRecorded(
            user,
            block.timestamp,
            newStreak,
            points,
            s.gmCount,
            s.totalPoints,
            s.longestStreak,
            referrer
        );

        emit UserStatsUpdated(
            user,
            s.totalPoints,
            s.gmCount,
            s.streak,
            s.longestStreak,
            s.successfulReferrals,
            block.timestamp
        );

        if (address(milestoneBadges) != address(0)) {
            if (newStreak == 7) _tryMintMilestone(user, 1);
            if (newStreak == 30) _tryMintMilestone(user, 2);
            if (newStreak == 100) _tryMintMilestone(user, 3);
            if (newStreak == 200) _tryMintMilestone(user, 4);
            if (newStreak == 365) _tryMintMilestone(user, 5);
        }
    }

    // Both the mintedTier() check and the mintMilestone() call are
    // external calls into a contract this one doesn't control the
    // behavior of (only its interface). Each is wrapped in its own
    // try/catch -- try/catch only covers a single external call per
    // block -- so a revert on either one degrades to a BadgeMintFailed
    // event instead of reverting the whole sayGM() transaction. The
    // user's GM, streak, and points are already written to storage
    // above this point either way.
    function _tryMintMilestone(address user, uint8 tier) private {
        bool alreadyMinted;

        try milestoneBadges.mintedTier(user, tier) returns (bool minted) {
            alreadyMinted = minted;
        } catch {
            emit BadgeMintFailed(user, tier);
            return;
        }

        if (alreadyMinted) return;

        try milestoneBadges.mintMilestone(user, tier) {
            // success -- BadgeMinted is emitted by the badge contract itself
        } catch {
            emit BadgeMintFailed(user, tier);
        }
    }

    function getUser(address user)
        external
        view
        returns (UserStats memory)
    {
        return users[user];
    }

}
