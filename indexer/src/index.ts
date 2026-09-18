import { createPublicClient, http } from 'viem';
import { arcTestnet } from './chain.js';
import { pool, q } from './db.js';
import { GMRecorded, FriendGM, ReferralCompleted, ProfileUpdated, BadgeMinted } from './shared.js';

const client=createPublicClient({chain:arcTestnet,transport:http(process.env.ARC_RPC_URL||'https://rpc.testnet.arc.network')});
const gm=(process.env.ARCGM_ADDRESS||'0x0000000000000000000000000000000000000000') as `0x${string}`;
const profile=(process.env.PROFILE_ADDRESS||'0x0000000000000000000000000000000000000000') as `0x${string}`;
const badges=(process.env.BADGES_ADDRESS||'0x0000000000000000000000000000000000000000') as `0x${string}`;
const poll=Number(process.env.POLL_MS||2000);

async function upsertUser(address:string){await q(`INSERT INTO users(address) VALUES($1) ON CONFLICT(address) DO NOTHING`,[address.toLowerCase()]);}
async function processRange(from:bigint,to:bigint){
 const gmLogs=await client.getLogs({address:gm,event:GMRecorded,fromBlock:from,toBlock:to});
 for(const l of gmLogs){const a=l.args.user!.toLowerCase();await upsertUser(a);const inserted=await q(`INSERT INTO gms(tx_hash,log_index,address,timestamp,streak,points,referrer) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING tx_hash`,[l.transactionHash,Number(l.logIndex),a,l.args.timestamp!.toString(),Number(l.args.streak),l.args.pointsAwarded!.toString(),l.args.referrer?.toLowerCase()||null]);if(inserted.rowCount){await q(`UPDATE users SET gm_count=$2,streak=$3,longest_streak=GREATEST(longest_streak,$4),total_points=total_points+$5,last_gm_timestamp=$6,updated_at=now() WHERE address=$1`,[a,Number(l.args.gmCount),Number(l.args.streak),Number(l.args.streak),l.args.pointsAwarded!.toString(),l.args.timestamp!.toString()]);}}
 const refLogs=await client.getLogs({address:gm,event:ReferralCompleted,fromBlock:from,toBlock:to});
 for(const l of refLogs){const referred=l.args.referred!.toLowerCase();const referrer=l.args.referrer!.toLowerCase();await upsertUser(referrer);await upsertUser(referred);const inserted=await q(`INSERT INTO referrals(referred,referrer,timestamp) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING referred`,[referred,referrer,l.args.timestamp!.toString()]);if(inserted.rowCount){await q(`UPDATE users SET successful_referrals=successful_referrals+1 WHERE address=$1`,[referrer]);}}
 const friendLogs=await client.getLogs({address:gm,event:FriendGM,fromBlock:from,toBlock:to});for(const l of friendLogs){await q(`INSERT INTO friend_gms(tx_hash,log_index,sender,friend,timestamp) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[l.transactionHash,Number(l.logIndex),l.args.sender!.toLowerCase(),l.args.friend!.toLowerCase(),l.args.timestamp!.toString()]);}
 const bLogs=await client.getLogs({address:badges,event:BadgeMinted,fromBlock:from,toBlock:to});for(const l of bLogs){await q(`INSERT INTO badges(token_id,wallet,tier) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[l.args.tokenId!.toString(),l.args.to!.toLowerCase(),Number(l.args.tier)]);}
 const pLogs=await client.getLogs({address:profile,event:ProfileUpdated,fromBlock:from,toBlock:to});for(const l of pLogs){await upsertUser(l.args.wallet!.toLowerCase());await q(`UPDATE users SET username=$2,avatar=$3,updated_at=now() WHERE address=$1`,[l.args.wallet!.toLowerCase(),l.args.username,l.args.avatar]);}
 await q(`UPDATE checkpoints SET block_number=$1 WHERE id=1`,[to.toString()]);
}
async function main(){console.log('arcgm indexer running');let row=await q<{block_number:string}>('SELECT block_number FROM checkpoints WHERE id=1');let current=row.rows[0]?.block_number?BigInt(row.rows[0].block_number):0n;if(current===0n)current=BigInt(process.env.START_BLOCK||'0');while(true){const head=await client.getBlockNumber();if(head>current){const to=head-current>1000n?current+1000n:head;await processRange(current+1n,to);current=to;console.log('indexed through',current.toString())}await new Promise(r=>setTimeout(r,poll))}}
main().catch(async e=>{console.error(e);await pool.end();process.exit(1)});
