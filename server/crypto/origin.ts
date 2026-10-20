const productionOrigins=[
 'https://bonkers.cash',
 'https://www.bonkers.cash',
 'https://bonkers-blackjack.vercel.app',
];
export function houseRequestOrigin(request:Request):string|null{
 const url=new URL(request.url);
 // Next may reconstruct request.url with its internal hostname. Match the incoming
 // Host against explicit approved origins; never accept arbitrary forwarded hosts.
 const host=request.headers.get('host')??url.host;
 const configured=process.env.BONKERS_SITE_ORIGIN;
 const allowed=configured?[...productionOrigins,new URL(configured).origin]:productionOrigins;
 return allowed.find(origin=>{const site=new URL(origin);return site.host===host&&site.protocol===url.protocol;})??null;
}
export function housePostOrigin(request:Request):string|null{
 const origin=houseRequestOrigin(request);
 return origin&&request.headers.get('origin')===origin?origin:null;
}
