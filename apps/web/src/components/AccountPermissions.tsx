import {useEffect,useRef,useState, type ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {Activity, Archive, Box, Check, CircleCheck, CircleMinus, Clock, Crown, Database, Eye, Grid2X2, Layers, Monitor, Network, Plus, RotateCcw, Server, Settings, ShieldCheck, Users} from 'lucide-react';
import {api} from '../api';
import {useApi} from '../hooks';
import ReportLoading from './ReportLoading';
import './account-permissions.css';

const areas = [
  {id:'cluster', label:'Cluster Management', icon:Server}, {id:'vm', label:'Virtual Machines', icon:Monitor},
  {id:'containers', label:'Containers', icon:Box}, {id:'network', label:'Network', icon:Network},
  {id:'backups', label:'Backups', icon:Database}, {id:'users', label:'Users', icon:Users},
  {id:'audit', label:'Audit Logs', icon:Activity}, {id:'settings', label:'Settings', icon:Settings}
];
const actions = {view:'View', create:'Create', edit:'Edit', delete:'Delete', manage:'Manage'};
const titles:Record<string,string> = {owner:'Owner',admin:'Administrator',operator:'Operator',auditor:'Auditor',viewer:'Viewer'};
const descriptions:Record<string,string> = {owner:'Full control of this installation.',admin:'Manage infrastructure, settings and user accounts.',operator:'Operate infrastructure and run backups.',auditor:'Inspect inventory and audit records.',viewer:'View infrastructure inventory.'};
const scope = [
  {area:'cluster',label:'Nodes',icon:Server}, {area:'vm',label:'Virtual Machines',icon:Monitor},
  {area:'containers',label:'Containers',icon:Box}, {area:'backups',label:'Backups',icon:Archive},
  {area:'users',label:'User management',icon:Users}
];
const templateDescriptions:Record<string,string> = {
  'Backup Operator':'Run backups and manage retention.', 'Read-Only Auditor':'Review resources and audit logs.',
  'VM Manager':'Create and operate virtual machines.', 'Network Reviewer':'Inspect network configuration.'
};
type Template = {name:string; keys:string[]};
type Change = {template?:string; id:string; time:string; actor:string; action:string; added?:string[]; removed?:string[]};
type History = {changes:Change[]; next:string|null};
type Policy = History & {scopeCeiling:string[]; template?:string|null; role:string; keys:string[]; ceiling:string[]; revision:number; editable:boolean; templateCeiling:string[]; templates:Template[]};
type Draft = {template:string|null; keys:string[]; revision:number};

function toggle(keys:string[], key:string, ceiling:string[]) {
  const [area,action] = key.split('.');
  if (keys.includes(key)) return keys.filter(item=>item!==key && !(action==='view' && item.startsWith(area+'.')));
  return ceiling.filter(item=>keys.includes(item) || item===key || item===area+'.view');
}
function PermissionMatrix({keys,ceiling,onChange}:{keys:string[];ceiling:string[];onChange?:(keys:string[])=>void}) {
  return <div className="perm-matrix">{areas.map(({id,label,icon:Icon})=>{
    const group = ceiling.filter(key=>key.startsWith(id+'.'));
    const full = group.length>0 && group.every(key=>keys.includes(key));
    return <div className="perm-row" key={id}><strong><Icon size={17}/>{label}</strong><div className="perm-controls" role="group" aria-label={label}>
      {Object.entries(actions).map(([action,title])=>{
        const key = id+'.'+action, allowed = keys.includes(key);
        const available = ceiling.includes(key);
        return <button type="button" role="switch" aria-checked={allowed} aria-label={label+' · '+title}
          title={available ? title : 'Unavailable for this role'} key={key} disabled={!onChange || !available}
          onClick={()=>onChange?.(toggle(keys,key,ceiling))}>{allowed?<CircleCheck/>:<CircleMinus/>}{title}</button>;
      })}
      <button type="button" role="switch" aria-checked={full} aria-label={label+' · Full access'} disabled={!onChange || !group.length}
        onClick={()=>onChange?.([...keys.filter(key=>!group.includes(key)),...(!full ? group : [])])}>{full?<Check/>:<CircleMinus/>}Full access</button>
    </div></div>;
  })}</div>;
}
function HistoryList({policy,path}:{policy:Policy;path:string}) {
  const [expanded,setExpanded] = useState(false), [extra,setExtra] = useState<History|null>(null);
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const changes = expanded ? [...policy.changes,...(extra?.changes || [])] : policy.changes.slice(0,3);
  const cursor = extra ? extra.next : policy.next;
  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);setError('');
    try {const page:History = await api(path+'/permission-history?before='+encodeURIComponent(cursor));
      setExtra({changes:[...(extra?.changes || []),...page.changes], next:page.next});
    } catch(e:any) {setError(e.message)} finally {setBusy(false)}
  }
  const labels = (keys:string[])=>keys.map(key=>{
    const [area,action] = key.split('.');
    return (areas.find(entry=>entry.id===area)?.label || area)+' · '+(actions[action as keyof typeof actions] || action);
  }).join(', ');
  return <section className="perm-card"><div className="perm-heading"><h3><Clock/>Recent Permission Changes</h3>
    {policy.changes.length>0 && <button type="button" className="perm-link" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Show less':'View all'}</button>}</div>
    {changes.length===0 && <p>No permission changes recorded.</p>}
    <ul className="perm-timeline">{changes.map(change=><li key={change.id}><ShieldCheck/><div>
      <strong>{change.action==='user.cluster-access'?'Cluster access updated':'Permissions updated'}</strong>
      {change.template && <small>{change.template}</small>}
      <small>{change.actor} · <time dateTime={change.time}>{new Date(change.time).toLocaleString()}</time></small>
      {expanded && <>{!!change.added?.length && <small>Allowed · {labels(change.added)}</small>}{!!change.removed?.length && <small>Restricted · {labels(change.removed)}</small>}</>}
    </div></li>)}</ul>
    {expanded && cursor && <button className="btn secondary" disabled={busy} onClick={loadMore}>Load more</button>}
    {error && <p role="alert">{error}</p>}</section>;
}
export default function AccountPermissions({account,owner,clusterAccess}:{account:any;owner:boolean;clusterAccess?:ReactNode}) {
  const path = '/users/'+encodeURIComponent(account.id);
  const live = useApi<Policy|null>(path+'/permissions',null);
  const policy = live.data;
  const [draft,setDraft] = useState<Draft|null>(null), [busy,setBusy] = useState(false);
  const [preview,setPreview] = useState<Template|null>(null), [creating,setCreating] = useState(false);
  const [name,setName] = useState(''), [templateKeys,setTemplateKeys] = useState<string[]>([]);
  const [error,setError] = useState(''), [notice,setNotice] = useState('');
  const roleName = useRef<HTMLInputElement>(null);
  useEffect(()=>{if(creating) roleName.current?.focus()},[creating]);
  if (!policy?.ceiling) return live.loading && !live.error ? <ReportLoading/> :
    <section className="perm-card"><p role="alert">{live.error || 'Permissions could not be loaded.'}</p><button className="btn secondary" onClick={live.refresh}>Retry</button></section>;
  const keys = draft?.keys || policy.keys;
  const template = draft ? draft.template : policy.template ?? null;
  const dirty = template!==(policy.template??null) || keys.length!==policy.keys.length || keys.some(key=>!policy.keys.includes(key));
  const edit = (next:string[],template:string|null=null)=>{setDraft({keys:next,template,revision:draft?.revision ?? policy.revision});setError('');setNotice('')};
  async function save() {
    if (!draft || !policy || busy) return;
    setBusy(true);setError('');setNotice('');
    try {await api(path+'/permissions',{method:'PUT',body:JSON.stringify(draft)});setDraft(null);await live.refresh();setNotice('Permissions saved.')}
    catch(e:any) {setError(e.message)} finally {setBusy(false)}
  }
  async function createTemplate(e:React.FormEvent) {
    e.preventDefault();if (busy) return;
    setBusy(true);setError('');setNotice('');
    try {const result:Template = await api('/users/permission-templates',{method:'POST',body:JSON.stringify({name,keys:templateKeys})});
      await live.refresh();setCreating(false);setPreview(result);setNotice('Custom role created.');
    } catch(e:any) {setError(e.message)} finally {setBusy(false)}
  }
  // A template can be reused across roles. Applying it intersects the template
  // with the edited account's ceiling before anything can be saved.
  const available = policy.templateCeiling;
  return <div className="permissions-workspace">
    <header className="perm-hero"><Layers/><div><h2>Roles &amp; Permissions</h2><p>Manage account access to infrastructure and settings.</p></div><span><ShieldCheck/>Access controlled</span></header>
    <div className="perm-grid">
      <section className="perm-card"><h3><Users/>Assigned Role</h3><div className="perm-assigned"><Crown/><div><strong>{template || titles[policy.role]}</strong><p>{template ? titles[policy.role] : descriptions[policy.role]}</p></div><div className="perm-assignment-scope"><small>Role Scope</small><strong>{account.clusterRoles==null?'All clusters':'Assigned clusters'}</strong></div></div></section>
      <section className="perm-card"><h3><ShieldCheck/>Role Scope</h3><div className="perm-scope">{scope.map(({area,label,icon:Icon})=>{
        const granted = keys.includes(area+'.view') && (policy.scopeCeiling ?? policy.ceiling).includes(area+'.view');
        return <div key={area}><Icon/><strong>{label}</strong><small className={granted?'allowed':''}>{granted?'Allowed':'Restricted'}</small></div>;
      })}</div>{(clusterAccess || account.clusterRoles!=null) && <details><summary>Cluster access</summary>{clusterAccess || (Object.keys(account.clusterRoles).length ? Object.entries(account.clusterRoles).map(([id,role])=><p key={id}>{id} · {titles[String(role)]}</p>):<p>No access</p>)}</details>}</section>
      <section className="perm-card perm-groups"><h3><Grid2X2/>Permission Groups</h3><p>{policy.editable?'Choose the actions this account can use.':'These permissions are set by the assigned role and account policy.'}</p>
        <details className="perm-help"><summary>How access works</summary><p>Saved permissions apply within the assigned role and clusters. Reports that combine areas require access to each area. Custom access is limited to supported operations and excludes unrestricted shells.</p></details>
        <PermissionMatrix keys={keys} ceiling={policy.ceiling} onChange={policy.editable && !busy ? edit : undefined}/></section>
      <div className="perm-side"><section className="perm-card"><div className="perm-heading"><h3><Layers/>Custom Roles</h3>
        {owner && <button className="btn secondary" aria-expanded={creating} disabled={busy} onClick={()=>{setCreating(!creating);setTemplateKeys(keys);setName('');setError('');setNotice('')}}><Plus size={14}/>{creating?'Cancel':'Create Custom Role'}</button>}</div>
        <div className="perm-templates">{policy.templates.map((t,i)=>{
          const Icon = [Database,Eye,Monitor,Network][i] || Layers;
          return <button key={t.name} type="button" aria-pressed={preview?.name===t.name} onClick={()=>setPreview(preview?.name===t.name?null:t)}><Icon/><span>{t.name}<small>{Object.hasOwn(templateDescriptions,t.name)?templateDescriptions[t.name]:t.keys.length+' · '+'Permissions'}</small></span></button>;
        })}</div>
        {preview && <div className="perm-preview"><strong>{preview.name}</strong>
          <p>{areas.map(a=>[a.label,preview.keys.filter(k=>k.startsWith(a.id+'.')).map(k=>actions[k.split('.')[1] as keyof typeof actions]).join(', ')]).filter(([,v])=>v).map(([a,v])=>a+' · '+v).join(' / ') || 'No access'}</p>
          {policy.editable && <button className="btn secondary" disabled={busy} onClick={()=>{edit(preview.keys.filter(key=>policy.ceiling.includes(key)),preview.name);setPreview(null)}}>Apply role</button>}</div>}
      </section><HistoryList key={policy.revision} policy={policy} path={path}/></div>
    </div>
    {creating && <form className="perm-card perm-create" onSubmit={createTemplate}><h3><Layers/>Create Custom Role</h3>
      <label>Role name<input ref={roleName} required maxLength={64} value={name} onChange={e=>setName(e.target.value)}/></label>
      <p>Choose the permissions to include in this reusable role.</p><PermissionMatrix keys={templateKeys} ceiling={available} onChange={busy?undefined:setTemplateKeys}/>
      <div className="profile-actions"><button type="button" className="btn secondary" disabled={busy} onClick={()=>setCreating(false)}>Cancel</button><button className="btn primary" disabled={busy || !name.trim()}>Create role</button></div></form>}
    {error && <p role="alert">{error}</p>}{live.error && <p role="alert">{live.error}</p>}{notice && <p role="status">{notice}</p>}
    <footer className="perm-footer">{dirty && <small>Unsaved changes</small>}{!policy.editable && <small>{policy.role==='owner'?'Owner permissions are protected.':'Only an owner can change these permissions.'}{owner && policy.role==='owner' && <> <Link to="/users">Manage users</Link></>}</small>}
      <button className="btn secondary" disabled={!draft || busy} onClick={()=>{setDraft(null);setError('');setNotice('');void live.refresh()}}><RotateCcw size={15}/>Reset Changes</button>
      <button className="btn primary" disabled={!policy.editable || !dirty || busy} onClick={save}><Check size={16}/>Save Permissions</button></footer>
  </div>;
}
