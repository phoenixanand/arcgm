// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract TemplateStorage {
    string public value;
    address public immutable deployer;

    event ValueChanged(address indexed by, string value);

    error NotDeployer();

    // `deployer_` is now passed in explicitly instead of trusting
    // `msg.sender`. If this contract is created via a factory
    // (`new TemplateStorage(...)` inside another contract's function),
    // `msg.sender` here would be the FACTORY's address, not the wallet
    // that actually triggered the deployment -- every instance would
    // otherwise record the same, wrong "deployer". The factory's
    // deploy function must now call:
    //     new TemplateStorage(initialValue, msg.sender)
    // where its own `msg.sender` is the real calling wallet.
    constructor(string memory initialValue, address deployer_) {
        if (deployer_ == address(0)) revert NotDeployer();
        deployer = deployer_;
        value = initialValue;
        emit ValueChanged(deployer_, initialValue);
    }

    modifier onlyDeployer() {
        if (msg.sender != deployer) revert NotDeployer();
        _;
    }

    // Only the wallet that deployed this instance can update it.
    // Previously anyone could call this and overwrite someone else's
    // deployed contract.
    function setValue(string calldata newValue) external onlyDeployer {
        value = newValue;
        emit ValueChanged(msg.sender, newValue);
    }
}
