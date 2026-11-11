// The original runtime is the default profile. Additional profile directories are
// published atomically, after the connection has passed the ordinary save checks.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readDurableJson} from './durable-json.js';
import {clusterConfig,createClusterStore,validateCluster} from './cluster-config.js';

export const profilePattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const dataDirectory=()=>process.env.DATA_DIR||fileURLToPath(new URL('../runtime',import.meta.url));
export function createClusterProfiles(directory=dataDirectory(),primary=clusterConfig){
  const root=path.join(directory,'clusters');
  const folder=id=>{
    if(!profilePattern.test(id))throw Object.assign(Error('Unknown cluster.'),{status:404});
    return path.join(root,id);
  };
  const filename=id=>path.join(folder(id),'proxmox-connection.json');
  const exists=id=>profilePattern.test(id)&&fs.existsSync(filename(id));
  const allIds=()=>fs.existsSync(root)
    ?fs.readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isDirectory()&&profilePattern.test(entry.name)).map(entry=>entry.name)
    :[];
  const ids=()=>allIds().filter(exists);
  function entries(){
    return [{id:'default',config:primary()},...ids().map(id=>({id,config:createClusterStore(filename(id)).read()}))];
  }
  const normalize=url=>url?new URL(url).origin:'';
  function check(config,except){
    if(entries().some(row=>row.id!==except&&normalize(row.config?.url)===normalize(config.url)))
      throw Object.assign(Error('This Proxmox endpoint is already saved. Select its cluster.'),{status:409});
  }
  function add(input){
    const config=validateCluster(input);
    check(config);
    for(const id of allIds()){
      if(exists(id))continue;
      const disconnected=readDurableJson(path.join(folder(id),'proxmox-disconnected.json'));
      if(normalize(disconnected?.url)===normalize(config.url)){
        createClusterStore(filename(id)).save(config);
        return {id,name:config.name};
      }
    }
    fs.mkdirSync(root,{recursive:true,mode:0o700});
    const staging=fs.mkdtempSync(path.join(root,'.new-'));
    try{
      createClusterStore(path.join(staging,'proxmox-connection.json')).save(config);
      const id=randomUUID();fs.renameSync(staging,folder(id));
      return {id,name:config.name};
    }finally{if(fs.existsSync(staging))fs.rmSync(staging,{recursive:true,force:true})}
  }
  return {allIds,ids,exists,folder,add,check,list:()=>entries().map(({id,config})=>({id,name:config?.name||'Default cluster',endpoint:config?.url?new URL(config.url).host:null,configured:!!config?.url}))};
}
