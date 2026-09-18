import addresses from '../../../shared/contracts.json';
export const CONTRACTS = {
  gm: (import.meta.env.VITE_ARC_GM_ADDRESS) as `0x${string}`,
  badges: (import.meta.env.VITE_BADGES_ADDRESS) as `0x${string}`,
  profile: (import.meta.env.VITE_PROFILE_ADDRESS) as `0x${string}`,
  templateDeployer: (import.meta.env.VITE_TEMPLATE_DEPLOYER_ADDRESS) as `0x${string}`,
};

export const GM_ABI = [
  {type:'function',name:'users',stateMutability:'view',inputs:[{name:'',type:'address'}],outputs:[{name:'lastGMTimestamp',type:'uint64'},{name:'gmCount',type:'uint32'},{name:'streak',type:'uint32'},{name:'longestStreak',type:'uint32'},{name:'totalPoints',type:'uint256'},{name:'successfulReferrals',type:'uint32'},{name:'hasGMHistory',type:'bool'}]},
  {type:'function',name:'sayGM',stateMutability:'nonpayable',inputs:[],outputs:[]},
  {type:'function',name:'sayGMWithReferral',stateMutability:'nonpayable',inputs:[{name:'referrer',type:'address'}],outputs:[]},
  {type:'function',name:'gmFriend',stateMutability:'nonpayable',inputs:[{name:'friend',type:'address'}],outputs:[]},
  {type:'function',name:'setReferral',stateMutability:'nonpayable',inputs:[{name:'referrer',type:'address'}],outputs:[]},
] as const;

export const PROFILE_ABI = [
  {type:'function',name:'profiles',stateMutability:'view',inputs:[{name:'',type:'address'}],outputs:[{name:'username',type:'string'},{name:'avatar',type:'string'},{name:'updatedAt',type:'uint64'}]},
  {type:'function',name:'setProfile',stateMutability:'nonpayable',inputs:[{name:'username',type:'string'},{name:'avatar',type:'string'}],outputs:[]}
] as const;

export const BADGES_ABI = [
  {type:'function',name:'balanceOf',stateMutability:'view',inputs:[{name:'owner',type:'address'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'mintedTier',stateMutability:'view',inputs:[{name:'',type:'address'},{name:'',type:'uint8'}],outputs:[{name:'',type:'bool'}]}
] as const;

export const TEMPLATE_DEPLOYER_ABI = [
  {type:'function',name:'deployStorage',stateMutability:'nonpayable',inputs:[{name:'initialValue',type:'string'}],outputs:[{name:'deployed',type:'address'}]},
  {type:'event',name:'TemplateDeployed',inputs:[{name:'deployer',type:'address',indexed:true},{name:'contractAddress',type:'address',indexed:true},{name:'initialValue',type:'string',indexed:false}],anonymous:false}
] as const;
