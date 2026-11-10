import {createAutomaticNodePairing} from './automatic-node-pairing.js';
import {pve} from './connectors.js';
import {targetSSHHost,assertGuestPlacement} from './ssh-target.js';

export function createAutomaticDockerPairing(options={}){
 const query=options.query||pve;
 async function resolveTarget(target,connection){
  if(target.startsWith('standalone:'))return {host:target.slice(11),sshTarget:'node:'+target,identity:{standalone:true}};
  const match=target.match(/^([A-Za-z0-9_.-]+):(qemu|lxc)\/(\d+)$/);
  if(!match)throw Object.assign(Error('Select a discovered VM or CT.'),{status:400});
  const [,node,kind,id]=match;
  const read=path=>query(path,{},connection);
  const guest=await assertGuestPlacement(node,id,kind,read);
  if(guest.status!=='running')throw Object.assign(Error('Docker pairing requires a running guest. Check its power state in Proxmox, then recheck the host.'),{status:409});

  const config=await read(`/nodes/${encodeURIComponent(node)}/${kind}/${id}/config`);
  const vm=kind==='qemu';
  const uuid=vm?String(config.smbios1||'').match(/(?:^|,)uuid=([^,]+)/)?.[1]:undefined;
  const macs=Object.entries(config).filter(([key])=>/^net\d+$/.test(key))
   .flatMap(([,value])=>String(value).match(/(?:[a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}/g)||[]).map(mac=>mac.toLowerCase());
  if(!uuid&&!macs.length)throw Object.assign(Error('The selected guest has no verifiable UUID or network adapter identity.'),{status:409});

  const guestAgentSetup={node,vmid:id,name:guest.name||id};
  if(vm&&!/(?:^|,)(?:1|enabled=1)(?:,|$)/.test(String(config.agent||'')))return {guestAgentSetup};
  const sshTarget=`${vm?'vm':'lxc'}:${node}:${id}`;
  try{
   const host=await targetSSHHost(sshTarget,read);
   return {host,sshTarget,identity:{uuid,macs}};
  }catch(error){
   // Only errors that Proxmox attributes to the agent can trigger its installer.
   if(vm&&error.providerStatus===500&&/(?:no (?:qemu )?guest agent configured|(?:qemu )?guest agent (?:is )?not (?:running|configured|enabled|responding))/i.test(error.message))return {guestAgentSetup};
   throw error;
  }
 }
 return createAutomaticNodePairing({...options,kind:'docker',resolveTarget,readyHost:n=>n.hosts?.some(h=>h.id==='node'&&h.online&&!h.setup)});
}
export const automaticDockerPairing=createAutomaticDockerPairing();
