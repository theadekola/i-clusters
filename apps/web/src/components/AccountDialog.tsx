import {useState,useEffect,useRef} from 'react';
import {Clock,CheckCircle,ShieldCheck,UserRound,Mail,Calendar,LockKeyhole,Layers,SlidersHorizontal,Bell,Activity as Pulse,KeyRound,ChevronRight} from 'lucide-react';
import {Badge,Modal,tabKeys} from './UI';
import {useApi} from '../hooks';
import {confirmedApi} from '../api';
import {isActionCancelled} from '../action-cancellation';
import {ProfileForm,ProfilePreferences,ProfileNotifications,ProfileActivity} from './ProfilePanels';
import ReportLoading from './ReportLoading';
import SecuritySettings from './SecuritySettings';
import '../pages/settings-overview.css';
import './account-dialog.css';
export const roleNames:any={owner:'Owner',admin:'Administrator',operator:'Operator',auditor:'Auditor',viewer:'Viewer'};
export const ranks:any={viewer:10,auditor:20,operator:30,admin:40,owner:50};
export const date=(v:any)=>{if(!v)return 'Not reported';const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString([], {dateStyle:'medium',timeStyle:'short'}):'Not reported'};
export const factor=(u:any)=>u.twoFactor===true?'Enabled':u.twoFactor===false?'Disabled':'Not reported';
function ClusterAccess({account,onSaved}:{account:any;onSaved:()=>Promise<void>}){
 const clusters=useApi<any>('/cluster-profiles',null);
 const [roles,setRoles]=useState<Record<string,string>|null>(account.clusterRoles??null),[pending,setPending]=useState(false),[error,setError]=useState('');
 const save=async()=>{setPending(true);setError('');try{await confirmedApi('/users/'+encodeURIComponent(account.id)+'/cluster-access',{method:'PUT',body:JSON.stringify({roles})});await onSaved()}catch(e:any){if(!isActionCancelled(e))setError(e.message)}finally{setPending(false)}};
 return <fieldset disabled={pending}><legend>Cluster access</legend><label><input type="checkbox" checked={roles!==null} onChange={e=>setRoles(e.target.checked?{}:null)}/>Assign individual clusters</label>
 {roles===null?<p>Account role applies across the installation.</p>:clusters.data?.clusters.map((c:any)=><label key={c.id}>{c.name}<select value={roles[c.id]||''} onChange={e=>{const next={...roles};if(e.target.value)next[c.id]=e.target.value;else delete next[c.id];setRoles(next)}}><option value="">No access</option>{['viewer','auditor','operator','admin'].filter(r=>ranks[r]<=ranks[account.role]).map(r=><option key={r} value={r}>{roleNames[r]}</option>)}</select></label>)}
 {error&&<p role="alert">{error}</p>}<button type="button" className="btn secondary" disabled={pending} onClick={()=>setRoles(account.clusterRoles??null)}>Discard</button> <button className="btn primary" disabled={!clusters.data||pending} onClick={save}>Save cluster access</button></fieldset>;
}
export function Avatar({user:u}:{user:any}){return <span className={`users-avatar role-${u.role}`} aria-hidden="true">{(u.name||u.email||'?').split(/\s+/).slice(0,2).map((s:string)=>s[0]).join('').toUpperCase()}<i className={u.status==='active'?'online':''}/></span>}
type Props={selected:any;actor:any;self:boolean;onClose:()=>void;initialTab?:string;onSaved?:()=>Promise<void>;children?:React.ReactNode};
export function AccountDialog({selected:account,actor,self,onClose,initialTab='Profile',onSaved,children}:Props){
 const [tab,setTab]=useState(initialTab);
 const [patch,setPatch]=useState<any>(null);
 const contact=patch?.profile?.contactEmail??account.profile?.contactEmail??(account.email?.includes('@')?account.email:'');
 const selected=patch?{...account,...patch}:account;
 const [target,setTarget]=useState('');
 const panel=useRef<HTMLElement>(null);
 useEffect(()=>{
  if(!target||tab!=='Security'||!panel.current)return;
  const focus=()=>{const field=panel.current?.querySelector<HTMLElement>(target);if(!field)return false;field.scrollIntoView?.({block:'center'});field.focus();setTarget('');return true};
  if(focus())return;
  const watch=new MutationObserver(focus);watch.observe(panel.current,{subtree:true,childList:true});return()=>watch.disconnect();
 },[tab,target]);
 const select=(name:string)=>{setTarget('');setTab(name)};
 const jump=(selector:string)=>{setTab('Security');setTarget(selector)};
 const activity=['owner','admin','operator','auditor'].includes(actor?.role);
 const tabs=[['Profile',UserRound],['Security',ShieldCheck],...(self?[['Preferences',SlidersHorizontal]]:[]),['Roles & Permissions',Layers],...(self?[['Notifications',Bell]]:[]),...(activity?[['Activity',Pulse]]:[])];
 return <Modal open title="View account" onClose={onClose}><div className="account-layout">
 <aside className="account-identity"><div className="account-cover"/><Avatar user={selected}/><h2>{selected.name||selected.username||selected.email}</h2>
 <Badge tone="purple">{roleNames[selected.role]||selected.role}</Badge>
 <dl><dt><UserRound size={16}/>Username</dt><dd>{selected.username||'Not reported'}</dd>
 {contact&&<><dt><Mail size={16}/>Contact email</dt><dd>{contact}</dd></>}
 {selected.createdAt&&<><dt><Calendar size={16}/>Created</dt><dd>{date(selected.createdAt)}</dd></>}
 <dt><Clock size={16}/>Last login</dt><dd>{date(selected.lastLogin)}</dd></dl>
 <div className="account-quick"><h3>Quick Actions</h3>{self&&<><button onClick={()=>jump('input[autocomplete="new-password"]')}><KeyRound/>Change password<ChevronRight/></button><button onClick={()=>jump('input[autocomplete="current-password"]')}><ShieldCheck/>Multi-factor authentication<ChevronRight/></button></>}<button onClick={()=>select(self?'Preferences':'Security')}><SlidersHorizontal/>{self?'Preferences':'Account Security'}<ChevronRight/></button></div></aside>
 <section className="account-panels" ref={panel}><div className="tabs profile-tabs" role="tablist" aria-label="View account" onKeyDown={tabKeys}>{tabs.map(([name,Icon]:any)=><button key={name} type="button" role="tab" aria-selected={tab===name} tabIndex={tab===name?0:-1} className={tab===name?'tab active':'tab'} onClick={()=>select(name)}><Icon size={17}/>{name}</button>)}</div>
 <div className="account-panel" onClick={event=>{
  const link=(event.target as Element).closest<HTMLAnchorElement>('a[href]');
  if(link && link.target!=='_blank' && link.origin===window.location.origin)onClose();
 }}>
 {tab==='Profile'&&<><ProfileForm user={selected} self={self} onSaved={result=>{setPatch(result);void onSaved?.()}}/><section className="profile-section"><h3><Layers/>Account Overview</h3><div className="profile-stats"><div><UserRound/><strong>{roleNames[selected.role]}</strong><small>Role</small></div><div><ShieldCheck/><strong>{factor(selected)}</strong><small>Multi-factor authentication</small></div><div><Clock/><strong>{selected.status||'Not reported'}</strong><small>Status</small></div></div><dl className="users-facts"><dt>User ID</dt><dd>{selected.id}</dd><dt>Created</dt><dd>{date(selected.createdAt)}</dd></dl><button className="btn secondary" onClick={()=>select('Roles & Permissions')}>View permissions →</button></section></>}
 {tab==='Preferences'&&self&&<ProfilePreferences/>}
 {tab==='Notifications'&&self&&<ProfileNotifications/>}
 {tab==='Roles & Permissions'&&<div className="profile-section"><h3><Layers/>Permissions Summary</h3><div className="profile-role"><ShieldCheck/><div><small>Assigned Role</small><strong>{roleNames[selected.role]}</strong></div></div>{onSaved&&actor?.role==='owner'&&selected.role!=='owner'&&<ClusterAccess key={selected.id+JSON.stringify(selected.clusterRoles)} account={selected} onSaved={onSaved}/>}<h4>Role scope</h4>{selected.clusterRoles==null?<p>Account role applies across the installation.</p>:<dl className="users-facts">{Object.entries(selected.clusterRoles).map(([id,role])=><div key={id}><dt>{id}</dt><dd>{roleNames[String(role)]}</dd></div>)}{!Object.keys(selected.clusterRoles).length&&<dt>No access</dt>}</dl>}<h4>Permission groups</h4>{[['View dashboards and inventory',10],['View audit logs',20],['Run infrastructure actions',30],['Manage lower-privilege users',40],['View notification diagnostics',50]].map(([label,rank]:any)=><div className="users-permission" key={label}><CheckCircle size={15} className={(ranks[selected.role]||0)>=rank?'positive':'muted'}/><span>{label}</span><small>{(ranks[selected.role]||0)>=rank?'Allowed':'Restricted'}</small></div>)}<p className="muted small">Role-level access summary. Individual actions may require additional confirmation.</p></div>}
 {tab==='Activity'&&<ProfileActivity key={selected.id} user={selected} self={self} date={date}/>}

 {tab==='Security'&&(self?<><div className="profile-banner"><ShieldCheck/><h3>Account Security</h3></div><SecuritySettings user={actor} search=""/></>:<section><h3>Account Security</h3><dl className="users-facts"><dt>Status</dt><dd>{selected.status}</dd><dt>Two-factor flag</dt><dd>{factor(selected)}</dd><dt>Last login</dt><dd>{date(selected.lastLogin)}</dd></dl></section>)}
 {children}</div></section></div></Modal>
}
export function MyAccountDialog({onClose,initialTab}:{onClose:()=>void;initialTab?:string}){
 const session=useApi<any>('/auth/me',null);
 const actor=session.data?.user;
 if(!actor)return <Modal open title="View account" onClose={onClose}>{session.error?<p role="alert">{session.error}<button onClick={session.refresh}>Retry</button></p>:<ReportLoading/>}</Modal>;
 return <AccountDialog selected={{...actor,id:actor.sub||actor.id}} actor={actor} self onClose={onClose} initialTab={initialTab}/>;
}
