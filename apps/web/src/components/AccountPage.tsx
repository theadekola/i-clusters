import AccountPermissions from './AccountPermissions';
import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {Clock,ShieldCheck,UserRound,Mail,Calendar,Layers,SlidersHorizontal,Activity as Pulse,KeyRound,ChevronRight} from 'lucide-react';
import {Badge,tabKeys} from './UI';
import {useApi,useResourceRefresh} from '../hooks';
import {confirmedApi} from '../api';
import {isActionCancelled} from '../action-cancellation';
import {AccountOverview,ProfileForm,SavedPicture} from './ProfilePanels';
import ReportLoading from './ReportLoading';
import RefreshButton from './RefreshButton';
import AccountSecurity, {type SecurityPanel} from './AccountSecurity';
import '../pages/settings-overview.css';
import './account-page.css';
import {Link,useSearchParams} from 'react-router-dom';
import './profile-activity.css';
const AccountActivity=lazy(()=>import('./AccountActivity'));
export const roleNames:any={owner:'Owner',admin:'Administrator',operator:'Operator',auditor:'Auditor',viewer:'Viewer'};
export const ranks:any={viewer:10,auditor:20,operator:30,admin:40,owner:50};
export const date=(v:any,timeZone?:string)=>{if(!v)return 'Not reported';const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString([], {dateStyle:'medium',timeStyle:'short',timeZone}):'Not reported'};
export const factor=(u:any)=>u.twoFactor===true?'Enabled':u.twoFactor===false?'Disabled':'Not reported';
function ClusterAccess({account,onSaved}:{account:any;onSaved:()=>Promise<void>}){
 const clusters=useApi<any>('/cluster-profiles',null);
 const [roles,setRoles]=useState<Record<string,string>|null>(account.clusterRoles??null),[pending,setPending]=useState(false),[error,setError]=useState('');
 const save=async()=>{setPending(true);setError('');try{await confirmedApi('/users/'+encodeURIComponent(account.id)+'/cluster-access',{method:'PUT',body:JSON.stringify({roles})});await onSaved()}catch(e:any){if(!isActionCancelled(e))setError(e.message)}finally{setPending(false)}};
 return <fieldset disabled={pending}><legend>Cluster access</legend><label><input type="checkbox" checked={roles!==null} onChange={e=>setRoles(e.target.checked?{}:null)}/>Assign individual clusters</label>
 {roles===null?<p>Account role applies across the installation.</p>:clusters.data?.clusters.map((c:any)=><label key={c.id}>{c.name}<select value={roles[c.id]||''} onChange={e=>{const next={...roles};if(e.target.value)next[c.id]=e.target.value;else delete next[c.id];setRoles(next)}}><option value="">No access</option>{['viewer','auditor','operator','admin'].filter(r=>ranks[r]<=ranks[account.role]).map(r=><option key={r} value={r}>{roleNames[r]}</option>)}</select></label>)}
 {error&&<p role="alert">{error}</p>}<button type="button" className="btn secondary" disabled={pending} onClick={()=>setRoles(account.clusterRoles??null)}>Discard</button> <button className="btn primary" disabled={!clusters.data||pending} onClick={save}>Save cluster access</button></fieldset>;
}
export function Avatar({user:u}:{user:any}){return <span className={`users-avatar role-${u.role}`} aria-hidden="true">{(u.name||u.email||'?').split(/\s+/).slice(0,2).map((s:string)=>s[0]).join('').toUpperCase()}{u.profile?.pictureVersion&&<SavedPicture id={u.id||u.sub} version={u.profile.pictureVersion}/>}<i className={u.status==='active'?'online':''}/></span>}
type Props={selected:any;actor:any;self:boolean;managed?:boolean;onSaved?:()=>Promise<void>;children?:React.ReactNode};
export function AccountPage({selected:account,actor,self,managed=false,onSaved,children}:Props){
 const [params,setParams]=useSearchParams();
 const heading=useRef<HTMLHeadingElement>(null);
 const reports=useResourceRefresh(['/auth/me','/users','/account','/audit','/proxmox','/cluster-profiles']);
 useEffect(()=>{heading.current?.focus({preventScroll:true});if(heading.current && heading.current.getBoundingClientRect().top<0)heading.current.scrollIntoView?.({block:'start'})},[account.id]);
 const [patch,setPatch]=useState<any>(null);
 const contact=patch?.profile?.contactEmail??account.profile?.contactEmail??(account.email?.includes('@')?account.email:'');
 const accountDate=(v:any)=>date(v,(self?patch?.profile?.timeZone:undefined)||actor?.profile?.timeZone);
 const selected=patch?{...account,...patch}:account;
 const [securityPanel,setSecurityPanel]=useState<SecurityPanel>(null);
 const select=(name:string)=>{
  const next=new URLSearchParams(params);
  if(name==='Profile')next.delete('section');else next.set('section',name);
  setParams(next,{replace:true,preventScrollReset:true});setSecurityPanel(null);
 };
 const jump=(action:SecurityPanel)=>{select('Security');setSecurityPanel(action)};
 const activity=['owner','admin','operator','auditor'].includes(actor?.role)&&(!actor.permissionKeys||actor.permissionKeys.includes('audit.view'));
 const tabs=[['Profile',UserRound],['Security',ShieldCheck],['Roles & Permissions',Layers],...(activity?[['Activity',Pulse]]:[])];
 const tab=tabs.find(([name])=>name===params.get('section'))?.[0]||'Profile';
 return <section className="account-page"><div className="page-header"><h1 ref={heading} tabIndex={-1}>View account</h1><div className="header-actions"><RefreshButton className="btn secondary" indicator disabled={reports.refreshing} onClick={reports.refresh}>Refresh</RefreshButton>{managed&&<Link className="btn secondary" to="/users?tab=Accounts">Accounts</Link>}</div></div><div className="account-layout">
 <aside className="account-identity"><div className="account-cover"/><Avatar user={selected}/><h2>{selected.name||selected.username||selected.email}</h2>
 <Badge tone="purple">{roleNames[selected.role]||selected.role}</Badge>
 <dl><dt><UserRound size={16}/>Username</dt><dd>{selected.username||'Not reported'}</dd>
 {contact&&<><dt><Mail size={16}/>Contact email</dt><dd>{contact}</dd></>}
 {selected.createdAt&&<><dt><Calendar size={16}/>Created</dt><dd>{accountDate(selected.createdAt)}</dd></>}
 <dt><Clock size={16}/>Last login</dt><dd>{accountDate(selected.lastLogin)}</dd></dl>
 <div className="account-quick"><h3>Quick Actions</h3>{self&&<><button onClick={()=>jump('password')}><KeyRound/>Change password<ChevronRight/></button><button onClick={()=>jump('mfa')}><ShieldCheck/>Multi-factor authentication<ChevronRight/></button></>}<button onClick={()=>select(self?'Profile':'Security')}><SlidersHorizontal/>{self?'Account Settings':'Account Security'}<ChevronRight/></button></div></aside>
 <section className="account-panels"><div className="tabs profile-tabs" role="tablist" aria-label="View account" onKeyDown={tabKeys}>{tabs.map(([name,Icon]:any)=><button key={name} type="button" role="tab" aria-selected={tab===name} tabIndex={tab===name?0:-1} className={tab===name?'tab active':'tab'} onClick={()=>select(name)}><Icon size={17}/>{name}</button>)}</div>
 <div className="account-panel">
 {tab==='Profile'&&<><ProfileForm key={selected.id} user={selected} self={self} role={roleNames[selected.role]||selected.role} onSaved={result=>{setPatch(result);void onSaved?.()}}/><AccountOverview user={selected} self={self} role={roleNames[selected.role]||selected.role} onPermissions={()=>select('Roles & Permissions')}/></>}
 {tab==='Roles & Permissions'&&<AccountPermissions key={selected.id} account={selected} owner={actor?.role==='owner'}
  clusterAccess={onSaved && actor?.role==='owner' && selected.role!=='owner' ? <ClusterAccess key={selected.id+JSON.stringify(selected.clusterRoles)} account={selected} onSaved={onSaved}/> : undefined}/>}
 {tab==='Activity'&&<Suspense fallback={<ReportLoading/>}><AccountActivity key={selected.id} user={selected} date={accountDate}/></Suspense>}

 {tab==='Security'&&(self?<AccountSecurity panel={securityPanel} onPanel={setSecurityPanel}/>:<section><h3>Account Security</h3><dl className="users-facts"><dt>Status</dt><dd>{selected.status}</dd><dt>Two-factor flag</dt><dd>{factor(selected)}</dd><dt>Last login</dt><dd>{accountDate(selected.lastLogin)}</dd></dl></section>)}
 {tab==='Profile'&&children}</div></section></div></section>
}
export default function MyAccountPage(){
 const session=useApi<any>('/auth/me',null);
 const actor=session.data?.user;
 if(!actor)return <section className="account-page"><h1>View account</h1>{session.error?<p role="alert">{session.error}<button onClick={session.refresh}>Retry</button></p>:<ReportLoading/>}</section>;
 return <AccountPage key={actor.sub||actor.id} selected={{...actor,id:actor.sub||actor.id}} actor={actor} self/>;
}
