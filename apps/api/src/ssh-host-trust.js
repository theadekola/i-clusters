import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createClusterStore} from './cluster-config.js';

export const sshKeyFingerprint=key=>'SHA256:'+crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/,'');
const fail=message=>Object.assign(Error(message),{status:409});
// Known-host records contain public fingerprints only, never credentials.
// First contact enrolls a key; subsequent contacts must match the persisted key.
export function createSSHHostTrust(filename){
 return (host,port,fingerprint,expected)=>{
  if(typeof host!=='string'||!host||/[\s/]/.test(host)||!Number.isInteger(Number(port))||Number(port)<1||Number(port)>65535||!/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint||''))throw fail('A valid SSH host and fingerprint are required.');
  if(expected&&expected!==fingerprint)throw fail('SSH host key changed. Connection blocked; verify the host through its trusted console before updating its known-host record.');
  const endpoint=JSON.stringify([host.toLowerCase().replace(/^\[|\]$/g,''),Number(port)]);
  let records={};try{if(fs.existsSync(filename))records=JSON.parse(fs.readFileSync(filename,'utf8'));if(!records||Array.isArray(records)||typeof records!=='object')throw Error();}catch{throw fail('SSH known-host records could not be read. Connection blocked.');}
  const saved=records[endpoint];if(saved){if(saved.fingerprint!==fingerprint)throw fail('SSH host key changed. Connection blocked; verify the host through its trusted console before updating its known-host record.');return {source:'known-host',fingerprint};}
  records[endpoint]={host,port:Number(port),fingerprint,enrolledAt:new Date().toISOString()};
  fs.mkdirSync(path.dirname(filename),{recursive:true});const temporary=filename+'.'+crypto.randomUUID()+'.tmp';
  try{fs.writeFileSync(temporary,JSON.stringify(records)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temporary,filename);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  return {source:expected?'saved-connection':'first-use',fingerprint};
 };
}
export function trustSSHHost(host,port,fingerprint,expected){
 const directory=process.env.DATA_DIR||'runtime',savedFile=path.join(directory,'ssh-connections.json');
 if(fs.existsSync(savedFile)){
  const saved=createClusterStore(savedFile,()=>process.env.JWT_SECRET,v=>v).read();
  const pins=Object.values(saved||{}).filter(v=>v.host?.toLowerCase()===host?.toLowerCase()&&Number(v.port||22)===Number(port||22)).map(v=>v.fingerprint).filter(Boolean);
  if(pins.some(pin=>pin!==fingerprint))throw fail('SSH host key changed from a saved verified connection. Connection blocked.');
  expected=expected||pins[0];
 }
 return createSSHHostTrust(path.join(directory,'ssh-known-hosts.json'))(host,Number(port||22),fingerprint,expected);
}
export function verifySSHHostKey(input,key){
 const fingerprint=sshKeyFingerprint(key);if(fingerprint!==input.fingerprint)return false;
 try{trustSSHHost(input.host,input.port||22,fingerprint);return true;}catch{return false;}
}
