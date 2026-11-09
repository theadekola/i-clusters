import {updateAwareError} from './software-update-state';
import {requestWithDeadline,waitForRequest} from './request-deadline';
export function setDockerHost(id:string){localStorage.setItem('iclusters_docker_host',id);window.dispatchEvent?.(new Event('iclusters-connection'));}
import {getAccessToken,getRefreshToken,setTokens,clearTokens,usesCookieSession} from './session';
export {getAccessToken,setTokens,clearTokens} from './session';
const API = import.meta.env.VITE_API_URL || '';
let refreshInFlight:Promise<boolean>|null=null;
function renewedSession(previous:string){
 const current=getAccessToken();
 if(!current||current===previous)return false;
 // Never replay a pending write under a different signed-in account or session.
 const identity=(token:string)=>{
  try{const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return claims}
  catch{return undefined}
 };
 const before=identity(previous),after=identity(current);
 if(before?.sub!==after?.sub||(before?.sid&&after?.sid&&before.sid!==after.sid))throw Object.assign(new Error('Session changed. Retry the action.'),{status:409});
 return true;
}
function refreshAccessToken(previous:string){
 const renew=async()=>{
  if(renewedSession(previous))return true;
  const refreshToken=getRefreshToken(),cookie=usesCookieSession();
  if(!getAccessToken()||(!refreshToken&&!cookie))return false;
  const {response,body}=await requestWithDeadline(`${API}/api/auth/refresh`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-IClusters-Browser':'1'},body:JSON.stringify(refreshToken?{refreshToken}:{})},async response=>({response,body:await response.json().catch(()=>({}))}),30000);
  if(renewedSession(previous))return true;
  if(!response.ok){
   if(response.status===401){
    // An older tab may have already rotated the cookie and still be saving its response.
    if(cookie&&!globalThis.navigator?.locks&&localStorage.getItem('iclusters_remember_until')){
     for(let i=0;i<20&&getAccessToken();i++){
      await new Promise(resolve=>setTimeout(resolve,100));
      if(renewedSession(previous))return true;
     }
    }
    if(getAccessToken()===previous&&getRefreshToken()===refreshToken)clearTokens();
   }
   throw Object.assign(new Error(response.status===401?'Session expired. Sign in again.':'Session refresh is temporarily unavailable.'),{status:response.status});
  }
  if(getAccessToken()!==previous||getRefreshToken()!==refreshToken)return false;
  setTokens(body.accessToken,body.refreshToken,undefined,body.rememberUntil,body.cookieSession===true);
  return true;
 };
 if(!refreshInFlight){
  const locks=globalThis.navigator?.locks;
  const coordinated=async()=>locks?await locks.request('iclusters-session-refresh',renew):await renew();
  refreshInFlight=coordinated()
   .catch(e=>{if(e.status!==401&&e.status!==409)window.dispatchEvent?.(new CustomEvent('iclusters-session-unavailable',{detail:e.message||'Connection temporarily unavailable'}));throw e})
   .finally(()=>{refreshInFlight=null});
 }
 return refreshInFlight;
}

export async function api<T = any>(path: string, options: RequestInit = {}, confirmation?: string, rawResponse=false): Promise<T> {
  try{
  const headers:any = { 'X-IClusters-Browser':'1', ...Object.fromEntries(new Headers(options.headers).entries()) };
  if(!Object.hasOwn(headers,'content-type'))headers['Content-Type']='application/json';
  const host=localStorage.getItem('iclusters_docker_host');if(host&&!Object.hasOwn(headers,'x-iclusters-docker-host')&&(/^\/(?:docker|actions\/docker)(?:\/|\?|$)|^\/(?:storage|network)(?:\?|$)/.test(path)))headers['X-IClusters-Docker-Host']=host;
  const token=getAccessToken(); if(token) headers.Authorization=`Bearer ${token}`;
  if(confirmation) headers['X-IClusters-Confirm']=confirmation;
  const deadline=options.method==='POST'&&/^\/ssh\/session\/[^/]+$/.test(path)?10000:/^\/proxmox\/storage-file-upload\//.test(path)?7200000:/^\/storage\/datasets\/(?:guest-(?:layout|expand)|edit)(?:\?|$)/.test(path)?300000:/^\/operations\/[^/]+\/tools$/.test(path)?390000:path.startsWith('/auth/')?30000:/^\/(?:node-agents\/guest\/(?:agent|bootstrap|setup)|docker\/image\/(?:pull|build))(?:[/?]|$)/.test(path)?1020000:undefined;
  const readResponse=async(res:Response)=>({res,body:rawResponse&&res.ok?undefined:await res.json().catch(()=>({}))});
  let {res,body} = await requestWithDeadline(`${API}/api${path}`, { ...options, headers },readResponse,deadline,rawResponse);

  if(res.status===401 && (!path.startsWith('/auth/')||path==='/auth/me')){
    if(renewedSession(token)||await waitForRequest(refreshAccessToken(token),options.signal)){
      renewedSession(token);
      headers.Authorization=`Bearer ${getAccessToken()}`;({res,body}=await requestWithDeadline(`${API}/api${path}`,{...options,headers},readResponse,deadline,rawResponse));
    }
  }
  if(rawResponse&&res.ok)return res as T;

  if (!res.ok) {
    const err:any=new Error(body.error || `Request failed: ${res.status}`);
    err.status=res.status; err.body=body; throw err;
  }
  if(options.method&&!['GET','HEAD'].includes(options.method.toUpperCase())&&path!=='/node-agents/pairing/status'&&!/^\/(auth|ssh|product)(?:\/|$)/.test(path))window.dispatchEvent?.(new Event('iclusters-api-write'));
  return body;
  }catch(error){throw updateAwareError(error)}
}

export async function confirmedApi<T=any>(path:string, options:RequestInit={},review?:{title?:string;description?:string}):Promise<T>{
 const host=localStorage.getItem('iclusters_docker_host')||'';let confirmation:string|undefined,grant='';
 for(let attempt=0;attempt<4;attempt++){
  if(review&&host!==(localStorage.getItem('iclusters_docker_host')||''))throw new Error('Docker host changed. Action cancelled.');
  try{return await api<T>(path,{...options,headers:{...Object.fromEntries(new Headers(options.headers).entries()),'X-IClusters-Docker-Host':host,...(grant?{'X-IClusters-SSH-Grant':grant}:{})}},confirmation)}catch(e:any){
   if(e.status===409&&e.body?.confirmationPhrase){const phrase=e.body.confirmationPhrase;if(e.body.sshTarget){grant=await new Promise<string>((resolve,reject)=>window.dispatchEvent(new CustomEvent('iclusters-ssh-approval',{detail:{target:e.body.sshTarget,title:review?.title,description:review?.description||e.body.approvalDescription,path,dockerHost:host,method:options.method||'POST',body:JSON.parse(String(options.body||'{}')),resolve,reject}})));confirmation=phrase;continue;}const entered=await new Promise<string>((resolve,reject)=>window.dispatchEvent(new CustomEvent('iclusters-action-confirmation',{detail:{phrase,path,title:review?.title,description:review?.description||e.body.approvalDescription,resolve,reject}})));if(entered!==phrase)throw new Error('Confirmation cancelled');confirmation=phrase;continue;}
   if(e.status===428&&e.body?.sshTarget){grant=await new Promise<string>((resolve,reject)=>window.dispatchEvent(new CustomEvent('iclusters-ssh-approval',{detail:{target:e.body.sshTarget,title:review?.title,description:review?.description||e.body.approvalDescription,path,dockerHost:host,method:options.method||'POST',body:JSON.parse(String(options.body||'{}')),resolve,reject}})));continue;}
   throw e;
  }
 }
 throw new Error('Action authentication could not be completed');
}
