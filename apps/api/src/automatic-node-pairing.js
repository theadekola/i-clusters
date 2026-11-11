import {verifySSHHostKey} from './ssh-host-trust.js';
import {Client} from 'ssh2';
import {isIP} from 'node:net';
import crypto from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {clusterConfig} from './cluster-config.js';
import {pve} from './connectors.js';
import {targetSSHHost} from './ssh-target.js';
import {createPairing,pairNode,revokeAgent,agentNodes} from './node-agents.js';
import {passwordAuthentication} from './ssh-password.js';
import {connectorSource,connectorRelease} from './connector-release.js';
const script=readFileSync(new URL('./agent-assets/pair-node-ssh.py',import.meta.url),'utf8');
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const quote=value=>"'"+value.replace(/'/g,"'\"'\"'")+"'";
const messages={'controller-tls':'The Docker host could not verify the controller certificate. Re-export the controller public CA on the i-Clusters VM and retry.','controller-network':'The Docker host cannot reach the controller HTTPS address. Check routing and firewall access between the guest and controller.','wrong-guest':'The SSH host does not match the selected VM or CT. No installation was performed.','docker-missing':'Docker is missing. Select Install Docker and retry to install it on this host.','docker-unavailable':'The Docker Engine did not respond. Check the Docker service on this host and retry.','docker-start':'Docker is installed. Select Start Docker and retry to start its service.','docker-unsupported':'Automatic Docker installation requires Debian or Ubuntu with apt-get. Install Docker Engine on this host before pairing.','systemd-required':'This Docker host requires systemd to run the connector service.','wrong-node':'This SSH host is not the selected Proxmox node. No installation was performed.','not-proxmox':'This host does not have the Proxmox node tools. Use the Proxmox node, not a VM or CT.','already-installed':'A connector is already installed on this node. Use its existing connection, or remove the old connector before pairing again.','root-required':'Root or password-based sudo access is required.','service-failed':'The connector service could not start. Inspect systemd on the selected node.','bootstrap-failed':'The node could not verify the controller HTTPS connection or complete installation. Check the controller address, certificate and node service.'};
export function executePairingSSH(client,username,password,payload){return new Promise((resolve,reject)=>{
 let output='',settled=false;const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);client.removeListener('close',onDisconnect);error?reject(error):resolve(result)};
 const interrupted=(message,status)=>Object.assign(fail(message,status),{interrupted:true});
 const onDisconnect=()=>finish(interrupted('SSH installation was interrupted. Inspect the connector service before retrying.',422));
 client.once('close',onDisconnect);
 const timer=setTimeout(()=>{client.end();finish(interrupted('SSH installation timed out. Inspect the node before retrying.',504))},payload.installDocker&&payload.mode==='install'?600000:75000);
 const command='python3 -c '+quote(script),shell=username==='root'?command:"sudo -k -S -p '' /usr/bin/python3 -c "+quote(script);
 client.exec(shell,(error,stream)=>{if(error)return finish(fail('SSH installation could not start.',422));stream.on('data',chunk=>{output=(output+chunk.toString()).slice(-8192)});stream.stderr?.on('data',()=>{});stream.on('error',()=>finish(interrupted('SSH installation was interrupted. Inspect the connector service before retrying.',422)));stream.on('close',code=>{let result;try{result=JSON.parse(output)}catch{return finish(interrupted('SSH installation did not return a verification result. Check root/sudo access.',422))}if(code!==0||result.error)return finish(Object.assign(fail(messages[result.error]||'Connector installation failed. Inspect the node before retrying.',422),{reason:result.error}));finish(null,result)});stream.end((username==='root'?'':password+'\n')+'ICLUSTERS_PAIRING_V1\n'+JSON.stringify(payload));});
});}
export function createAutomaticNodePairing({config=clusterConfig,query=pve,nodes=agentNodes,pairing=createPairing,pair=pairNode,revoke=revokeAgent,clientFactory=()=>new Client(),run=executePairingSSH,origin=()=>process.env.WEB_ORIGIN?.split(',')[0],ca=()=>existsSync('/run/iclusters/ca/controller-ca.pem')?readFileSync('/run/iclusters/ca/controller-ca.pem','utf8'):'',now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),heartbeatTimeout=60000,kind='proxmox',resolveTarget,readyHost=()=>true}={}){
 const jobs=new Map(),running=new Map(),recovery=new WeakMap();
 const exists=job=>nodes().some(n=>n.id===job.agentId);
 const binding=()=>crypto.createHash('sha256').update(JSON.stringify(config())).digest('hex');
 const nodeName=node=>{
  if(kind==='docker'&&typeof node==='string'&&node.startsWith('standalone:')){
   const host=node.slice(11);
   if(isIP(host)||host.length<=253&&host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))return node;
  }
if(typeof node!=='string'||!(kind==='docker'?/^[A-Za-z0-9_.-]+:(qemu|lxc)\/\d+$/:/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/).test(node))throw fail('Select a valid Proxmox node.');return node};
 const controller=()=>{let url;try{url=new URL(origin())}catch{throw fail('Configure the controller WEB_ORIGIN as its reachable HTTPS address.',409)}if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw fail('Configure a reachable HTTPS controller origin without credentials or a path.',409);return url.origin+(process.env.ICLUSTERS_CLUSTER_PROFILE?'/api/cluster-profiles/'+process.env.ICLUSTERS_CLUSTER_PROFILE:'')};
 const readTarget=async node=>{nodeName(node);const c=config(),bound=binding(),resolved=resolveTarget?await resolveTarget(node,c):{host:await targetSSHHost('node:'+node,(path)=>query(path,{},c))};if(binding()!==bound)throw fail('The Proxmox connection changed. Reopen setup.',409);return {node,...resolved,port:22,connectionId:bound,controller:controller()}};
 const fresh=job=>nodes().some(n=>n.id===job.agentId&&(n.hostname===(job.hostname||job.node))&&readyHost(n)&&n.online&&n.version===connectorRelease.version&&n.revision===connectorRelease.revision&&Date.parse(n.lastSeen)>=Date.parse(job.startedAt));
 const read=id=>{
  const job=jobs.get(id);
  if(!job)throw fail('Installation status is no longer available. Check the node connector before retrying.',404);
  if(['completed','interrupted','unverified'].includes(job.state)&&!exists(job)){
   recovery.delete(job);Object.assign(job,{state:'failed',message:'Connection removed.'});
  }else if(['unverified','interrupted'].includes(job.state)&&fresh(job)){
   recovery.delete(job);Object.assign(job,{state:'completed',message:'Node connector installed, paired and fresh heartbeat verified.'});
  }
  return {...job};
 };
 async function perform(job,input){let client,registered,installed=false;const previous=recovery.get(job);try{
  if(binding()!==input.connectionId)throw fail('The Proxmox connection changed. Reopen setup.',409);
  client=clientFactory();
  await new Promise((resolve,reject)=>{
   let hostKeyRejected=false;
   client.once('ready',resolve);
   client.once('error',error=>{
    let message='SSH could not connect to the selected host. Check the address, port and SSH service.';
    if(hostKeyRejected)message='SSH host key verification failed. Check the host identity from its trusted console before retrying.';
    else if(error?.level==='client-authentication')message='SSH login failed. Check the Linux username and password on the selected host.';
    reject(fail(message,422));
   });
   client.connect({host:input.host,port:input.port,username:input.username,...passwordAuthentication(client,input.password),readyTimeout:12000,
    hostVerifier:key=>{hostKeyRejected=!verifySSHHostKey(input,key);return !hostKeyRejected}});
  });
  if(binding()!==input.connectionId)throw fail('The Proxmox connection changed. Reopen setup.',409);
  const resolved=await readTarget(job.node);if(resolved.host!==input.host)throw fail('Host address changed. Reopen setup.',409);const base={mode:'probe',node:job.node,kind,resume:!!previous,installDocker:kind==='docker'&&input.installDocker===true,url:controller(),ca:ca(),...(resolved.identity?{identity:resolved.identity}:{})};
  Object.assign(job,{state:'checking',message:'Checking the selected node, root access and controller HTTPS trust.'});
  const probe=await run(client,input.username,input.password,base);if(!probe?.ready||kind==='proxmox'&&probe.hostname!==job.node||!probe.hostname||!/^[A-Za-z0-9_.-]{1,100}$/.test(probe.hostname))throw fail('The selected Proxmox node identity was not verified.',422);
  if(binding()!==input.connectionId)throw fail('The Proxmox connection changed. No connector was installed.',409);
  if(previous){
   if(!exists(job)||job.hostname!==probe.hostname)throw fail('The selected node address or Proxmox connection changed. Reopen setup.',409);
   registered={...previous.registration};
  }else{
   job.hostname=probe.hostname;
   if(nodes().some(n=>n.hostname===probe.hostname))throw fail('This host already has a connector pairing.',409);
   registered=pair(pairing({kind,name:probe.hostname}).code,probe.hostname,kind);
   job.agentId=registered.id;
  }
  Object.assign(job,{state:'installing',message:'Installing and pairing the connector on the verified node.'});
  const result=await run(client,input.username,input.password,{...base,mode:'install',...registered,source:deflateSync(Buffer.from(connectorSource)).toString('base64'),revision:connectorRelease.revision});
  if(!result?.installed)throw fail('The node did not verify connector installation.',422);installed=true;recovery.delete(job);registered.token='';input.password='';client.end();
  Object.assign(job,{state:'verifying',message:'Connector started. Waiting for its first fresh heartbeat.'});const deadline=now()+heartbeatTimeout;
  do{if(fresh(job)){Object.assign(job,{state:'completed',message:'Node connector installed, paired and fresh heartbeat verified.'});return}if(now()>=deadline)break;await sleep(1000)}while(true);
  Object.assign(job,{state:'unverified',message:'Connector installed, but its heartbeat is not verified yet. Check HTTPS connectivity and its systemd service. Do not reinstall it.'});
 }catch(error){
  if((registered&&error.interrupted)||(previous&&!installed)){
   if(!previous)recovery.set(job,{registration:{...registered},host:input.host,port:input.port,fingerprint:input.fingerprint,connectionId:input.connectionId});
   Object.assign(job,{state:'interrupted',message:previous&&error.status?error.message:'Waiting for the connector heartbeat. Resume setup if the host does not report in.'});
   return;
  }
  if(['docker-missing','docker-start'].includes(error.reason))job.action=error.reason;
  if(registered&&!installed)revoke(registered.id);Object.assign(job,{state:'failed',message:error?.status?error.message:'Automatic pairing failed. Check the selected node, SSH credentials and controller HTTPS access. Inspect the node before retrying.'});}finally{input.password='';if(registered)registered.token='';client?.end();running.delete(job.node)}}
 return {async target(node){
  const target=await readTarget(node);
  const latest=[...jobs.values()].reverse().find(job=>job.node===node);
  if(!latest)return target;
  const job=read(latest.id);
  return job.state==='failed'?target:{...target,job};
 },status:read,async start(input){
  if(input?.confirm!==true||input?.verified!==true)throw fail('Approve installation and verify the SSH host fingerprint.');nodeName(input.node);
  if(typeof input.username!=='string'||!/^[A-Za-z_][A-Za-z0-9_.-]{0,99}$/.test(input.username)||typeof input.password!=='string'||!input.password||input.password.length>2048||/[\r\n\0]/.test(input.password))throw fail('Enter fresh SSH username and password credentials.');
  if(!Number.isInteger(Number(input.port))||Number(input.port)<1||Number(input.port)>65535||!/^SHA256:[A-Za-z0-9+/]{43}$/.test(input.fingerprint||''))throw fail('Enter a valid SSH port and verify the host fingerprint.');
  const target=await readTarget(input.node);
  if(target.guestAgentSetup)throw fail('Verify QEMU Guest Agent before pairing this Docker host.',409);
  if(input.connectionId!==target.connectionId||input.host!==target.host)throw fail('The selected node address or Proxmox connection changed. Reopen setup.',409);
  if(running.has(input.node))throw fail('Automatic pairing is already running for this node.',409);
  const resumed=input.resumeJob?jobs.get(input.resumeJob):null;
  const pendingRecovery=[...jobs.values()].find(j=>j.node===input.node&&recovery.has(j)&&exists(j));
  if(input.resumeJob||pendingRecovery){
   const saved=recovery.get(resumed);
   if(!saved||resumed!==pendingRecovery||saved.host!==input.host||saved.port!==Number(input.port)||saved.fingerprint!==input.fingerprint||saved.connectionId!==input.connectionId)throw fail('Host address changed. Reopen setup.',409);
   const status=read(resumed.id);
   if(status.state==='completed')return status;
   if(status.state!=='interrupted')throw fail('Automatic pairing is already running for this node.',409);
  }
  if(!resumed&&nodes().some(n=>n.kind===kind&&(n.hostname===input.node||n.name===input.node)))throw fail('This node already has a pairing. Recheck its existing connector or revoke it before a new installation.',409);
  if(!resumed&&jobs.size>=100){const old=[...jobs].find(([,j])=>!running.has(j.node)&&!(recovery.has(j)&&exists(j)));if(old)jobs.delete(old[0]);else throw fail('Too many node installations are running.',429)}
  const job=resumed||{id:crypto.randomUUID(),node:input.node,state:'connecting',message:'Connecting to the selected Proxmox node.',startedAt:new Date(now()).toISOString()};job.state='connecting';jobs.set(job.id,job);
  const credentials={installDocker:input.installDocker===true,node:input.node,host:input.host,port:Number(input.port),username:input.username,password:input.password,fingerprint:input.fingerprint,connectionId:input.connectionId};const pending=Promise.resolve().then(()=>perform(job,credentials)).catch(()=>{Object.assign(job,{state:'failed',message:'Installation tracking failed. Inspect the node connector before retrying.'})});running.set(job.node,pending);return {...job};
 },wait:node=>running.get(node)};
}
export const automaticNodePairing=createAutomaticNodePairing();
