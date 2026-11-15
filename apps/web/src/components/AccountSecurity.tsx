import {useState,useEffect,useRef,type ReactNode} from 'react';
import {ChevronRight,Clock,Code2,KeyRound,LockKeyhole,Monitor,ShieldCheck} from 'lucide-react';
import {api,clearTokens,setTokens} from '../api';
import {useApi} from '../hooks';
import SessionPreferences from './SessionPreferences';
import {confirmChoice} from '../confirm-choice';
import './account-security.css';

export type SecurityPanel='password'|'mfa'|'sessions'|'tokens'|'remember'|'device'|null;
type Action=NonNullable<SecurityPanel>;
function Switch({label,checked,disabled,onClick}:{label:string;checked:boolean;disabled:boolean;onClick:()=>void}){
 return <button type="button" role="switch" className="security-switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={onClick}><span/></button>
}
function Row({icon:Icon,title,description,control,children}:{icon:typeof Monitor;title:string;description:string;control:ReactNode;children?:ReactNode}){
 return <section className="security-row"><div className="security-row-main"><span className="security-glyph"><Icon aria-hidden="true"/></span><div><h4>{title}</h4><p>{description}</p></div><div className="security-control">{control}</div></div>{children}</section>
}
function Manage({label,open,onClick}:{label:string;open:boolean;onClick:()=>void}){
 return <button type="button" className="btn secondary security-manage" aria-expanded={open} onClick={onClick}>{label}<ChevronRight size={15}/></button>
}

export default function AccountSecurity({panel,onPanel}:{panel?:SecurityPanel;onPanel?:(p:SecurityPanel)=>void}={}){
 const status=useApi<any>('/account/security',null);
 const [local,setLocal]=useState<SecurityPanel>(null),[expanded,setExpanded]=useState(true),[locked,setLocked]=useState(false);
 const active=panel===undefined?local:panel,choose=onPanel||setLocal;
 const data=status.data,unknown=!data||!!status.error;
 const toggle=(p:Action)=>{if(!locked)choose(active===p?null:p)};
 const form=(p:Action)=>active===p?<SecurityAction key={p} action={p} data={data} refresh={status.refresh} close={()=>choose(null)} lock={setLocked}/>:null;
 const button=(p:Action,label:string)=><Manage label={label} open={active===p} onClick={()=>toggle(p)}/>;
 return <section className="security-workspace" aria-label="Account security controls">
 <header className="security-hero"><span><ShieldCheck size={34}/></span><div><h3>Account Security</h3><p>Manage authentication, devices and access to your account.</p></div>{!unknown&&<strong className={data.mfaEnabled?"security-state enabled":"security-state"}>{data.mfaEnabled&&<ShieldCheck size={15}/>} {data.mfaEnabled?'MFA enabled':'MFA disabled'}</strong>}</header>
 {status.error&&<p role="alert">{status.error} <button type="button" className="btn secondary" onClick={()=>status.refresh()}>Retry</button></p>}
 <Row icon={KeyRound} title="Change password" description="Set a new password for this account." control={button('password','Change password')}>{form('password')}</Row>
 <Row icon={ShieldCheck} title="Two-factor authentication (2FA)" description="Verify sign-ins with your authenticator or a recovery code." control={<><small>{unknown?'Not reported':data.mfaEnabled?'Enabled':'Disabled'}</small><Switch label="Two-factor authentication (2FA)" checked={!!data?.mfaEnabled} disabled={unknown||locked} onClick={()=>toggle('mfa')}/></>}>{form('mfa')}</Row>
 <Row icon={Monitor} title="Login Sessions" description="Review signed-in devices and revoke access." control={button('sessions','Manage Sessions')}>{form('sessions')}</Row>
 <Row icon={Code2} title="API Access Tokens" description="Manage read-only tokens for inventory and monitoring." control={button('tokens','Manage Tokens')}>{form('tokens')}</Row>
 <Row icon={LockKeyhole} title="Session & Access Controls" description="Manage automatic sign-out and device verification." control={<button type="button" className="icon-btn security-expand" aria-label="Session & Access Controls" aria-expanded={expanded} disabled={locked} onClick={()=>{setExpanded(!expanded);if(active==='device'||active==='remember')choose(null)}}><ChevronRight/></button>}>
 {expanded&&<div className="security-policies"><div className="security-policy"><Clock/><SessionPreferences/></div>
 <div className="security-policy"><Monitor/><div><b>Remember this device</b><p>Keep this browser signed in for up to 10 days.</p></div><Switch label="Remember this device" checked={!!data?.remember} disabled={unknown||locked} onClick={()=>toggle('remember')}/></div>{form('remember')}
 <div className="security-policy"><ShieldCheck/><div><b>Require 2FA for new devices</b><p>{!data?.mfaEnabled?'Enable MFA first.':'When on, verified remembered browsers can skip the code for 10 days. When off, every sign-in requires a code.'}</p></div><Switch label="Require 2FA for new devices" checked={!!data?.newDeviceMfa} disabled={unknown||!data?.mfaEnabled||locked} onClick={()=>toggle('device')}/></div>{form('device')}
 </div>}</Row>
 </section>
}

