import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {Activity as Pulse,Bell,Clock,Download,Filter,KeyRound,Layers,ShieldCheck,UserRound} from 'lucide-react';
import {api} from '../api';
import {useApi} from '../hooks';
import {loadAppearance,saveAppearance,themePresets} from '../appearance';
import LanguageSelector from './LanguageSelector';
import ReportLoading from './ReportLoading';

export function ProfileForm({user,self,onSaved}:{user:any;self:boolean;onSaved:(patch:any)=>void}){
 const stored=user.profile||{};
 const initial={name:user.name||'',contactEmail:stored.contactEmail??(user.email?.includes('@')?user.email:''),timeZone:stored.timeZone||(self?(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'):''),bio:stored.bio||''};
 const [draft,setDraft]=useState(initial),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const change=(key:keyof typeof initial,value:string)=>{setDraft({...draft,[key]:value});setNotice('');setError('')};
 const dirty=Object.keys(initial).some(key=>initial[key as keyof typeof initial]!==draft[key as keyof typeof initial]);
 return <form className="profile-section" onSubmit={async e=>{
  e.preventDefault();if(!self||!dirty||busy)return;setBusy(true);setError('');
  try{const result=await api('/account/profile',{method:'PUT',body:JSON.stringify(draft)});onSaved(result);setDraft({...draft,name:result.name});setNotice('Saved successfully.')}catch(e:any){setError(e.message)}finally{setBusy(false)}
 }}>
 <h3><UserRound/>Personal Information</h3><fieldset disabled={!self||busy} className="profile-fields">
 <label>Full name<input required maxLength={200} value={draft.name} onChange={e=>change('name',e.target.value)}/></label>
 <label>Contact email<input type="email" maxLength={254} value={draft.contactEmail} onChange={e=>change('contactEmail',e.target.value)}/></label>
 <label>Time zone<input required maxLength={100} list="profile-time-zones" value={draft.timeZone} onChange={e=>change('timeZone',e.target.value)}/></label>
 <datalist id="profile-time-zones">{['UTC',...((Intl as any).supportedValuesOf?.('timeZone')||[])].map(zone=><option key={zone} value={zone}/>)}</datalist>
 <label className="profile-bio">Bio<textarea maxLength={300} rows={2} value={draft.bio} onChange={e=>change('bio',e.target.value)}/></label>
 </fieldset>{self&&<div className="profile-actions"><button type="button" className="btn secondary" disabled={!dirty||busy} onClick={()=>{setDraft(initial);setError('');setNotice('')}}>Discard</button><button className="btn primary" disabled={!dirty||busy}>Save Changes</button></div>}
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}</form>
}

export function ProfilePreferences(){
 const [prefs,setPrefs]=useState(loadAppearance),[error,setError]=useState('');
 useEffect(()=>{const sync=()=>setPrefs(loadAppearance());window.addEventListener('iclusters-appearance',sync);return()=>window.removeEventListener('iclusters-appearance',sync)},[]);
 const save=(patch:Partial<typeof prefs>)=>{try{saveAppearance({...loadAppearance(),...patch});setError('')}catch(e:any){setError(e.message)}};
 return <section className="profile-section"><h3>Appearance</h3><div className="profile-fields"><label>Theme Mode<select value={prefs.theme} onChange={e=>save({theme:e.target.value as typeof prefs.theme})}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>
 <label>Theme Colour<select value={prefs.preset} onChange={e=>{const preset=themePresets.find(p=>p.id===e.target.value)!;save({preset:preset.id,accent:preset.accent})}}>{themePresets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><LanguageSelector/></div>{error&&<p role="alert">{error}</p>}</section>
}

export function ProfileNotifications(){
 const live=useApi<any>('/header-notifications',null,10000),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const data=live.data;
 return <section className="profile-section"><h3><Bell/>Notifications</h3>{(error||live.error)&&<p role="alert">{error||live.error}</p>}
 {data?<><p>{data.unreadCount||0} · Unread</p>{data.attention?.map((r:any)=><Link className="profile-event" key={r.id} to={r.link}>{r.title}</Link>)}</>:live.loading&&<ReportLoading/>}
 <div className="profile-actions"><Link className="btn secondary" to="/alerts">View all alerts</Link><button className="btn secondary" onClick={()=>live.refresh()}>Refresh</button><button className="btn primary" disabled={busy||!data?.unreadCount} onClick={async()=>{setBusy(true);setError('');try{await api('/header-notifications/read',{method:'POST',body:JSON.stringify({sequence:data.latestSequence})});await live.refresh()}catch(e:any){setError(e.message)}finally{setBusy(false)}}}>Mark activity read</button></div></section>
}

function category(action:string){
 if(/login|sign.in/i.test(action))return 'Sign-ins';
 if(/account|user|permission|role|mfa|password|token/i.test(action))return 'Account Security';
 return 'Infrastructure';
}
function LoginActivity({date}:{date:(v:any)=>string}){
 const live=useApi<any>('/account/sessions',null);
 return <section className="profile-section"><h3><UserRound/>Signed-in devices</h3>{live.error?<p role="alert">{live.error} <button className="btn secondary" onClick={()=>live.refresh()}>Retry</button></p>:live.data?.sessions?.length?live.data.sessions.map((session:any)=><div className="profile-event" key={session.id}><UserRound size={17}/><div><strong>{session.device}</strong>{session.current&&<small>This device</small>}</div><time>{date(session.created_at)}</time></div>):live.loading?<ReportLoading/>:<p>No active sessions.</p>}</section>
}
export function ProfileActivity({user,self,date}:{user:any;self:boolean;date:(v:any)=>string}){
 const live=useApi<any>('/audit',null,30000),[search,setSearch]=useState(''),[days,setDays]=useState('all'),[group,setGroup]=useState('all');
 const rows=(live.data?.logs||[]).filter((r:any)=>r.user&&(r.user===user.email||r.user===user.username));
 const filtered=rows.filter((r:any)=>(days==='all'||Date.parse(r.time)>=Date.now()-Number(days)*86400000)&&(group==='all'||group===category(r.action))&&[r.action,r.resource,r.status,r.ip].join(' ').toLowerCase().includes(search.toLowerCase()));
 function download(){const url=URL.createObjectURL(new Blob([JSON.stringify(filtered,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='account-activity.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <><section className="profile-section"><h3><Pulse/>Account Activity</h3><p>Actions performed by this account in the latest 500 audit records.</p>{live.error?<p role="alert">{live.error} <button className="btn secondary" onClick={()=>live.refresh()}>Retry activity</button></p>:live.loading&&!live.data?<ReportLoading/>:<div className="profile-stats">{[['Total actions',Layers,rows.length],['Sign-ins',UserRound,rows.filter((r:any)=>category(r.action)==='Sign-ins').length],['Account Security',ShieldCheck,rows.filter((r:any)=>category(r.action)==='Account Security').length]].map(([name,Icon,count]:any)=><div key={name}><Icon size={20}/><strong>{count}</strong><small>{name}</small></div>)}</div>}</section>
 <section className="profile-section"><h3><Filter/>Filters</h3><div className="profile-fields"><label>Time Range<select value={days} onChange={e=>setDays(e.target.value)}><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label><label>Category<select value={group} onChange={e=>setGroup(e.target.value)}><option value="all">All activities</option>{['Sign-ins','Account Security','Infrastructure'].map(c=><option key={c}>{c}</option>)}</select></label><label>Search activity<input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
 <div className="profile-actions"><button className="btn secondary" onClick={()=>{setSearch('');setGroup('all');setDays('all')}}>Clear Filters</button><button className="btn primary" disabled={!filtered.length} onClick={download}><Download size={16}/>Export Activity</button></div></section>
 <section className="profile-section users-activity"><h3><Clock/>Recent Activity</h3>{filtered.map((r:any)=><article className="profile-event" key={r.id}><KeyRound size={17}/><div><strong>{r.action}</strong><small>{r.resource}</small></div><time>{date(r.time)}</time></article>)}{!filtered.length&&!live.loading&&!live.error&&<p>No matching activity in the returned audit history.</p>}</section>{self&&<LoginActivity date={date}/>}</>
}
