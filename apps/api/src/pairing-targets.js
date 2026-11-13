import {clusterConfig} from './cluster-config.js';
import {dockerConfig} from './docker-config.js';
import {docker,pve} from './connectors.js';
import {agentContext,agentNetworkReports,agentNodes} from './node-agents.js';
import {proxmoxTestError} from './proxmox-test-error.js';

const normalize=value=>String(value||'').trim().toLowerCase();
const guestKey=id=>id?.match(/^[^:]+:((?:qemu|lxc)\/\d+)$/)?.[1];

async function directHost(){
 const url=dockerConfig().url;
 if(!url)return null;
 const address=new URL(url).hostname.replace(/^\[|\]$/g,'');
 try{
  const info=await agentContext.run({host:''},()=>docker('/info',{timeoutMs:3000}));
  return {id:'direct',name:info.Name||address,aliases:[address,info.Name].filter(Boolean)};
 }catch{return {id:'direct',name:address,aliases:[address]}}
}

export async function pairingTargets(kind,{config=clusterConfig,query=pve,agents=agentNodes,network=agentNetworkReports,direct=directHost}={}){
 if(!['proxmox','docker'].includes(kind))throw Object.assign(Error('Choose a valid connection type.'),{status:400});
 const connections=[],targets=[],isDocker=kind==='docker';
 const reports=new Map((isDocker?network():[]).filter(r=>r.kind==='docker'&&r.online).map(r=>[r.id,r.network]));
 for(const agent of agents()){
  if(agent.kind===kind){
   const interfaces=reports.get(agent.id)?.interfaces||[];
   connections.push({id:'agent:'+agent.id,name:agent.name,source:agent.pairingTarget,
    aliases:[agent.hostname,agent.name,agent.pairingTarget?.replace(/^standalone:/,''),...interfaces.flatMap(i=>i.addresses.map(a=>a.split('/')[0]))].filter(Boolean),
    macs:interfaces.map(i=>i.mac).filter(Boolean)});
  }
  if(isDocker&&agent.kind==='proxmox'){
   for(const host of agent.hosts||[]){
    if(host.setup||!(host.online||host.status==='connected'))continue;
    connections.push({id:'agent:'+agent.id+':'+host.id,name:host.name||agent.name,
     source:host.id==='node'?undefined:(agent.hostname||agent.name)+':'+host.id,aliases:[host.name||agent.hostname].filter(Boolean)});
   }
  }
 }
 const c=config();let discoveryError='';
 if(c?.url&&c.tokenId&&c.tokenSecret){
  try{
   const rows=await query('/cluster/resources',{},c);
   if(!Array.isArray(rows))throw Object.assign(Error(),{invalidResponse:true});
   for(const r of rows){
    if(!isDocker&&r.type==='node'&&r.node)targets.push({id:'node:'+r.node,name:r.node,label:r.node+' · Proxmox node'});
    if(isDocker&&['qemu','lxc'].includes(r.type)&&r.node&&r.vmid){
     const type=r.type==='lxc'?'CT':'VM',name=r.name||type+' '+r.vmid;
     targets.push({id:r.node+':'+r.type+'/'+r.vmid,name,label:`${name} · ${type} ${r.vmid} · ${r.node}`});
    }
   }
  }catch(error){discoveryError=proxmoxTestError(error)}
 }
 if(isDocker){const engine=await direct();if(engine)connections.push(engine)}
 const matched=new Set();
 function mark(host,target){
  matched.add(host);target.paired=true;
  target.aliases=[...new Set([...(target.aliases||[]),...host.aliases])];
 }
 for(const host of connections){
  const key=guestKey(host.source);
  const candidates=key?targets.filter(t=>guestKey(t.id)===key):
   targets.filter(t=>host.aliases.some(a=>normalize(a)===normalize(t.name)));
  if(candidates.length===1)mark(host,candidates[0]);
 }
 // A legacy connector's Linux hostname can differ from its Proxmox display name.
 const legacy=connections.filter(h=>!matched.has(h)&&!guestKey(h.source)&&h.macs?.length);
 if(legacy.length){
  const remaining=targets.filter(t=>!t.paired);
  for(let i=0;i<remaining.length;i+=4){
   await Promise.all(remaining.slice(i,i+4).map(async target=>{
    const [node,guest]=target.id.split(':');
    try{
     const cfg=await query('/nodes/'+encodeURIComponent(node)+'/'+guest+'/config',{timeoutMs:2500},c);
     const macs=Object.entries(cfg).filter(([key])=>/^net\d+$/.test(key)).flatMap(([,v])=>normalize(v).match(/(?:[a-f0-9]{2}:){5}[a-f0-9]{2}/g)||[]);
     for(const h of legacy)if(h.macs.some(mac=>macs.includes(mac)))mark(h,target);
    }catch{/* Keep unverified guests selectable when config reads are unavailable. */}
   }));
  }
 }
 for(const h of connections)if(!matched.has(h))targets.push({id:h.id,name:h.name,label:h.name,paired:true,aliases:h.aliases});
 return {targets:targets.map(t=>({...t,name:t.name.replace(/[^a-zA-Z0-9 _.()-]/g,'_').trim().slice(0,100)})).sort((a,b)=>a.label.localeCompare(b.label)),discoveryError};
}
