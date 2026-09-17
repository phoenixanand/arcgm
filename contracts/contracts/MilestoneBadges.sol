// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

contract MilestoneBadges is ERC721 {
    uint8 public constant STREAK_7 = 1;
    uint8 public constant STREAK_30 = 2;
    uint8 public constant STREAK_100 = 3;
    uint8 public constant STREAK_200 = 4;
    uint8 public constant STREAK_365 = 5;

    address public immutable minter;
    mapping(address => mapping(uint8 => bool)) public mintedTier;
    mapping(uint256 => uint8) public tokenTier;
    uint256 public nextTokenId = 1;

    event BadgeMinted(
        address indexed to,
        uint8 indexed tier,
        uint256 indexed tokenId
    );

    error NotMinter();
    error InvalidAddress();
    error InvalidTier();
    error AlreadyMinted();
    error TransfersDisabled();

    constructor(address gmContract)
        ERC721("arcgm Milestone", "ARCGM")
    {
        if (gmContract == address(0)) revert InvalidAddress();
        minter = gmContract;
    }

    function mintMilestone(address to, uint8 tier) external {
        if (msg.sender != minter) revert NotMinter();
        if (to == address(0)) revert InvalidAddress();
        if (tier < STREAK_7 || tier > STREAK_365) {
            revert InvalidTier();
        }
        if (mintedTier[to][tier]) revert AlreadyMinted();

        mintedTier[to][tier] = true;

        uint256 tokenId = nextTokenId++;
        tokenTier[tokenId] = tier;

        _safeMint(to, tokenId);

        emit BadgeMinted(to, tier, tokenId);
    }

    /// @dev Badges are earned records of a specific wallet's streak, not
    /// tradable collectibles -- a transferable badge could be bought or
    /// gifted, which breaks the "this wallet actually held a streak"
    /// guarantee the rest of the app (and anything reading these badges
    /// as a reputation signal) relies on. Minting (`from == address(0)`)
    /// and any future burn (`to == address(0)`) still work; wallet-to-
    /// wallet transfers are the only path blocked.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert TransfersDisabled();
        }
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        _requireOwned(tokenId);

        uint8 tier = tokenTier[tokenId];

        string memory name_ =
            tier == STREAK_7
                ? "7-Day Streak"
                : tier == STREAK_30
                    ? "30-Day Streak"
                    : tier == STREAK_100
                        ? "100-Day Streak"
                        : tier == STREAK_200
                            ? "200-Day Streak"
                            : "365-Day Streak";

        string memory description =
            "arcgm on-chain milestone badge";

        string memory svg = _svg(tier);

        string memory image = string.concat(
            "data:image/svg+xml;base64,",
            Base64.encode(bytes(svg))
        );

        string memory json = Base64.encode(
            bytes(
                string.concat(
                    '{"name":"',
                    name_,
                    '","description":"',
                    description,
                    '","attributes":[{"trait_type":"Tier","value":"',
                    name_,
                    '"}],"image":"',
                    image,
                    '"}'
                )
            )
        );

        return string.concat(
            "data:application/json;base64,",
            json
        );
    }

    function _svg(uint8 tier)
        private
        pure
        returns (string memory)
    {
        string memory label =
            tier == STREAK_7
                ? "7"
                : tier == STREAK_30
                    ? "30"
                    : tier == STREAK_100
                        ? "100"
                        : tier == STREAK_200
                            ? "200"
                            : "365";

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">',
            '<rect width="900" height="900" rx="180" fill="#0b1020"/>',
            '<circle cx="450" cy="330" r="190" fill="#ffb000"/>',
            '<circle cx="450" cy="330" r="140" fill="#0b1020"/>',
            '<text x="450" y="390" text-anchor="middle" font-size="180" font-family="Arial" font-weight="700" fill="#ffb000">',
            label,
            '</text>',
            '<text x="450" y="635" text-anchor="middle" font-size="78" font-family="Arial" font-weight="700" fill="white">ARC GM</text>',
            '<text x="450" y="715" text-anchor="middle" font-size="44" font-family="Arial" fill="#aab2c5">STREAK BADGE</text>',
            '</svg>'
        );
    }
}
