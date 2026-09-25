import {address,BASE_CHAIN_ID,BASE_USDC,type AssetNetwork,assetNetwork} from '../../shared/crypto/assets';
export type CryptoMode='disabled'|'local-fork'|'private-mainnet'|'live';
export type CryptoConfig=ReturnType<typeof cryptoConfig>;
export function cryptoConfig(env:Record<string,string|undefined>=process.env) {
  const mode=env.CRYPTO_MODE??'disabled';
  if(!['disabled','local-fork','private-mainnet','live'].includes(mode))throw Error('Invalid CRYPTO_MODE');
  const enabled=mode!=='disabled';
  const rpc=env.CRYPTO_RPC_URL??'';
  if(enabled){
    const url=new URL(rpc);
    if(mode==='local-fork' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Fork mode requires a local RPC');
    if(mode!=='local-fork' && url.protocol!=='https:')throw Error('Mainnet RPC requires HTTPS');
    if(!env.CRYPTO_DATABASE_URL || env.CRYPTO_DATABASE_URL===env.POSTGRES_URL || env.CRYPTO_DATABASE_URL===env.DATABASE_URL)throw Error('A separate crypto database is required');
    if((env.CRYPTO_PRIVATE_ACCESS_TOKEN?.length??0)<32)throw Error('Private access token must have at least 32 characters');
  }
  const approvedRoutes=(env.CRYPTO_APPROVED_ROUTES??'').split(',').filter(Boolean).map(assetNetwork);
  return {mode:mode as CryptoMode,enabled,rpc,chainId:BASE_CHAIN_ID,token:BASE_USDC,
    vault:env.CRYPTO_VAULT_ADDRESS?address(env.CRYPTO_VAULT_ADDRESS):null,
    approvedRoutes:approvedRoutes as AssetNetwork[], privateAccessToken:env.CRYPTO_PRIVATE_ACCESS_TOKEN??'',
    privyAppId:env.PRIVY_APP_ID??'',privyVerificationKey:env.PRIVY_VERIFICATION_KEY?.replaceAll('\\n','\n')??'',
    nearToken:env.NEAR_INTENTS_API_TOKEN??'',nearApproved:env.NEAR_INTENTS_BUSINESS_APPROVED==='true',
    chainConfirmations:12n,
    mainnetWrites:env.CRYPTO_MAINNET_WRITES==='true',
    releaseManifest:env.CRYPTO_RELEASE_MANIFEST_PATH??'',
  };
}
/** Never equate a merge, a public environment variable, or a license checkbox with readiness. */
export function readiness(c:CryptoConfig) {
  const blockers:string[]=[];
  if(!c.enabled)blockers.push('Crypto is disabled');
  if(!c.vault)blockers.push('Reviewed vault deployment not configured');
  if(!c.privyAppId||!c.privyVerificationKey)blockers.push('Wallet authentication not configured');
  // Readiness requires independent evidence and is intentionally not overridden by an env boolean.
  blockers.push('Production blackjack protocol audit and deployed-bytecode attestation outstanding');
  blockers.push('Final permitted markets and eligibility policy outstanding');
  if(c.mode!=='local-fork'&&!c.mainnetWrites)blockers.push('Mainnet writes not authorized');
  return {mode:c.mode,realMoneyEnabled:false as const,blockers};
}
export function assertFinancialWrites(c:CryptoConfig){
  if(c.mode!=='local-fork')throw Error('Mainnet financial operations remain closed pending release verification');
  if(!c.enabled||!c.vault)throw Error('Local fork vault is not configured');
}
