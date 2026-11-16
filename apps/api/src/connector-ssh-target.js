import {isIP} from 'node:net';
import {pve} from './connectors.js';
import {agentNetworkReports} from './node-agents.js';
import {assertGuestPlacement,targetSSHHost} from './ssh-target.js';
import {guestAddresses} from './guest-addresses.js';

export async function connectorSSHAddress(node,{query=pve,reports=agentNetworkReports}={}){
 const manual={host:'',port:22,source:'manual',message:'No IP address was reported for this connector. Enter its SSH IP address.'};
 if(node.kind==='docker'){
  try{
   const host=await targetSSHHost('docker:'+node.id,query,reports);
   if(isIP(host))return {host,port:22,source:'connector',message:'IP address reported by the paired connector.'};
  }catch{/* A paired guest may still have a current Proxmox interface reading. */}
  const guest=node.pairingTarget?.match(/^([\w.-]+):(qemu|lxc)\/(\d+)$/);
  if(!guest)return manual;
  const [,server,kind,id]=guest;
  try{
   const resource=await assertGuestPlacement(server,id,kind,query);
   if(resource.status!=='running')return manual;
   const endpoint=kind==='qemu'?'agent/network-get-interfaces':'interfaces';
   const reading=await query('/nodes/'+encodeURIComponent(server)+'/'+kind+'/'+id+'/'+endpoint);
   const [host]=guestAddresses(reading);
   if(host)return {host,port:22,source:'proxmox',message:'IP address reported by the guest network interface.'};
  }catch{/* Leave the address editable when guest inventory is unavailable. */}
  return manual;
 }
 try{
  const rows=await query('/cluster/status');
  const candidates=rows.filter(r=>r.type==='node'&&typeof r.name==='string');
  const name=String(node.hostname||node.name||'').toLowerCase();
  const exact=candidates.filter(r=>r.name.toLowerCase()===name);
  const matches=exact.length?exact:candidates.filter(r=>r.name.toLowerCase().split('.')[0]===name.split('.')[0]);
  if(matches.length===1&&isIP(String(matches[0].ip||'')))return {host:matches[0].ip,port:22,source:'proxmox',message:'SSH address reported for this paired node by the configured Proxmox cluster. Verify its SSH fingerprint before updating.'};
 }catch{/* No verified node address is available. */}
 return manual;
}
