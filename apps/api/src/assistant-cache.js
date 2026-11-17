import Redis from 'ioredis';
import {createHash} from 'node:crypto';
let client;
function connection(){
 if(!process.env.REDIS_URL)return null;
 if(!client){
  client=new Redis(process.env.REDIS_URL,{enableOfflineQueue:false,connectTimeout:1000,commandTimeout:500,maxRetriesPerRequest:0,retryStrategy:()=>5000});
  client.on('ready',()=>client.connector.stream?.unref?.());
  client.on('error',()=>{}); // Monitoring remains available during cache outages.
 }
 return client.status==='ready'?client:null;
}
const key=time=>'iclusters:assistant:v1:'+createHash('sha256').update(JSON.stringify([process.env.ICLUSTERS_CLUSTER_PROFILE||'default',process.env.DATA_DIR,time])).digest('hex');
export async function cacheMeasurements(snapshot,build){
 const redis=connection();
 if(redis&&snapshot.sampledAt)await redis.set(key(snapshot.sampledAt),JSON.stringify(build(snapshot)),'EX',120).catch(()=>{});
}
export async function readMeasurements(snapshot,build){
 const redis=connection();
 if(redis&&snapshot.sampledAt){
  try{const raw=await redis.get(key(snapshot.sampledAt));if(raw){const cached=JSON.parse(raw);if(cached.sampledAt===snapshot.sampledAt)return cached;}}catch{}
 }
 return build(snapshot);
}

export function closeMeasurementCache(){client?.disconnect();client=undefined}
