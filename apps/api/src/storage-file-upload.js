import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import {once} from 'node:events';
import {clusterConfig} from './cluster-config.js';
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status})};
export function createStorageFileUploads({storage,scope,config=clusterConfig,transport}={}){
 const tickets=new Map();
 const clean=()=>{for(const [id,t] of tickets)if(t.expires<Date.now())tickets.delete(id)};
 return {
  async prepare(input,user){clean();if(tickets.size>=100||[...tickets.values()].filter(t=>t.user===user).length>=3)fail('Finish or wait for pending file imports before starting another');const current=scope();if(typeof input.filename!=='string'||input.filename.length>150)fail('Use a filename of 150 characters or fewer',400);const target=await storage.uploadTarget(input);target.filename=crypto.randomBytes(16).toString('hex')+'-'+target.filename;if(current!==scope()||input.connectionScope!==current)fail('Storage connection changed. Reopen the contents page');const uploadId=crypto.randomBytes(24).toString('hex');tickets.set(uploadId,{...target,user,connection:current,expires:Date.now()+15*60000});return {uploadId,filename:target.filename};},
  async transfer(uploadId,user,source){
   clean();const ticket=tickets.get(uploadId);if(!ticket||ticket.user!==user)fail('File import expired or belongs to another session',403);tickets.delete(uploadId);
   if(ticket.connection!==scope())fail('Storage connection changed. Reopen the contents page');
   const target=await storage.uploadTarget(ticket);if(target.revision!==ticket.revision||ticket.connection!==scope())fail('Storage settings changed. Reopen the contents page');
   if(source.headers['content-type']?.split(';')[0]!=='application/octet-stream')fail('Send a binary file upload',400);
   if(source.headers['content-length']&&Number(source.headers['content-length'])!==ticket.size)fail('File size changed before import',400);
   const settings=config(),base=new URL(settings.url);if(!['https:','http:'].includes(base.protocol))fail('Invalid Proxmox connection');
   const url=new URL(base.toString().replace(/\/$/,'')+`/api2/json/nodes/${encodeURIComponent(ticket.node)}/storage/${encodeURIComponent(ticket.id)}/upload`);
   const boundary='iclusters-'+crypto.randomBytes(24).toString('hex');
   const prefix=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="content"\r\n\r\n${ticket.content}\r\n--${boundary}\r\nContent-Disposition: form-data; name="filename"; filename="${ticket.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),suffix=Buffer.from(`\r\n--${boundary}--\r\n`);
   const send=transport||(url.protocol==='https:'?https.request:http.request);
   let upstream;const response=new Promise((resolve,reject)=>{
    upstream=send(url,{method:'POST',headers:{Authorization:`PVEAPIToken=${settings.tokenId}=${settings.tokenSecret}`,'Content-Type':'multipart/form-data; boundary='+boundary,'Content-Length':prefix.length+ticket.size+suffix.length},rejectUnauthorized:settings.verifyTls,...(settings.ca?{ca:settings.ca}:{})},res=>{
     const chunks=[];let bytes=0;res.on('data',chunk=>{bytes+=chunk.length;if(bytes>1024**2){upstream.destroy(Error('Import response exceeded the allowed size'));return;}chunks.push(chunk)});res.on('error',reject);res.on('end',()=>{let body;try{body=JSON.parse(Buffer.concat(chunks).toString())}catch{return reject(Error('Proxmox returned an unreadable import result. Check the storage contents before retrying.'))}if(res.statusCode<200||res.statusCode>=300)return reject(Error('Proxmox file import failed: '+(body.errors?JSON.stringify(body.errors):res.statusCode)));resolve(body.data)});
    });upstream.on('error',reject);upstream.setTimeout(120000,()=>upstream.destroy(Error('File import stalled. Check storage contents before retrying.')));
   });let failure=null;response.catch(error=>{failure=error});
   const write=async chunk=>{if(failure||upstream.destroyed)throw failure||Error('Import connection closed. Check storage contents before retrying.');if(!upstream.write(chunk))await once(upstream,'drain')};
   try{
    await write(prefix);let bytes=0;
    for await(const chunk of source){bytes+=chunk.length;if(bytes>ticket.size)fail('File exceeds the approved import size',400);await write(chunk);}
    if(bytes!==ticket.size)fail('File upload was incomplete; check storage contents before retrying',400);
    upstream.end(suffix);const result=await response;return {node:ticket.node,id:ticket.id,filename:ticket.filename,...(typeof result==='string'&&result.startsWith('UPID:')?{task:result}:{}),accepted:true};
   }catch(error){upstream.destroy();throw error;}
  }
 };
}