function SecurityAction({action,data,refresh,close,lock}:{action:Action;data:any;refresh:()=>Promise<void>;close:()=>void;lock:(locked:boolean)=>void}){
 const [password,setPassword]=useState(''),[code,setCode]=useState(''),[next,setNext]=useState(''),[name,setName]=useState(''),[days,setDays]=useState(30);
 const [setup,setSetup]=useState(''),[codes,setCodes]=useState<string[]>([]),[secret,setSecret]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [desired]=useState(()=>action==='remember'?!data?.remember:!data?.newDeviceMfa);
 const editor=useRef<HTMLDivElement>(null);
 useEffect(()=>{editor.current?.focus({preventScroll:true});editor.current?.scrollIntoView?.({block:'nearest'})},[]);
 const ready=!!data&&!!password&&(!data.mfaEnabled||!!code)&&!busy;
 async function run(path:string,extra:Record<string,unknown>={}){
  if(busy)return false;setBusy(true);lock(true);setError('');setMessage('');
  try{
   const r=await api('/account/'+path,{method:'POST',body:JSON.stringify({password,code,...extra})});
   if(r.accessToken)setTokens(r.accessToken,r.refreshToken,path==='remember'?desired:undefined,r.rememberUntil,r.cookieSession===true);
   if(r.signInRequired){clearTokens();window.location.assign('/');return true}
   if(path==='mfa/setup'){setSetup(r.secret);setCode('');return true}
   if(r.recoveryCodes){setCodes(r.recoveryCodes);setSetup('')}
   if(path==='tokens')setSecret(r.secret);
   setPassword('');setCode('');setNext('');setMessage('Saved successfully.');await refresh();
   if(action==='remember'||action==='device')close();
   return true;
  }catch(e:any){setError(e.message);return false}finally{setBusy(false);lock(false)}
 }
 return <div className="security-editor" ref={editor} tabIndex={-1}>
 {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 {codes.length?<><h4>Save your recovery codes</h4><pre>{codes.join('\n')}</pre><button type="button" className="btn primary" onClick={close}>I saved my recovery codes</button></>:secret?<><h4>Copy your API token</h4><p>The token is shown once. Use it as a Bearer credential for GET /api/proxmox or GET /api/monitoring.</p><code>{secret}</code><button type="button" className="btn secondary" onClick={()=>{setSecret('');setName('')}}>Done</button></>:<>
 <label>Current password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
 {(data?.mfaEnabled||setup)&&<label>Authenticator or recovery code<input autoComplete="one-time-code" value={code} maxLength={40} onChange={e=>setCode(e.target.value)}/></label>}
 {action==='password'&&<><label>New password<input type="password" autoComplete="new-password" minLength={12} maxLength={72} value={next} onChange={e=>setNext(e.target.value)}/></label><p>Use at least 12 characters. Changing it signs out every device.</p><button type="button" className="btn primary" disabled={!ready||next.length<12} onClick={()=>run('password',{newPassword:next})}>Change Password & Sign Out</button></>}
 {action==='mfa'&&(setup?<><p>Enter this setup key in your authenticator, then verify its six-digit code.</p><code>{setup}</code><button type="button" className="btn primary" disabled={!password||!code||busy} onClick={()=>run('mfa/enable')}>Verify & Enable MFA</button></>:data?.mfaEnabled?<><button type="button" className="btn danger" disabled={!ready} onClick={async()=>await confirmChoice('Disable MFA for your account and sign out all sessions?')&&run('mfa/disable')}>Disable MFA</button><button type="button" className="btn secondary" disabled={!ready} onClick={async()=>await confirmChoice('Replace all recovery codes and sign out other devices?')&&run('mfa/recovery')}>Generate New Recovery Codes</button></>:<button type="button" className="btn primary" disabled={!ready} onClick={()=>run('mfa/setup')}>Enable MFA</button>)}
 {action==='sessions'&&<SessionList ready={ready} run={run}/>}
 {action==='tokens'&&<><label>Token name<input maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><label>Expires in<select value={days} onChange={e=>setDays(Number(e.target.value))}>{[7,30,90].map(d=><option key={d} value={d}>{d} days</option>)}</select></label><button type="button" className="btn primary" disabled={!ready||!name.trim()} onClick={()=>run('tokens',{name:name.trim(),days})}>Create token</button><TokenList ready={ready} run={run}/></>}
 {(action==='remember'||action==='device')&&<button type="button" className="btn primary" disabled={!ready} onClick={()=>run(action==='remember'?'remember':'device-policy',{enabled:desired})}>{desired?'Enable':'Disable'}</button>}
 <button type="button" className="btn secondary" disabled={busy} onClick={close}>Cancel</button>
 </>}
 </div>
}
type ListProps={ready:boolean;run:(path:string,body:Record<string,unknown>)=>Promise<boolean>};
function SessionList({ready,run}:ListProps){
 const live=useApi<any>('/account/sessions',null);
 return <div>{live.error&&<p role="alert">{live.error} <button type="button" onClick={()=>live.refresh()}>Retry</button></p>}{live.data?.sessions?.map((s:any)=><div className="security-record" key={s.id}><div><b>{s.current?'This device':s.device}</b><small>{new Date(s.created_at).toLocaleString()}</small></div><button type="button" className="btn secondary" disabled={!ready} onClick={async()=>{if(await run('sessions/revoke',{id:s.id}))await live.refresh()}}>Sign out</button></div>)}<button type="button" className="btn danger" disabled={!ready} onClick={async()=>await confirmChoice('Sign out every device, including this one?')&&run('sessions/revoke',{all:true})}>Sign Out All Devices</button></div>
}
function TokenList({ready,run}:ListProps){
 const live=useApi<any>('/account/tokens',null);
 return <div>{live.error?<p role="alert">{live.error} <button type="button" onClick={()=>live.refresh()}>Retry</button></p>:live.data?.tokens?.length===0?<p>No active tokens.</p>:live.data?.tokens?.map((t:any)=><div className="security-record" key={t.id}><div><b>{t.name}</b><small>{new Date(t.expires_at).toLocaleDateString()}</small></div><button type="button" className="btn secondary" disabled={!ready} onClick={async()=>{if(await run('tokens/revoke',{id:t.id}))await live.refresh()}}>Revoke</button></div>)}</div>
}
