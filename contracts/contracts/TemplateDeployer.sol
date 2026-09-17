// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TemplateStorage} from './TemplateStorage.sol';

contract TemplateDeployer {
    event TemplateDeployed(address indexed deployer, address indexed contractAddress, string initialValue);

    function deployStorage(string calldata initialValue) external returns (address deployed) {
        // TemplateStorage's constructor now takes the real deployer as an
        // explicit argument instead of trusting its own msg.sender --
        // inside TemplateStorage's constructor, msg.sender would be THIS
        // factory contract, not the wallet calling deployStorage(). Pass
        // this function's msg.sender through so `deployer` on the deployed
        // instance is the actual user's wallet.
        TemplateStorage storageContract = new TemplateStorage(initialValue, msg.sender);
        deployed = address(storageContract);
        emit TemplateDeployed(msg.sender, deployed, initialValue);
    }
}
