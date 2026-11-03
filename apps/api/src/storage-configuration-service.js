import crypto from 'node:crypto';
import {pve} from './connectors.js';
import {storageConfiguration} from './storage.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const enc=encodeURIComponent,hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const all=['images','rootdir','iso','vztmpl','backup','snippets','import'];
export const storageContentTypes={dir:all,nfs:all,cifs:all.filter(c=>c!=='rootdir'),lvm:['images','rootdir'],lvmthin:['images','rootdir'],zfspool:['images','rootdir'],rbd:['images','rootdir'],zfs:['images'],iscsi:['images'],cephfs:['iso','vztmpl','backup','snippets'],pbs:['backup']};
const identity=value=>{if(typeof value!=='string'||!value||value.length>128||!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value))fail('Select a valid storage or node');return value};
const contents=config=>String(config.content||'').split(',').filter(Boolean);
export function createStorageConfigurationService({query=pve}={}){
 async function nodes(){const rows=await query('/nodes');if(!Array.isArray(rows))fail('Node inventory unavailable',502);return rows.filter(r=>r.node).map(r=>({node:r.node,status:r.status}));}
 async function mounts(node){identity(node);const rows=await query(`/nodes/${enc(node)}/disks/directory`);if(!Array.isArray(rows))fail('Mounted disk inventory unavailable',502);return rows.filter(r=>typeof r.path==='string'&&r.path.startsWith('/')&&r.path!=='/').map(r=>({path:r.path,device:r.device||null,type:r.type||null}));}
 async function inspect(id){identity(id);const config=await query('/storage/'+enc(id));if(!config||typeof config!=='object'||!config.type)fail('Storage configuration unavailable',502);const content=contents(config);const model={id,type:config.type,content,nodes:String(config.nodes||'').split(',').filter(Boolean),enabled:![1,true,'1'].includes(config.disable),shared:config.shared==null?null:[1,true,'1'].includes(config.shared),path:config.path||null,allowedContent:storageContentTypes[config.type]||[],digest:config.digest||null};return {...model,revision:hash(model)};}
 async function context(node,id){identity(node);const model=await inspect(id);if(!model.enabled)fail('Storage is disabled',409);if(model.nodes.length&&!model.nodes.includes(node))fail('Storage is not assigned to this node',409);const status=await query(`/nodes/${enc(node)}/storage/${enc(id)}/status`);if(![1,true,'1'].includes(status?.active))fail('Storage is not active on the selected node',409);return model;}
 return {
  inspect,mounts,
  async options(){const [configuration,nodeRows]=await Promise.all([storageConfiguration(query),nodes()]);return {...configuration,nodes:nodeRows};},
  async configure(input,guard=()=>{}){
   const availableNodes=await nodes();identity(input.node);if(!availableNodes.some(n=>n.node===input.node))fail('Select a detected node');
   if(!Array.isArray(input.content)||!input.content.length||input.content.some(c=>typeof c!=='string')||new Set(input.content).size!==input.content.length)fail('Select one or more storage uses');
   if(input.mode==='mount'){
    const selected=(await mounts(input.node)).find(m=>m.path===input.mount);if(!selected)fail('Select a currently detected mounted disk',409);
    const configs=await storageConfiguration(query);if(configs.resources.some(r=>r.path===selected.path&&(!r.nodes.length||r.nodes.includes(input.node))))fail('This mounted disk is already registered. Select its existing storage ID.',409);
    identity(input.id);if(!/^[A-Za-z][A-Za-z0-9_-]*$/.test(input.id)||configs.resources.some(r=>r.id===input.id))fail('Enter a new, unique storage ID');
    if(input.content.some(c=>!all.includes(c)))fail('Unsupported storage use');guard();
    await query('/storage',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({storage:input.id,type:'dir',path:selected.path,nodes:input.node,content:input.content.join(','),is_mountpoint:'1'}).toString()});return {configured:true,id:input.id};
   }
   const model=await inspect(input.id);if(input.revision!==model.revision)fail('Storage configuration changed. Reopen Configure Disk.',409);
   if(!model.digest)fail('Current storage configuration digest is unavailable',409);
   if(input.content.some(c=>!model.allowedContent.includes(c)))fail('The selected storage type does not support that use');
   if(!Array.isArray(input.nodes)||input.nodes.some(n=>!availableNodes.some(a=>a.node===n)))fail('Select detected nodes');
   if(typeof input.enabled!=='boolean'||input.shared!==null&&typeof input.shared!=='boolean')fail('Enabled and shared settings must be booleans');
   const removed=model.content.filter(c=>!input.content.includes(c));
   if(removed.length){for(const node of availableNodes.filter(n=>!model.nodes.length||model.nodes.includes(n.node))){const rows=await query(`/nodes/${enc(node.node)}/storage/${enc(model.id)}/content`);if(!Array.isArray(rows))fail('Cannot verify existing files before removing a storage use',409);if(rows.some(r=>removed.includes(r.content)))fail('A storage use cannot be removed while it contains files or volumes',409);}}
   const removedNodes=availableNodes.filter(n=>(!model.nodes.length||model.nodes.includes(n.node))&&input.nodes.length&&!input.nodes.includes(n.node));for(const node of removedNodes){const rows=await query(`/nodes/${enc(node.node)}/storage/${enc(model.id)}/content`);if(!Array.isArray(rows)||rows.length)fail('A node cannot be unassigned while its storage contains files or volumes',409);}
   guard();const body={content:input.content.join(','),digest:model.digest,...(input.enabled!==model.enabled?{disable:input.enabled?'0':'1'}:{}),...(input.shared!==null&&input.shared!==model.shared?{shared:input.shared?'1':'0'}:{}),...(JSON.stringify([...input.nodes].sort())!==JSON.stringify([...model.nodes].sort())?(input.nodes.length?{nodes:input.nodes.join(',')}:{delete:'nodes'}):{})};
   await query('/storage/'+enc(model.id),{method:'PUT',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body).toString()});return {configured:true,id:model.id};
  },
  async browse(node,id){const model=await context(node,id),rows=await query(`/nodes/${enc(node)}/storage/${enc(id)}/content`);if(!Array.isArray(rows))fail('Storage files could not be read',502);return {model,files:rows.map(r=>({volid:r.volid,content:r.content,size:r.size??null,format:r.format??null,vmid:r.vmid??null,ctime:r.ctime??null})),uploadTypes:['dir','nfs','cifs','cephfs'].includes(model.type)?model.content.filter(c=>['iso','vztmpl','import'].includes(c)):[]};},
  async uploadTarget(input){const model=await context(input.node,input.id);if(!['iso','vztmpl','import'].includes(input.content)||!model.content.includes(input.content)||!['dir','nfs','cifs','cephfs'].includes(model.type))fail('This storage does not support that file import');
   const extensions={iso:/\.iso$/i,vztmpl:/\.tar\.(gz|xz|zst)$/i,import:/\.(qcow2|raw|vmdk|ova)$/i};
   if(typeof input.filename!=='string'||input.filename.length>200||!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.filename)||!extensions[input.content].test(input.filename))fail('Choose a supported filename without spaces or directory separators');
   if(!Number.isSafeInteger(input.size)||input.size<1||input.size>64*1024**3)fail('Choose a file between 1 byte and 64 GiB');
   const rows=await query(`/nodes/${enc(input.node)}/storage/${enc(input.id)}/content`);if(!Array.isArray(rows))fail('Cannot verify existing files',502);if(rows.some(r=>r.volid?.split('/').pop()===input.filename))fail('A file with that name already exists. Rename the import first.',409);
   return {node:input.node,id:input.id,content:input.content,filename:input.filename,size:input.size,revision:model.revision};
  }
 };
}
export const storageConfigurationService=createStorageConfigurationService();
