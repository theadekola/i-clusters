import ssh2 from 'ssh2';

// Password-only PAM login uses the same credentials as SSH password auth.
// Never send the password in response to an OTP, token or recovery challenge.
export function passwordAuthentication(client,password){
 client.on('keyboard-interactive',(_name,_instructions,_language,prompts,finish)=>{
  const passwordOnly=prompts.length===1&&prompts[0].echo===false&&/^\s*(?:[\w.@-]+(?:'s)?\s+)?password\s*:\s*$/i.test(prompts[0].prompt||'');
  finish(passwordOnly?[password]:prompts.map(()=>''));
 });
 return {password,tryKeyboard:true};
}

export function parseSSHPrivateKey({privateKey,keyPassphrase}){
 if(typeof privateKey!=='string'||!privateKey.trim()||Buffer.byteLength(privateKey)>65536||
  (keyPassphrase!==undefined&&(typeof keyPassphrase!=='string'||keyPassphrase.length>2048)))
  throw Object.assign(Error('Choose a valid SSH private key file.'),{status:400});
 const key=ssh2.utils.parseKey(privateKey,keyPassphrase);
 if(!key||Array.isArray(key)||key instanceof Error||!key.isPrivateKey())
  throw Object.assign(Error('The SSH private key could not be read. Check the key file and passphrase.'),{status:400});
 return key;
}

export function sshAuthentication(client,{username,password,key}){
 const methods=key?['publickey']:['password','keyboard-interactive'];
 let offeredMethods,needsAdditionalMethod=false;
 const authHandler=(methodsLeft,partial)=>{
  if(!methodsLeft)return 'none';
  offeredMethods??=methodsLeft;
  needsAdditionalMethod||=partial===true;
  const next=methodsLeft.length?methods.find(method=>methodsLeft.includes(method)):methods[0];
  if(!next||needsAdditionalMethod)return false;
  methods.splice(methods.indexOf(next),1);
  return key?{type:'publickey',username,key}:next;
 };
 const reason=()=>{
  if(needsAdditionalMethod)return 'additional-method';
  if(key)return 'key-rejected';
  if(offeredMethods?.includes('publickey')&&!offeredMethods.some(method=>method==='password'||method==='keyboard-interactive'))
   return 'key-required';
 };
 return {options:{...(key?{}:passwordAuthentication(client,password)),authHandler},reason};
}

export const sshAuthenticationMessages={
 'additional-method':'This SSH account requires an additional authentication method. Use the Proxmox console or an SSH client configured for that account.',
 'key-rejected':'The SSH server rejected this key. Check that the matching public key is authorized for this Linux username.',
 'key-required':'The SSH server did not offer password login for this account. Select SSH key to connect with an authorized key.'
};

export const lxcRootLoginMessage='SSH login failed. Check the username and password. The container may allow root on its console while blocking root login over SSH. Try an authorized SSH key or a Linux user with SSH access.';
