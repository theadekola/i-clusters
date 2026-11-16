import {api} from '../api';
import {reportCluster,clusterReportFilename} from '../cluster-context';
import {useState,useRef} from 'react';
import {Activity,Archive,Bell,Download,Filter,History,KeyRound,Layers,LogIn,Monitor,RotateCcw,Server,ShieldCheck,UserRound} from 'lucide-react';
import {useApi} from '../hooks';
import ReportLoading from './ReportLoading';

const groups={signin:'Sign-ins',security:'Security',token:'API tokens',backup:'Backups',notification:'Notifications',profile:'Profile',infrastructure:'Infrastructure'};
type Group=keyof typeof groups;
type EventRow={id:string;time:string;action:string;resource:string;group:Group;status:string;ip?:string;device?:string};
type Login={id:string;time:string;device?:string;ip?:string;current:boolean;active?:boolean;seen?:string};
type Report={next?:string|null;asOf?:string;logs:EventRow[];logins:Login[];truncated:boolean;summary:Record<string,{current:number;previous:number}>};
const icons={signin:LogIn,security:ShieldCheck,token:KeyRound,backup:Archive,notification:Bell,profile:UserRound,infrastructure:Server};
const names:Record<string,string>={'auth.login':'Sign-in','account.profile.update':'Profile updated','account.password.change':'Password changed','account.token.create':'API token created','account.token.revoke':'API token revoked','account.mfa.enable':'MFA enabled','account.mfa.disable':'MFA disabled','user.permissions':'Permissions updated'};
function title(action:string){return Object.hasOwn(names,action)?names[action]:action.replace(/[._-]/g,' ')}
function deviceInfo(raw=''){
  const os=/iPhone|iPad|Android|Windows|Mac OS|Linux/.exec(raw)?.[0];
  const browser=/Edg(?:iOS|A)?\/([\d.]+)/.exec(raw)||/Firefox\/([\d.]+)|FxiOS\/([\d.]+)/.exec(raw)||/(?:Chrome|CriOS)\/([\d.]+)/.exec(raw)||/Version\/([\d.]+).*Safari/.exec(raw);
  const browserName=browser?(/Edg/.test(browser[0])?'Edge':/Firefox|FxiOS/.test(browser[0])?'Firefox':/Chrome|CriOS/.test(browser[0])?'Chrome':'Safari')+' '+(browser[1]||browser[2]).split('.')[0]:'—';
  return {device:os||'Not reported',browser:browserName};
}
function SignIns({rows,date}:{rows:Login[];date:(value:string)=>string}){
  return <section className="activity-card"><div className="activity-title"><Monitor/><h3>Login Activity</h3></div>
    {rows.length?<div className="activity-table-wrap"><table><thead><tr><th>Device</th><th>Browser</th><th>IP address</th><th>Last seen</th></tr></thead><tbody>
    {rows.map(row=>{const d=deviceInfo(row.device||'');return <tr key={row.id}><td>{d.device}{(row.current||row.active)&&<small className="activity-pill">{row.current?'This device':'Active session'}</small>}</td><td>{d.browser}</td><td>{row.ip||'—'}</td><td><time dateTime={row.seen||row.time}>{date(row.seen||row.time)}</time></td></tr>})}</tbody></table></div>:<p>No recorded sign-ins.</p>}
  </section>
}
export default function AccountActivity({user,date}:{user:any;date:(v:string)=>string}){
  const [tracking,setTracking]=useState(true),[asOf,setAsOf]=useState('');
  const [days,setDays]=useState('7'),[group,setGroup]=useState('all'),[search,setSearch]=useState(''),[limit,setLimit]=useState(7);
  const [extra,setExtra]=useState<{path:string;logs:EventRow[];next?:string|null;asOf?:string}|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const filters=new URLSearchParams({accountId:user.id,days,group,search,...(asOf?{asOf}:{})});
  const path='/audit?'+filters;
  const activePath=useRef(path);activePath.current=path;
  const paging=extra?.path===path?extra:null;
  const live=useApi<Report|null>(path,null,tracking&&!paging?30000:0),report=live.data;
  const matches=paging?.logs||report?.logs||[],next=paging?paging.next:report?.next;
  function clear(){setDays('all');setGroup('all');setSearch('');setLimit(7);setExtra(null)}
  async function getPage(cursor:string,snapshot?:string){
    const query=new URLSearchParams(filters);query.set('before',cursor);if(snapshot)query.set('asOf',snapshot);
    return api<Report>('/audit?'+query);
  }
  async function more(){
    if(limit<matches.length||!next){setLimit(limit+14);return}
    setBusy(true);setError('');
    try{const snapshot=paging?.asOf||report?.asOf;const page=await getPage(next,snapshot);
      if(activePath.current===path){setExtra({path,logs:[...matches,...page.logs],next:page.next,asOf:snapshot});setLimit(limit+14)}
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  }
  async function exportRows(){
    if(!report)return;
    setBusy(true);setError('');
    try{
      const snapshot=paging?.asOf||report.asOf;
      const rows=[...matches];let cursor=next;
      while(cursor){const page=await getPage(cursor,snapshot);rows.push(...page.logs);cursor=page.next}
      const generatedAt=new Date().toISOString(),bundle={sourceCluster:reportCluster(),account:{id:user.id,username:user.username},filters:{days,group,search,asOf:snapshot},generatedAt,events:rows};
      const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=clusterReportFilename('account-activity-'+user.id+'-'+generatedAt.slice(0,10)+'.json');a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  }
  return <div className="account-activity-workspace">
    <header className="activity-hero"><Activity/><div><h2>Account Activity</h2><p>Track recent actions, sign-ins and account changes.</p></div>
    <button type="button" role="switch" aria-label="Live tracking" aria-checked={tracking} disabled={!live.data} onClick={()=>{setAsOf(tracking?(report?.asOf||new Date().toISOString()):'');setExtra(null);setTracking(!tracking)}}><span className="activity-track"><i/></span>{tracking?'Live tracking':'Tracking paused'}</button></header>
    {live.error&&<p role="alert">{live.error} <button className="btn secondary" onClick={live.refresh}>Retry</button></p>}
    {!report&&live.loading&&<ReportLoading/>}
    {report&&<><section className="activity-card"><div className="activity-title"><Layers/><h3>Activity Summary</h3></div><div className="activity-metrics">
      {([{key:'total',label:'Total actions',Icon:Layers},{key:'signin',label:'Sign-ins',Icon:LogIn},{key:'security',label:'Security events',Icon:ShieldCheck},{key:'infrastructure',label:'Infrastructure actions',Icon:Server}]).map(({key,label,Icon})=>{
        const {current,previous}=report.summary[key];
        const delta=previous?Math.round((current-previous)/previous*100):null;
        return <div key={key}><Icon/><strong>{current}</strong><small>{label}</small><span title="Compared with the previous 7 days">{delta===null?(current?'New':'—'):(delta>0?'+':'')+delta+'%'}</span></div>
      })}</div><p className="activity-period">Last 7 days compared with the previous 7 days</p></section>
      <div className="activity-grid"><section className="activity-card activity-recent"><div className="activity-title"><History/><h3>Recent Activity</h3><small>{matches.length}{next?'+':''}</small></div>
      {error&&<p role="alert">{error}</p>}
      <ol className="activity-timeline">{matches.slice(0,limit).map(row=>{const Icon=icons[row.group];return <li key={row.id}><span className={'activity-event-icon kind-'+row.group}><Icon/></span><div><strong>{title(row.action)}</strong><small>{row.resource} · {row.status}</small></div><time dateTime={row.time}>{date(row.time)}</time><span className={'activity-pill kind-'+row.group}>{groups[row.group]}</span></li>})}</ol>
      {!matches.length&&<p>No matching activity.</p>}{(matches.length>limit||next)&&<button className="account-text-button" disabled={busy} onClick={more}>Show more</button>}</section>
      <div className="activity-tools"><section className="activity-card"><div className="activity-title"><Filter/><h3>Filters</h3></div>
      <div className="activity-filters"><label>Time Range<select value={days} onChange={e=>{setDays(e.target.value);setLimit(7)}}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="all">All time</option></select></label>
      <label>Category<select value={group} onChange={e=>{setGroup(e.target.value);setLimit(7)}}><option value="all">All activities</option>{Object.entries(groups).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label>Search activity<input type="search" value={search} maxLength={200} placeholder="Search actions or devices" onChange={e=>{setSearch(e.target.value);setLimit(7)}}/></label></div></section>
      <SignIns rows={report.logins} date={date}/><div className="activity-actions"><button className="btn secondary" onClick={clear}><RotateCcw size={16}/>Clear Filters</button><button className="btn primary" disabled={busy||!matches.length} onClick={exportRows}><Download size={16}/>Export Activity</button></div></div></div></>}
  </div>
}
