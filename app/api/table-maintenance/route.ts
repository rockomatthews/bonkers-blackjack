import {timingSafeEqual} from 'node:crypto';
import {maintainTables} from '../../../server/crypto/table-service';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET,header=request.headers.get('authorization')??'';
 if(!secret||Buffer.byteLength(header)!==Buffer.byteLength('Bearer '+secret)||!timingSafeEqual(Buffer.from(header),Buffer.from('Bearer '+secret)))return new Response(null,{status:401});
 await maintainTables();return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}
