import { createPublicClient, http, getAddress } from 'viem';
import { arcTestnet } from './chain.js';

const client=createPublicClient({chain:arcTestnet,transport:http(process.env.ARC_RPC_URL||'https://rpc.testnet.arc.network')});

/** Optional pre-transaction heuristic for a production relayer/API.
 * It never overrides the contract rule. The contract remains authoritative.
 */
export async function basicSybilCheck(address:string){
  const wallet=getAddress(address);
  const code=await client.getCode({address:wallet});
  const balance=await client.getBalance({address:wallet});
  const txCount=await client.getTransactionCount({address:wallet});
  return {
    isContract: !!code && code !== '0x',
    hasGas: balance > 0n,
    transactionCount: txCount,
    walletAgeSignal: txCount > 0,
    allowed: txCount > 0 && (!code || code === '0x')
  };
}
