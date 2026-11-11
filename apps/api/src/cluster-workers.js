import {fork} from 'node:child_process';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {configurationSchemas} from './runtime-configuration.js';
import {profilePattern} from './cluster-profiles.js';

const controllerRoute=/^\/(?:auth|account|users|product|updates|cluster-profiles)(?:\/|$)/i;
const workerFile=fileURLToPath(new URL('./cluster-worker.js',import.meta.url));
function childEnvironment(id,directory,controllerDirectory){
  const env={...process.env};
  // A newly added cluster must never inherit the first cluster's provider
  // endpoints, secrets, Docker engine or notification destinations.
  for(const schema of Object.values(configurationSchemas))for(const f of schema.fields)delete env[f.key];
  for(const key of Object.keys(env))if(/^(PROXMOX_|DOCKER_|TRUENAS_|SERVICE_CHECKS_JSON$)/.test(key))delete env[key];
  return {...env,DATA_DIR:directory,ICLUSTERS_CLUSTER_PROFILE:id,ICLUSTERS_CONTROLLER_DATA:controllerDirectory,TRUST_PROXY:'1'};
}
const hopHeaders=['connection','keep-alive','proxy-connection','proxy-authorization','proxy-authenticate','te','trailer','transfer-encoding','upgrade'];
function forwarded(headers){
  const copy={...headers};
  for(const name of [...hopHeaders,...String(headers.connection||'').toLowerCase().split(',').map(x=>x.trim())])delete copy[name];
  return copy;
}
export function createClusterWorkers(profiles,controllerDirectory){
  const workers=new Map();
  let closed=false;
  function ensure(id){
    if(closed||!profiles.exists(id))throw Object.assign(Error('This cluster connection is unavailable.'),{status:404});
    const existing=workers.get(id);
    if(existing?.stopping)return existing.exited.then(()=>ensure(id));
    if(existing)return existing.ready;
    const key=randomBytes(32).toString('hex');
    const child=fork(workerFile,[],{env:{...childEnvironment(id,profiles.folder(id),controllerDirectory),ICLUSTERS_WORKER_KEY:key},execArgv:[],stdio:['ignore','inherit','inherit','ipc']});
    const entry={child,exited:new Promise(resolve=>child.once('exit',resolve)),requests:0,stopping:false};
    entry.ready=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{child.kill();reject(Error('Cluster runtime startup timed out.'))},20000);
      child.once('message',m=>{
        if(m?.type==='ready'&&Number.isInteger(m.port)&&m.port>0){clearTimeout(timer);resolve({port:m.port,key})}
      });
      const ended=()=>{clearTimeout(timer);if(workers.get(id)===entry)workers.delete(id);reject(Error('Cluster runtime is unavailable.'))};
      child.once('exit',ended);child.once('error',ended);
    });
    workers.set(id,entry);
    return entry.ready;
  }
  function stopWhenIdle(entry){
    if(!entry||entry.requests||entry.stopping)return;
    entry.stopping=true;
    entry.child.kill();
  }
  function sync(){
    if(closed)return;
    for(const id of profiles.ids())void ensure(id).catch(e=>console.error('Cluster runtime:',id,e.message));
    for(const [id,entry] of workers)if(!profiles.exists(id))stopWhenIdle(entry);
  }
  async function route(req,res){
    const {id}=req.params;
    if(!profilePattern.test(id)||!profiles.exists(id))return res.status(404).json({error:'This cluster connection is unavailable.'});
    if(controllerRoute.test(req.path)||!req.url.startsWith('/')||req.url.startsWith('//'))
      return res.status(404).json({error:'Unknown cluster route.'});
    try{
      const {port,key}=await ensure(id);
      if(res.destroyed||req.aborted)return;
      const entry=workers.get(id);
      if(!entry||entry.stopping||!profiles.exists(id))return res.status(404).json({error:'This cluster connection is unavailable.'});
      entry.requests++;
      res.once('close',()=>{
        entry.requests--;
        if(!profiles.exists(id))stopWhenIdle(entry);
      });
      const headers=forwarded(req.headers);
      delete headers.forwarded;
      headers['x-iclusters-worker-key']=key;
      headers['x-forwarded-for']=req.ip||req.socket.remoteAddress;
      headers['x-forwarded-proto']=req.protocol;
      headers['x-forwarded-host']=req.get('host');
      const upstream=http.request({host:'127.0.0.1',port,path:'/api'+req.url,method:req.method,headers},reply=>{
        res.writeHead(reply.statusCode,forwarded(reply.headers));
        reply.on('error',()=>res.destroy());
        reply.pipe(res);
      });
      upstream.on('error',()=>{if(!res.headersSent&&!res.destroyed)res.status(502).json({error:'Cluster runtime connection interrupted.'});else res.destroy()});
      req.once('aborted',()=>upstream.destroy());
      res.once('close',()=>{if(!res.writableFinished)upstream.destroy()});
      req.pipe(upstream);
    }catch(error){
      if(!res.headersSent&&!res.destroyed)res.status(error.status||503).json({error:error.message});
    }
  }
  function revoke(user,sessionId){
    for(const {child} of workers.values())if(child.connected)child.send({type:'revoke',user,sessionId},()=>{});
  }
  function close(){closed=true;for(const {child} of workers.values())child.kill()}
  return {route,sync,revoke,close};
}
