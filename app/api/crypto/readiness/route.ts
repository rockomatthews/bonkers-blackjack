import {cryptoConfig,readiness} from '../../../../server/crypto/config';
import {requirePrivateAccess} from '../../../../server/crypto/auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try {
  const config=cryptoConfig();
  if(!config.enabled)return new Response(null,{status:404});
  try {requirePrivateAccess(request,config);}catch{return new Response(null,{status:404});}
  return Response.json(readiness(config),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Private crypto configuration unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
