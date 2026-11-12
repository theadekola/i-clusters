// Share short, authenticated node reads across users and tabs. An API token or
// certificate error leaves the cluster's power and connectivity inconclusive.
import {createHash} from 'node:crypto';

const networkErrors=new Set(['ECONNREFUSED','ECONNRESET','ETIMEDOUT','ESOCKETTIMEDOUT','ENETUNREACH','EHOSTUNREACH','ENOTFOUND','EAI_AGAIN']);
async function readStatus(config,query){
  try{
    const nodes=await query('/nodes',{timeoutMs:3500},config);
    if(!Array.isArray(nodes)||!nodes.length)return 'unknown';
    if(nodes.some(node=>node?.status==='online'))return 'online';
    return nodes.every(node=>node?.status==='offline')?'offline':'unknown';
  }catch(error){
    if(networkErrors.has(error?.code)||error?.message==='Connector request timed out'||[502,503,504].includes(error?.providerStatus))return 'offline';
    return 'unknown';
  }
}
export function createClusterReachability(now=Date.now){
  const cache=new Map();
  return async function statuses(entries,query){
    const active=new Set(entries.map(entry=>entry.id));
    for(const id of cache.keys())if(!active.has(id))cache.delete(id);
    return Promise.all(entries.map(async({id,config})=>{
      if(!config?.url||!config.tokenId||!config.tokenSecret){
        cache.delete(id);
        return config?.url?'unknown':'not-configured';
      }
      const signature=createHash('sha256').update(JSON.stringify(config)).digest('hex');
      const cached=cache.get(id);
      if(cached?.signature===signature&&cached.expires>now())return cached.result;
      const entry={signature,expires:Infinity};
      entry.result=readStatus(config,query).finally(()=>{entry.expires=now()+10000});
      cache.set(id,entry);
      return entry.result;
    }));
  };
}
