/** Live routes use wallet transactions; practice routes retain their separate simulated ledger. */
export function siteMode(env:Record<string,string|undefined>=process.env):'live'|'practice'{
 const mode=env.BONKERS_MODE??'live';
 if(mode!=='live'&&mode!=='practice')throw Error('BONKERS_MODE must be live or practice');
 return mode;
}
