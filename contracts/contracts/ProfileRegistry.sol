// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ProfileRegistry {
    struct Profile {
        string username;
        string avatar;
        uint64 updatedAt;
    }

    mapping(address => Profile) public profiles;

    event ProfileUpdated(address indexed wallet, string username, string avatar, uint256 timestamp);

    function setProfile(string calldata username, string calldata avatar) external {
        profiles[msg.sender] = Profile(username, avatar, uint64(block.timestamp));
        emit ProfileUpdated(msg.sender, username, avatar, block.timestamp);
    }

    function clearProfile() external {
        delete profiles[msg.sender];
        emit ProfileUpdated(msg.sender, "", "", block.timestamp);
    }
}
