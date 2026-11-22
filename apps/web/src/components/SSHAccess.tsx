import ReportLoading from './ReportLoading';
import ContainerSSHApproval from './ContainerSSHApproval';
import PasswordInput from './PasswordInput';
import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {api} from '../api';
import {Modal,ConnectionSuccess} from './UI';
import {Eye,EyeOff,Maximize,Copy,ClipboardPaste,TextSelect,Terminal as TerminalIcon} from 'lucide-react';
export function SSHApproval(){
 const [request,setRequest]=useState<any>(null),complete=useRef<(token?:string,serial?:number)=>void>(()=>{});
 useEffect(()=>{
  let stopped=false,serial=0,active:any=null;const pending:any[]=[];
  const next=async()=>{if(stopped||active||!pending.length)return;active=pending.shift();const current=active;current.serial=++serial;setRequest({...current,loading:true});const controller=new AbortController();current.cancel=()=>controller.abort();const timeout=window.setTimeout(()=>controller.abort(),8000);let connection;try{connection=(await api('/ssh/connections',{signal:controller.signal}))[current.target]}catch{}finally{window.clearTimeout(timeout)}if(stopped||active!==current)return;setRequest({...current,connection,loading:false});};
  complete.current=(token,serial)=>{const current=active;if(!current||(serial!==undefined&&current.serial!==serial))return;current.cancel?.();active=null;setRequest(null);token?current.resolve(token):current.reject(new Error('Authentication cancelled'));void next();};
  const receive=(e:any)=>{pending.push(e.detail);void next();};window.addEventListener('iclusters-ssh-approval',receive);
  return()=>{stopped=true;window.removeEventListener('iclusters-ssh-approval',receive);active?.cancel?.();active?.reject(new Error('Authentication cancelled'));for(const item of pending)item.reject(new Error('Authentication cancelled'));};
 },[]);
 return <Modal open={!!request} title={request?.title||`Authenticate ${request?.target||''}`}  onClose={()=>complete.current(undefined,request?.serial)}>{request?.loading?<p role="status"><ReportLoading inline/>Loading SSH connection details…</p>:request&&(/^\/(?:docker(?:\/|$)|actions\/docker\/)/.test(request.path)?<ContainerSSHApproval key={request.serial} request={request} connection={request.connection} onApproved={token=>complete.current(token,request.serial)} onCancel={()=>complete.current(undefined,request.serial)}/>:<SSHLogin key={request.serial} target={request.target} action={request} connection={request.connection} onConnected={r=>complete.current(r.token,request.serial)}/>)}</Modal>;
}
export function SSHLogin({target,host='',action,connection,editing=false,mode='shell',openImmediately=false,requirePassword=false,onOpenConsole,onConnected}:{target:string;host?:string;action?:any;connection?:any;editing?:boolean;openImmediately?:boolean;requirePassword?:boolean;mode?:'shell'|'sftp';onOpenConsole?:()=>void;onConnected:(r:any)=>void}){
 useEffect(()=>{try{for(const key of Object.keys(localStorage))if(key.startsWith('iclusters-ssh-'))localStorage.removeItem(key);}catch{}},[]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[fingerprint,setFingerprint]=useState(''),[showPassword,setShowPassword]=useState(false),[connected,setConnected]=useState<any>(null);const pendingConnection=useRef<any>(null),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;const pending=pendingConnection.current;if(pending?.id)void api('/ssh/session/'+encodeURIComponent(pending.id),{method:'DELETE'}).catch(()=>{})}},[]);
 const [authMethod,setAuthMethod]=useState('password');
 const allowKey=!action&&!editing&&mode==='shell',useKey=allowKey&&authMethod==='key';
 const secure=window.location.protocol==='https:';
 const saved=connection||{};
 const [saveConnection,setSaveConnection]=useState(!!saved.host),[forgotten,setForgotten]=useState(false);
 const [address,setAddress]=useState(saved.host||host),[port,setPort]=useState(String(saved.port||22)),[checking,setChecking]=useState(false),[retry,setRetry]=useState(0);
 const [username,setUsername]=useState(saved.username||'root');
 const canReusePassword=!useKey&&!action&&!forgotten&&!requirePassword&&saved.hasPassword&&saved.host===address
  &&saved.port===Number(port)&&saved.username===username&&(editing||mode==='shell');
 // Power approval probes resolve the node from the action on the server.
 const probeHost=action?'':address;
 useEffect(()=>{let cancelled=false;setFingerprint('');setError('');if(!probeHost&&!action)return;setChecking(true);const timer=setTimeout(()=>{api('/ssh/fingerprint',{method:'POST',body:JSON.stringify({host:probeHost,target,port,mode,action:!!action,...(action?{path:action.path,method:action.method,body:action.body,dockerHost:action.dockerHost}:{})})}).then(r=>{if(!cancelled){setFingerprint(r.fingerprint);if(action&&r.host)setAddress(r.host)}}).catch(e=>{if(!cancelled)setError(e.message)}).finally(()=>{if(!cancelled)setChecking(false)})},250);return()=>{cancelled=true;clearTimeout(timer)}},[probeHost,port,target,retry,mode,action]);
 const guestAction=action?.path?.match(/^\/actions\/proxmox\/(vm|lxc)\/(\d+)\/([^/]+)$/),actionLabel=guestAction?`Confirm ${guestAction[3]} for ${guestAction[1]==='vm'?'VM':'CT'} ${guestAction[2]}`:action?`Confirm ${action.path.split('/').at(-1)} on ${target}`:'';
 if(connected)return <ConnectionSuccess message={action?'SSH authentication successful.':editing?'Connection settings saved successfully.':'SSH connection successful.'} onDone={()=>{pendingConnection.current=null;onConnected(connected)}}/>;
 const submit=async (e:React.FormEvent<HTMLFormElement>)=>{
  e.preventDefault();
  if(busy||checking||!fingerprint||(useKey&&!secure))return;
  const form=e.currentTarget;
  const {keyFile,keyPassphrase,...body}=Object.fromEntries(new FormData(form));
  const useSavedPassword=!!canReusePassword&&!body.password&&body.username===saved.username;
  if(!useKey&&!body.password&&!useSavedPassword)return;
  setBusy(true);setError('');
  try{
   let keyFields;
   if(useKey){
    if(!(keyFile instanceof File)||!keyFile.size||keyFile.size>65536)
     throw new Error('Choose an SSH private key file up to 64 KiB.');
    keyFields={privateKey:await keyFile.text(),keyPassphrase:String(keyPassphrase||'')||undefined};
    if(!mounted.current)return;
   }
   const r=await api('/ssh/connect',{method:'POST',cache:'no-store',body:JSON.stringify({
    ...body,...keyFields,target,fingerprint,...(!useKey?{save:!!body.save,useSavedPassword}:{}),mode:action?'authorize':mode,
    ...(action?{path:action.path,method:action.method,body:action.body,dockerHost:action.dockerHost}:{})
   })});
   if(!mounted.current){if(r.id)void api('/ssh/session/'+encodeURIComponent(r.id),{method:'DELETE'}).catch(()=>{});return;}
   if(openImmediately){onConnected(r);return;}
   pendingConnection.current=r;setConnected(r);
  }catch(e:any){
   if(e.body?.fingerprint)setFingerprint(e.body.fingerprint);
   setError(e.message);
  }finally{setBusy(false);}
 };
 return <form aria-label="SSH" className="ssh-connection-form" onSubmit={submit}><>{action&&<div className="permission-help">{action.description&&<p>{action.description}</p>}<b>{actionLabel}</b><p>This action can interrupt services.</p></div>}</><small className="muted ssh-target-label">SSH target: {target}</small><p className="muted">{guestAction?'Use the Proxmox node’s Linux root or sudo account.':action?'Use a Linux root or sudo account on the displayed host.':'Use a Linux account with SSH access on the displayed host.'}</p>{action&&target.startsWith('node:')&&<details className="ssh-account-guidance dialog-details"><summary>SSH account help</summary><p>Use a Linux account on this Proxmox node, for example root. Your i-Clusters login or a Proxmox @pve account is not automatically an SSH account. For root@pam, the SSH username is root.</p></details>}<div className="ssh-dialog-row ssh-address-row"><label>Host / IP Address<input name="host" value={address} readOnly={!!action} onChange={e=>setAddress(e.target.value)} required/></label><label>Port<input name="port" value={port} onChange={e=>setPort(e.target.value)} type="number" min="1" max="65535" required/></label></div>{allowKey&&<label className="ssh-auth-method">Authentication method
   <select value={authMethod} disabled={busy} onChange={event=>{setAuthMethod(event.target.value);setError('')}}>
    <option value="password">Password</option><option value="key">SSH key</option>
   </select>
  </label>}
  <div className="ssh-dialog-row ssh-credentials-row">
   <label>Username<input name="username" value={username} onChange={e=>setUsername(e.target.value)} required autoComplete="username"/></label>
   {useKey?<label>Private key file<input name="keyFile" type="file" required disabled={!secure||busy}/></label>:
    <label>Password<div className="ssh-password">
     <input name="password" type={showPassword?'text':'password'} required={!canReusePassword} placeholder={canReusePassword?'Saved password unchanged':''} autoComplete="off"/>
     <button type="button" className="icon-btn" aria-label={showPassword?'Hide password':'Show password'} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button>
    </div></label>}
  </div>
  {useKey?<><label>Key passphrase (optional)<PasswordInput name="keyPassphrase" autoComplete="off" disabled={!secure||busy}/></label>
   <p className="muted">{secure?'Use the private key that matches a public key authorized on this host. The controller uses it for this connection only.':'Open i-Clusters over HTTPS to use an SSH private key.'}</p></>:
   !action&&<label className="ssh-save"><input name="save" type="checkbox" checked={saveConnection} onChange={e=>setSaveConnection(e.target.checked)}/> Save password</label>}
  {!useKey&&!action&&!forgotten&&connection?.expiresAt&&<p className="muted">Saved password expires {new Date(connection.expiresAt).toLocaleString()}.</p>}{!useKey&&!action&&!forgotten&&connection?.hasPassword&&<button type="button" className="btn secondary" aria-busy={busy} disabled={busy} onClick={async()=>{setBusy(true);try{await api('/ssh/connections',{method:'DELETE',body:JSON.stringify({target,mode})});setSaveConnection(false);setForgotten(true);window.dispatchEvent(new Event('iclusters-settings'))}catch(e:any){setError(e.message)}finally{setBusy(false)}}}>Forget saved connection</button>}{<p className="cluster-wide muted ssh-host-status" role="status">{checking?'Checking SSH host identity automatically…':!fingerprint?'SSH host verification is required before continuing.':'SSH host key checked automatically.'}{!fingerprint&&!checking&&<button type="button" className="btn secondary small" disabled={busy} onClick={()=>setRetry(v=>v+1)}>Retry SSH verification</button>}</p>}{error&&<p className="error" role="alert" aria-live="assertive">{error}</p>}<div className="ssh-dialog-footer">{onOpenConsole&&<button type="button" className="btn secondary" disabled={busy} onClick={onOpenConsole}>Open Proxmox Console</button>}<button type="submit" className="btn primary" aria-busy={!!(busy||checking)} disabled={busy||checking||!fingerprint||(useKey&&!secure)}>{busy?'Authenticating...':action?'Confirm':editing?'Save changes':'Connect'}</button></div></form>;
}

const TerminalView=lazy(()=>import('./SSHTerminal'));
export default function SSHTerminal(props:import('react').ComponentProps<typeof TerminalView>){return <Suspense fallback={null}><TerminalView {...props}/></Suspense>}
