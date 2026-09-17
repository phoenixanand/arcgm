import { parseAbiItem } from 'viem';
export const GMRecorded = parseAbiItem('event GMRecorded(address indexed user,uint256 timestamp,uint32 streak,uint256 pointsAwarded,uint32 gmCount,address indexed referrer)');
export const FriendGM = parseAbiItem('event FriendGM(address indexed sender,address indexed friend,uint256 timestamp)');
export const ReferralCompleted = parseAbiItem('event ReferralCompleted(address indexed referrer,address indexed referred,uint256 timestamp)');
export const ProfileUpdated = parseAbiItem('event ProfileUpdated(address indexed wallet,string username,string avatar,uint256 timestamp)');
export const STATS_ABI = [{type:'function',name:'users',stateMutability:'view',inputs:[{name:'',type:'address'}],outputs:[{name:'lastGMTimestamp',type:'uint64'},{name:'gmCount',type:'uint32'},{name:'streak',type:'uint32'},{name:'longestStreak',type:'uint32'},{name:'totalPoints',type:'uint256'},{name:'successfulReferrals',type:'uint32'},{name:'hasGMHistory',type:'bool'}]}] as const;

export const BadgeMinted = parseAbiItem('event BadgeMinted(address indexed to,uint8 indexed tier,uint256 indexed tokenId)');
