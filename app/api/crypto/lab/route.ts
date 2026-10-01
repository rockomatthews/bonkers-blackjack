import {readFile} from 'node:fs/promises';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 const url=new URL(request.url);
 if(process.env.CRYPTO_LAB_ENABLED!=='1'||!['localhost','127.0.0.1'].includes(url.hostname)||process.env.VERCEL)return new Response(null,{status:404});
 const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return new Response(null,{status:403});
 try {
  const dir=process.env.CRYPTO_LAB_DIR??'.data/crypto-lab';
  const config=JSON.parse(await readFile(`${dir}/config.json`,'utf8'));
  if(config.chainId!==31337)return new Response(null,{status:503});
  let round=null;try{round=JSON.parse(await readFile(`${dir}/state.json`,'utf8'));}catch{}
  return Response.json({config,round},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Start the local fork with npm run crypto:lab'},{status:503});}
}
