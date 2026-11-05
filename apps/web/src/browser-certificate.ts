const limit=32768;
export async function readBrowserCertificate(signal:AbortSignal){
 const response=await fetch('/local-ca.crt',{credentials:'omit',cache:'no-store',redirect:'error',signal});
 if(!response.ok||!response.body)throw Error('Local certificate unavailable. Use the server export command or contact your administrator.');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('Unexpected certificate response.');chunks.push(value)}}catch(error){await reader.cancel().catch(()=>{});throw error}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 const pem=new TextDecoder().decode(bytes).trim(),match=/^-----BEGIN CERTIFICATE-----\s+([A-Za-z0-9+/=\r\n]+)\s+-----END CERTIFICATE-----$/.exec(pem);
 if(!match)throw Error('Unexpected certificate response.');
 const binary=atob(match[1].replace(/\s/g,'')),der=Uint8Array.from(binary,c=>c.charCodeAt(0));
 if(!der.length||der[0]!==0x30)throw Error('Unexpected certificate response.');
 let fingerprint:string|null=null;try{if(globalThis.crypto?.subtle){const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',der));fingerprint=Array.from(digest,b=>b.toString(16).padStart(2,'0').toUpperCase()).join(':')}}catch{}
 return {pem:pem+'\n',fingerprint};
}
