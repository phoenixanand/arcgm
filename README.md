# ArcPulse — Web3 Social dApp on Arc Testnet

A full-stack Web3 social check-in app for Arc Testnet.

## Included

- Daily on-chain GM with a 24-hour contract-enforced cooldown
- GM a friend with an on-chain event
- Streaks, points and one-time referral bonuses
- ERC-721 milestone badges at 7/30/100-day streaks
- User-owned on-chain profiles
- Custom contract deployment from the frontend
- Event-driven PostgreSQL indexer for leaderboard/profile reads
- Curated Arc dApp directory
- React + Wagmi + Viem frontend
- Hardhat + OpenZeppelin Solidity contracts

## Arc Testnet configuration

- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- Native gas currency: USDC

## Repository

```text
arcgm/
  contracts/     Solidity + Hardhat deployment
  frontend/      React + Vite + Wagmi/Viem
  indexer/       Viem event indexer + Express + PostgreSQL
  shared/        ABI/address config consumed by the frontend
  subgraph/      graphql
```

## 1. Contracts

```bash
cd contracts
npm install
cp .env.example .env
# set DEPLOYER_PRIVATE_KEY
npm run compile
npm run test
npm run deploy:arc:testnet
```

Copy the deployed addresses into `shared/contracts.json` and `frontend/.env`.

## 2. Indexer

Requires PostgreSQL.

```bash
cd indexer
npm install
cp .env.example .env
npm run migrate
npm run index
npm run api
```

The API exposes:

- `GET /leaderboard?sort=points&page=1&pageSize=25`
- `GET /leaderboard?sort=streak&page=1&pageSize=25`
- `GET /profiles/:address`
- `GET /health`

The indexer only consumes contract events; leaderboard pages never scan chain state.

## 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Important implementation details

### Daily GM rule

`ArcGM.sayGM()` uses `block.timestamp` and reverts if `now < lastGM + 1 days`.

### Streak rule

After the first GM, a GM made 24–48 hours after the previous GM increments the streak. A gap over 48 hours resets it to 1. This matches the contract-enforced 24-hour minimum while still allowing normal daily usage.

### Points

- Base: 10 points
- Consecutive streak bonus: +5 × `min(streak, 7)`
- Referral bonus: +50 once for the referrer and +50 once for the new user

That yields 15 points for day 1, 20 for day 2, ..., 45 for day 7+. The formula is centralized in the contract so the indexer can reproduce it deterministically.

### Sybil resistance

The MVP enforces a 24-hour per-wallet cooldown and a one-time first-GM referral relationship. For a production launch, use the optional backend eligibility gate in `indexer/src/sybil.ts` with wallet-age / prior-transaction heuristics before submitting a GM transaction. Never rely on a frontend-only check.

### Profile ownership

Profile updates are direct wallet transactions to `ProfileRegistry`, so only the wallet controlling the private key can update its own profile. If an off-chain profile endpoint is added later, require an EIP-191/EIP-712 signature before accepting writes.

### Badge minting

`MilestoneBadges` is controlled by the GM contract. The GM contract mints each tier at most once per wallet. The badge NFT remains fully on-chain and can be queried by `ownerOf`, `balanceOf` and `tokenURI`.

## Production hardening checklist

- Replace polling indexer with websocket/log streaming + block checkpointing
- Add RPC fallback provider(s)
- Add database unique constraints and idempotent reprocessing (included)
- Add API rate limiting/auth for write endpoints
- Add ENS resolution cache
- Pin badge metadata/images to IPFS/Arweave
- Use a relayer/paymaster if sponsored badge mints are desired
- Audit contracts before mainnet use

## dApp directory provenance

The starter directory intentionally contains a small curated set rather than pretending to auto-discover the ecosystem. For example, Across is documented by Arc as live on Arc Testnet, and Tradable has announced expansion to Arc. Verify each project's current deployment/status before a public launch. citeturn560226search0turn560226search1
