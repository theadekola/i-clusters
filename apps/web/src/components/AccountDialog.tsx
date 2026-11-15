import {useState} from 'react';
import {Clock,CheckCircle,ShieldCheck,UserRound,Mail,Calendar,LockKeyhole} from 'lucide-react';
import {Badge,Modal,Tabs} from './UI';
import {useApi} from '../hooks';
import {confirmedApi} from '../api';
import {isActionCancelled} from '../action-cancellation';
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
 {error&&<p role="alert">{error}</p>}<button className="btn primary" disabled={!clusters.data||pending} onClick={save}>Save cluster access</button></fieldset>;
}
export function Avatar({user:u}:{user:any}){return <span className={`users-avatar role-${u.role}`} aria-hidden="true">{(u.name||u.email||'?').split(/\s+/).slice(0,2).map((s:string)=>s[0]).join('').toUpperCase()}<i className={u.status==='active'?'online':''}/></span>}
function Activity({user}:{user:any}){const live=useApi<any>('/audit',null,0),rows=(live.data?.logs||[]).filter((r:any)=>(r.user&&(r.user===user.email||r.user===user.username)));return <div className="users-activity"><h3>Account Activity</h3><p className="muted small">Actions performed by this account in the latest 500 audit records.</p>{live.error?<div role="alert">Unable to load activity: {live.error}<button className="btn secondary" onClick={()=>live.refresh()}>Retry activity</button></div>:live.loading?<p><ReportLoading/></p>:rows.length?<ul>{rows.slice(0,8).map((r:any)=><li key={r.id}><Clock size={14}/><div><strong>{r.action}</strong><small>{r.resource} · {date(r.time)}</small></div><Badge tone={r.status==='success'?'green':'gray'}>{r.status||'Recorded'}</Badge></li>)}</ul>:<p className="muted">No matching activity in the returned audit history.</p>}</div>}

type Props={selected:any;actor:any;self:boolean;onClose:()=>void;initialTab?:string;onSaved?:()=>Promise<void>;children?:React.ReactNode};
export function AccountDialog({selected,actor,self,onClose,initialTab='Profile',onSaved,children}:Props){
 const [tab,setTab]=useState(initialTab);
 const activity=['owner','admin','operator','auditor'].includes(actor?.role);
 return <Modal open title="View account" onClose={onClose}><div className="account-layout">
 <aside className="account-identity"><div className="account-cover"/><Avatar user={selected}/><h2>{selected.name||selected.username||selected.email}</h2>
 <Badge tone="purple">{roleNames[selected.role]||selected.role}</Badge>
 <dl><dt><UserRound size={16}/>Username</dt><dd>{selected.username||'Not reported'}</dd>
 {selected.email&&<><dt><Mail size={16}/>Email</dt><dd>{selected.email}</dd></>}
 {selected.createdAt&&<><dt><Calendar size={16}/>Created</dt><dd>{date(selected.createdAt)}</dd></>}
 <dt><Clock size={16}/>Last login</dt><dd>{date(selected.lastLogin)}</dd></dl>
 <button className="btn secondary" onClick={()=>setTab('Security')}><LockKeyhole size={16}/>Account Security</button></aside>
 <section className="account-panels"><Tabs items={['Profile','Security','Roles & Permissions',...(activity?['Activity']:[])]} active={tab} onChange={setTab}/>
 <div className="account-panel" onClick={event=>{
  const link=(event.target as Element).closest<HTMLAnchorElement>('a[href]');
  if(link && link.target!=='_blank' && link.origin===window.location.origin)onClose();
 }}>
 {tab==='Profile'&&<><h3>Personal Information</h3><dl className="users-facts"><dt>Full name</dt><dd>{selected.name}</dd><dt>Username</dt><dd>{selected.username||'Not reported'}</dd>{selected.email&&<><dt>Email</dt><dd>{selected.email}</dd></>}<dt>User ID</dt><dd>{selected.id}</dd><dt>Status</dt><dd><Badge tone={selected.status==='active'?'green':selected.status==='inactive'?'red':'gray'}>{selected.status||'Not reported'}</Badge></dd><dt>Role</dt><dd>{roleNames[selected.role]||selected.role}</dd><dt>Created</dt><dd>{date(selected.createdAt)}</dd><dt>Two-factor flag</dt><dd>{factor(selected)}</dd></dl><div className="users-detail-section"><h3>Roles</h3><button className="users-role-link" onClick={()=>setTab('Roles & Permissions')}><Badge tone="purple">{roleNames[selected.role]||selected.role}</Badge><span>View permissions →</span></button></div><div className="users-detail-section"><h3>Account Security</h3><p className="users-security-line"><ShieldCheck size={16}/> Two-factor flag <strong>{factor(selected)}</strong></p><p className="muted small">Owners and your own account are protected from deactivation.</p></div></>}
 {tab==='Roles & Permissions'&&<div className="users-detail-section"><h3>Permissions Summary</h3>{onSaved&&actor?.role==='owner'&&selected.role!=='owner'&&<ClusterAccess key={selected.id+JSON.stringify(selected.clusterRoles)} account={selected} onSaved={onSaved}/>}<p><Badge tone="purple">{roleNames[selected.role]||selected.role}</Badge></p>{[['View dashboards and inventory',10],['View audit logs',20],['Run infrastructure actions',30],['Manage lower-privilege users',40],['View notification diagnostics',50]].map(([label,rank]:any)=><div className="users-permission" key={label}><CheckCircle size={15} className={(ranks[selected.role]||0)>=rank?'positive':'muted'}/><span>{label}</span><small>{(ranks[selected.role]||0)>=rank?'Allowed':'Restricted'}</small></div>)}<p className="muted small">Role-level access summary. Individual actions may require additional confirmation.</p></div>}
 {tab==='Activity'&&<Activity key={selected.id} user={selected}/>}

 {tab==='Security'&&(self?<SecuritySettings user={actor} search=""/>:<section><h3>Account Security</h3><dl className="users-facts"><dt>Status</dt><dd>{selected.status}</dd><dt>Two-factor flag</dt><dd>{factor(selected)}</dd><dt>Last login</dt><dd>{date(selected.lastLogin)}</dd></dl></section>)}
 {children}</div></section></div></Modal>
}
export function MyAccountDialog({onClose,initialTab}:{onClose:()=>void;initialTab?:string}){
 const session=useApi<any>('/auth/me',null);
 const actor=session.data?.user;
 if(!actor)return <Modal open title="View account" onClose={onClose}>{session.error?<p role="alert">{session.error}<button onClick={session.refresh}>Retry</button></p>:<ReportLoading/>}</Modal>;
 return <AccountDialog selected={{...actor,id:actor.sub||actor.id}} actor={actor} self onClose={onClose} initialTab={initialTab}/>;
}
