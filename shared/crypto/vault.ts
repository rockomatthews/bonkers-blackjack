import {parseAbi} from 'viem';
export const vaultAbi=parseAbi([
 'function feeRevenue() view returns (uint256)',
 'function token() view returns (address)',
 'function paused() view returns (bool)',
 'function available(address) view returns (uint256)',
 'function playerAvailable() view returns (uint256)',
 'function playerLocked() view returns (uint256)',
 'function house() view returns (uint256)',
 'function reserved() view returns (uint256)',
 'function accountedAssets() view returns (uint256)',
 'function depositFor(address owner,uint256 amount)',
 'function withdraw(uint256 amount,address recipient)',
 'function withdrawalNonces(address) view returns(uint256)',
 'event WagerLocked(bytes32 indexed id,address indexed owner,uint256 amount,uint256 fee,uint256 maximum)',
 'event Deposited(address indexed owner,uint256 amount)',
 'event Withdrawn(address indexed owner,address indexed recipient,uint256 amount,uint256 nonce)',
]);
