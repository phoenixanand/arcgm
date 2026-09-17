# Contracts

`ArcGM.sol` is the main protocol contract. `MilestoneBadges.sol` is the ERC-721 badge contract, `ProfileRegistry.sol` stores self-controlled profile metadata, and `TemplateDeployer.sol` deploys `TemplateStorage` on behalf of a user after the user's wallet confirms the transaction.

The deploy script writes addresses to `../shared/contracts.json`.
