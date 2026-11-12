import './shell-workspace.css';
import PageIcon from '../components/PageIcon';
import {useSearchParams} from 'react-router-dom';
import SFTPBrowser from '../components/SFTPBrowser';
import {useState,useEffect,useRef} from 'react';
import {Server,Monitor,Box,Search,LayoutGrid,List,Bookmark,Plus,X} from 'lucide-react';
import {useApi} from '../hooks';
import {api} from '../api';
import {Card,Badge,Modal} from '../components/UI';
import SSHTerminal,{SSHLogin} from '../components/SSHAccess';
function HostStatus({status}:{status:string}){
 const previous=useRef(status);
 const badge=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  if(previous.current===status)return;
  previous.current=status;
  if(!window.matchMedia('(prefers-reduced-motion: no-preference)').matches)return;
  const pulse=badge.current?.animate?.([{outlineColor:'currentColor'},{outlineColor:'transparent'}],{duration:700});
  return ()=>pulse?.cancel();
 },[status]);
 return <span ref={badge} className="host-status">
  <Badge tone={['online','running'].includes(status)?'green':'gray'}>{status}</Badge>
 </span>;
}
export default function Shell({mode='shell',visible=true}:{mode?:'shell'|'sftp';visible?:boolean}){
 const [params,setParams]=useSearchParams(),requested=useRef('');
 const files=mode==='sftp';
 const savedConnections=useApi<any>('/ssh/connections',{});
 const live=useApi<any>('/proxmox',null),[search,setSearch]=useState(''),[type,setType]=useState('all'),[list,setList]=useState(true),[selected,setSelected]=useState<any>(null),[connection,setConnection]=useState<any>(null),[tabs,setTabs]=useState<any[]>([]),[active,setActive]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const sessionId=active;
 const pageRef=useRef<HTMLElement>(null);
 const consoleActive=visible&&!!sessionId&&!files;
 useEffect(()=>{
  if(!consoleActive)return;
  window.scrollTo(0,0);
  document.documentElement.classList.add('shell-scroll-locked');
  const viewport=window.visualViewport;
  const layout=()=>{
   const page=pageRef.current;if(!page)return;
   const bottom=(viewport?.height||window.innerHeight)+(viewport?.offsetTop||0);
   page.style.setProperty('--shell-height',`${Math.max(0,bottom-page.getBoundingClientRect().top-12)}px`);
  };
  layout();window.addEventListener('resize',layout);viewport?.addEventListener('resize',layout);viewport?.addEventListener('scroll',layout);
  return()=>{document.documentElement.classList.remove('shell-scroll-locked');window.removeEventListener('resize',layout);viewport?.removeEventListener('resize',layout);viewport?.removeEventListener('scroll',layout);};
 },[consoleActive]);
 const guestActive=consoleActive&&tabs.some(t=>t.id===active&&/^(vm|lxc):/.test(t.target));
 useEffect(()=>{if(!guestActive)return;document.documentElement.classList.add('guest-shell-open');window.dispatchEvent(new Event('resize'));return()=>{document.documentElement.classList.remove('guest-shell-open');window.dispatchEvent(new Event('resize'))}},[guestActive]);
 const pickerScroll=useRef(0);
 const wasInSession=useRef(false);
 useEffect(()=>{
  if(!sessionId&&wasInSession.current)window.scrollTo(0,pickerScroll.current);
  wasInSession.current=!!sessionId;
 },[sessionId]);
 const openSession=(host:any,id:string)=>{if(!sessionId)pickerScroll.current=window.scrollY;setError('');setTabs(current=>[...current,{...host,id}]);setActive(id);setSelected(host)};
 const closeTab=(id:string)=>{setTabs(current=>current.filter(t=>t.id!==id));if(active===id)setActive(tabs.find(t=>t.id!==id)?.id||'')};
 const closeUpdate=(id:string,parentId:string)=>{setTabs(current=>current.filter(t=>t.id!==id));setActive(tabs.find(t=>t.id===parentId)?.id||tabs.find(t=>t.id!==id)?.id||'')};
 const rows=[...(live.data?.nodes||[]).map((r:any)=>({...r,target:`node:${r.name}`,kind:'Nodes',icon:Server,address:r.ip})),...(live.data?.vms||[]).map((r:any)=>({...r,target:`vm:${r.node}:${r.vmid||r.id}`,kind:'Virtual Machines',icon:Monitor})),...(live.data?.lxc||[]).map((r:any)=>({...r,target:`lxc:${r.node}:${r.vmid||r.id}`,kind:'Containers',icon:Box}))];
 const filtered=rows.filter(r=>(type==='all'||r.kind===type)&&`${r.name} ${r.node||''} ${r.address||''} ${r.vmid||r.id||''}`.toLowerCase().includes(search.toLowerCase()));
 const connect=async(r:any)=>{setBusy(true);setError('');let address=r.address;try{try{const session=await api('/ssh/connect',{method:'POST',body:JSON.stringify({saved:true,mode,target:r.target})});openSession(r,session.id);return}catch(e:any){if(e.status!==404)setError(`Saved SSH connection failed: ${e.message}. Check the connection username and password.`);}if(!address&&r.kind!=='Nodes'){const d=await api(`/proxmox/${r.kind==='Containers'?'lxc':'vm'}/${encodeURIComponent(r.node)}/${encodeURIComponent(r.vmid||r.id)}/details`);const items=d.interfaces?.result||d.interfaces||[];const addresses=Array.isArray(items)?items.flatMap((i:any)=>[i.inet?.split('/')[0],...(i['ip-addresses']||[]).map((a:any)=>a['ip-address'])]).filter((a:any)=>a&&a!=='127.0.0.1'&&!a.includes(':')):[];address=addresses[0];}setConnection({...r,address:address||''})}catch(e:any){setError('Guest address discovery unavailable. Enter its SSH address in the connection form.');setConnection({...r,address:''})}finally{setBusy(false)}};
 useEffect(()=>{const target=params.get('target');if(!target){requested.current='';return}if(!visible||files||live.loading||!live.data||requested.current===target)return;requested.current=target;const next=new URLSearchParams(params);next.delete('target');setParams(next,{replace:true});const host=rows.find(r=>r.target===target);if(!host){setError('The requested host is not present in the connected cluster.');return}const existing=tabs.find(t=>t.target===target);if(existing)setActive(existing.id);else connect(host);},[params.get('target'),live.data,live.loading,files,visible]);
 return <section ref={pageRef} className={`shell-page ${consoleActive?'shell-console-active':''}`}><div className="page-header"><div><h1 title={files?'Browse, upload and manage files on your nodes, virtual machines and containers.':'Open multiple SSH tabs for your nodes, virtual machines and containers.'}><PageIcon name={files?'files':'shell'} className="page-title-icon"/>{files?'SFTP Files':'Shell'}</h1>{!sessionId&&<p>Select a host</p>}</div></div>
 {tabs.length>0&&<div className="shell-tabs" role="tablist" aria-label="SSH sessions">{tabs.map(t=><div key={t.id} className={`shell-tab ${active===t.id?'active':''}`}><button role="tab" aria-selected={active===t.id} aria-controls={`panel-${t.id}`} id={`tab-${t.id}`} onClick={()=>setActive(t.id)}><t.icon size={19}/><span><b>{t.name}</b></span></button><button className="icon-btn" aria-label={`Close ${t.name} session`} onClick={()=>closeTab(t.id)}><X size={15}/></button></div>)}<button className="icon-btn shell-new-tab" aria-label="Open new connection tab" onClick={()=>setActive('')}><Plus size={20}/></button></div>}
 {!sessionId&&tabs.length>0&&<h3 className="shell-picker-title"><Plus size={17}/> New connection <small className="muted">Choose a host below. Your other sessions remain open.</small></h3>}
 {!sessionId&&<Card><div className="shell-toolbar"><label className="host-search"><Search size={17} aria-hidden="true"/><input aria-label="Search shell hosts" placeholder="Search nodes, VMs or containers…" value={search} onInput={e=>setSearch(e.currentTarget.value)}/></label><select aria-label="Shell host type" value={type} onChange={e=>setType(e.target.value)}><option value="all">All Types</option>{!sessionId&&['Nodes','Virtual Machines','Containers'].map(t=><option key={t}>{t}</option>)}</select><div className="action-row"><button className="icon-btn" aria-label="Grid view" aria-pressed={!list} onClick={()=>setList(false)}><LayoutGrid size={17}/></button><button className="icon-btn" aria-label="List view" aria-pressed={list} onClick={()=>setList(true)}><List size={17}/></button></div></div></Card>}
 {(live.error||error)&&<p className="error" role="alert">{error||live.error}</p>}
 {!sessionId&&['Nodes','Virtual Machines','Containers'].map(group=>{const hosts=filtered.filter(r=>r.kind===group);return hosts.length?<div key={group} className="shell-group"><h3>{group} <small className="muted">{hosts.length}</small></h3><div className={list?'shell-hosts list':'shell-hosts'}>{list&&<div className="host-columns" aria-hidden="true"><span>Host</span><span>Node</span><span>Status</span><span>Actions</span></div>}
 {hosts.sort((a,b)=>a.target.localeCompare(b.target,undefined,{numeric:true})).map(r=>{
  const prefix=r.kind==='Nodes'?'':(r.kind==='Containers'?'CT ':'VM ')+(r.vmid||r.id)+' · ';
  const saved=!!savedConnections.data?.[r.target];
  return <div className={`shell-host ${selected?.target===r.target?'selected':''}`} key={r.target}>
   <button type="button" className="host-connect" disabled={busy} aria-label={`Connect to ${r.name}`} onClick={()=>connect(r)}>
    <span className="host-identity"><span className={`shell-host-icon ${r.kind==='Containers'?'ct':r.kind==='Nodes'?'node':'vm'}`}><r.icon size={22}/></span><b>{prefix}{r.name}</b></span>
    <small className="host-node">{r.kind==='Nodes'?'Proxmox Node':r.node}</small>
    <HostStatus status={r.status||'Unknown'}/>
   </button>
   <button type="button" className={`icon-btn shell-saved ${saved?'is-saved':''}`} title={saved?'View or modify saved connection':'Connection not saved'} aria-label={`Connection settings for ${r.name}`} onClick={()=>setConnection({...r,address:r.address||'',editing:saved})}><Bookmark size={17} fill={saved?'currentColor':'none'}/></button>
  </div>})}</div></div>:null})}
 {!sessionId&&!filtered.length&&<Card><p>{live.loading?'Discovering hosts…':'No matching hosts reported by the connected cluster.'}</p></Card>}
 {tabs.map(t=><div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} style={{display:active===t.id?'block':'none'}} className="shell-active-view"><Card>{files?<SFTPBrowser sessionId={t.id} name={t.name} active={visible&&active===t.id} onDisconnect={()=>closeTab(t.id)}/>:<SSHTerminal updateTab={!!t.updateTab} onUpdateSession={t.updateTab?undefined:(id:string)=>openSession({...t,name:t.name+' · OS updates',parentId:t.id,updateTab:true},id)} target={t.target} host={t.address} sessionId={t.id} active={visible&&active===t.id} name={t.name} onDisconnect={()=>t.updateTab?closeUpdate(t.id,t.parentId):closeTab(t.id)}/>}</Card></div>)}
 <Modal open={visible&&!!connection} title="Connection Settings" onClose={()=>setConnection(null)}>{connection&&<>{error&&<p role="alert" className="error">{error}</p>}<SSHLogin key={connection.target} target={connection.target} host={connection.address} connection={savedConnections.data?.[connection.target]} editing={connection.editing} mode={mode} onConnected={r=>{savedConnections.refresh();if(connection.editing){api(`/ssh/session/${r.id}`,{method:'DELETE'}).catch(()=>{});setConnection(null);return}openSession(connection,r.id);setConnection(null)}}/></>}</Modal></section>;
}
