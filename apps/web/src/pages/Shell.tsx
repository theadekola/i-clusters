import ProxmoxConsole,{type ConsoleCreation,type ConsoleTarget} from '../components/ProxmoxConsole';
import {tabKeys} from '../components/UI';
import './shell-workspace.css';
import PageIcon from '../components/PageIcon';
import {useLocation,useSearchParams} from 'react-router-dom';
import SFTPBrowser from '../components/SFTPBrowser';
import {useState,useEffect,useRef} from 'react';
import {Server,Monitor,Box,Search,LayoutGrid,List,Ellipsis,Plus,X} from 'lucide-react';
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
export default function Shell({mode='shell',visible=true,consoleOnly=false}:{mode?:'shell'|'sftp';visible?:boolean;consoleOnly?:boolean}){
 const [params,setParams]=useSearchParams(),requested=useRef('');
 const files=mode==='sftp';
 const location=useLocation();
 const consoleMode=!files&&(consoleOnly||params.get('mode')==='console');
 const [consoleId,setConsoleId]=useState('');
 const connectionAttempt=useRef<symbol|null>(null);
 useEffect(()=>()=>{connectionAttempt.current=null},[]);
 const savedConnections=useApi<any>(consoleMode?null:'/ssh/connections?mode='+mode,{});
 const live=useApi<any>('/proxmox',null),[search,setSearch]=useState(''),[type,setType]=useState('all'),[list,setList]=useState(false),[selected,setSelected]=useState<any>(null),[connection,setConnection]=useState<any>(null),[tabs,setTabs]=useState<any[]>([]),[activeId,setActive]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const modeTabs=tabs.filter(t=>Boolean(t.console)===consoleMode);
 const selectedId=consoleMode?consoleId:activeId;
 const activate=consoleMode?setConsoleId:setActive;
 const active=selectedId?(modeTabs.find(t=>t.id===selectedId)||modeTabs[0])?.id||'':'';
 const switchMode=()=>{
  const next=new URLSearchParams(params);
  next.delete('target');
  if(consoleMode)next.delete('mode');else next.set('mode','console');
  setError('');
  setConnection(null);
  setParams(next,{state:null});
 };
 const modeSwitch=!files&&!consoleOnly&&<button type="button" className="btn secondary shell-mode-switch" onClick={switchMode} disabled={busy}>
  {consoleMode?'Switch to SSH':'Switch to Proxmox Console'}
 </button>;
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
 const closeTab=(id:string)=>{setTabs(current=>current.filter(t=>t.id!==id));if(active===id)activate(modeTabs.find(t=>t.id!==id)?.id||'')};
 const closeUpdate=(id:string,parentId:string)=>{setTabs(current=>current.filter(t=>t.id!==id));setActive(tabs.find(t=>t.id===parentId)?.id||tabs.find(t=>t.id!==id)?.id||'')};
 const rows=[...(live.data?.nodes||[]).map((r:any)=>({...r,target:`node:${r.name}`,kind:'Nodes',icon:Server,address:r.ip})),...(live.data?.vms||[]).map((r:any)=>({...r,target:`vm:${r.node}:${r.vmid||r.id}`,kind:'Virtual Machines',icon:Monitor})),...(live.data?.lxc||[]).map((r:any)=>({...r,target:`lxc:${r.node}:${r.vmid||r.id}`,kind:'Containers',icon:Box}))];
 const filtered=rows.filter(r=>(type==='all'||r.kind===type)&&`${r.name} ${r.node||''} ${r.address||''} ${r.vmid||r.id||''}`.toLowerCase().includes(search.toLowerCase()));
 const openConsole=(host:any,creation?:ConsoleCreation)=>{
  const kind=host.kind==='Nodes'?'node':host.kind==='Containers'?'lxc':'qemu';
  const target:ConsoleTarget={
   kind,id:String(host.vmid||host.id||host.name),node:kind==='node'?host.name:host.node,name:host.name,creation
  };
  const id='console:'+host.target;
  if(!sessionId)pickerScroll.current=window.scrollY;
  setError('');
  setSelected(host);
  setTabs(current=>current.some(tab=>tab.id===id)
   ? creation?current.map(tab=>tab.id===id?{...tab,console:target}:tab):current
   : [...current,{...host,id,console:target}]);
  setConsoleId(id);
 };
 const connect=async(r:any,configure=false)=>{
  if(connectionAttempt.current)return;
  const attempt=Symbol();
  connectionAttempt.current=attempt;
  setBusy(true);
  setError('');
  let saved=savedConnections.data?.[r.target],notice='',requirePassword=false;
  try{
   if(!configure&&(files||saved?.hasPassword)){
    try{
     const session=await api('/ssh/connect',{method:'POST',body:JSON.stringify({saved:true,mode,target:r.target})});
     if(connectionAttempt.current!==attempt){
      void api('/ssh/session/'+encodeURIComponent(session.id),{method:'DELETE'}).catch(()=>{});
      return;
     }
     openSession({...r,address:session.host||saved?.host||r.address},session.id);
     return;
    }catch(error:any){
     if(connectionAttempt.current!==attempt)return;
     if(error.status===404){
      if(saved)void savedConnections.refresh();
      saved=undefined;
     }else{
      notice=files?`Saved SSH connection failed: ${error.message}. Check the connection username and password.`:error.message;
      requirePassword=error.body?.code==='ssh_authentication_failed';
     }
    }
   }
   let address=saved?.host||r.address;
   if(!address&&r.kind!=='Nodes'){
    try{
     const kind=r.kind==='Containers'?'lxc':'vm';
     const result=await api(`/proxmox/${kind}/${encodeURIComponent(r.node)}/${encodeURIComponent(r.vmid||r.id)}/details?view=ssh`);
     address=result.host;
    }catch{
     notice||='Guest address discovery unavailable. Enter its SSH address in the connection form.';
    }
   }
   if(connectionAttempt.current===attempt)setConnection({...r,address:address||'',saved,editing:configure,notice,requirePassword});
  }finally{
   if(connectionAttempt.current===attempt){
    connectionAttempt.current=null;
    setBusy(false);
   }
  }
 };
 useEffect(()=>{
  const target=params.get('target');
  if(!target){requested.current='';return;}
  const pending=consoleMode?location.state?.consoleSelection:undefined;
  if(!visible||files||busy||(!pending&&(live.loading||!live.data))||(!consoleMode&&savedConnections.loading))return;
  const request=location.key+':'+target;
  if(requested.current===request)return;
  requested.current=request;
  const next=new URLSearchParams(params);
  next.delete('target');
  setParams(next,{replace:true,state:null});
  const guest=/^(vm|lxc):([A-Za-z0-9][A-Za-z0-9_.-]*):(\d+)$/.exec(target);
  const host=rows.find(row=>row.target===target)||(pending&&guest?{
   target,id:guest[3],node:guest[2],name:pending.name||guest[3],kind:guest[1]==='vm'?'Virtual Machines':'Containers',
   icon:guest[1]==='vm'?Monitor:Box
  }:null);
  if(!host){setError('The requested host is not present in the connected cluster.');return;}
  if(consoleMode){openConsole(host,pending?.creation);return;}
  const existing=modeTabs.find(tab=>tab.target===target);
  if(existing)setActive(existing.id);else void connect(host);
 },[location.key,params.get('target'),live.data,live.loading,savedConnections.loading,busy,files,visible,consoleMode]);

 return <section ref={pageRef} className={`shell-page ${consoleActive?'shell-console-active':''}`}>
 {!sessionId&&<div className="page-header"><div>
  <h1 title={files?'Browse, upload and manage files on your nodes, virtual machines and containers.':consoleMode?undefined:'Open multiple SSH tabs for your nodes, virtual machines and containers.'}><PageIcon name={files?'files':'shell'} className="page-title-icon"/>{files?'SFTP Files':consoleMode?'Proxmox Console':'Shell'}</h1>
  <p>Select a host</p>
 </div>{modeSwitch}</div>}
 {modeTabs.length>0&&<div className="shell-tabs" role="tablist" onKeyDown={tabKeys} aria-label={consoleMode?'Proxmox console sessions':'SSH sessions'}>
  {modeTabs.map(t=><div key={t.id} className={`shell-tab ${active===t.id?'active':''}`}>
   <button role="tab" tabIndex={active===t.id?0:-1} aria-selected={active===t.id} aria-controls={`panel-${t.id}`} id={`tab-${t.id}`} onClick={()=>activate(t.id)}><t.icon size={19}/><span><b>{t.name}</b></span></button>
   <button type="button" className="icon-btn" aria-label={`Close ${t.name} session`} onClick={()=>closeTab(t.id)}><X size={15}/></button>
  </div>)}
  <button type="button" className="icon-btn shell-new-tab" aria-label="Open new connection tab" onClick={()=>activate('')}><Plus size={20}/></button>
  {sessionId&&modeSwitch}
 </div>}
 {!sessionId&&modeTabs.length>0&&<h3 className="shell-picker-title"><Plus size={17}/> New connection <small className="muted">Choose a host below. Your other sessions remain open.</small></h3>}
 {!sessionId&&<Card><div className="shell-toolbar"><label className="host-search"><Search size={17} aria-hidden="true"/><input aria-label="Search shell hosts" placeholder="Search nodes, VMs or containers…" value={search} onInput={e=>setSearch(e.currentTarget.value)}/></label><select aria-label="Shell host type" value={type} onChange={e=>setType(e.target.value)}><option value="all">All Types</option>{['Nodes','Virtual Machines','Containers'].map(t=><option key={t}>{t}</option>)}</select><div className="shell-view-switch"><button className="icon-btn" aria-label="Grid view" aria-pressed={!list} onClick={()=>setList(false)}><LayoutGrid size={17}/></button><button className="icon-btn" aria-label="List view" aria-pressed={list} onClick={()=>setList(true)}><List size={17}/></button></div></div></Card>}
 {(live.error||error)&&<p className="error" role="alert">{error||live.error}</p>}
 {!sessionId&&['Nodes','Virtual Machines','Containers'].map(group=>{const hosts=filtered.filter(r=>r.kind===group);return hosts.length?<div key={group} className="shell-group"><h3>{group} <small className="muted">{hosts.length}</small></h3><div className={list?'shell-hosts list':'shell-hosts'}>{list&&<div className="host-columns" aria-hidden="true"><span>Host</span><span>Node</span><span>Actions</span></div>}
 {hosts.sort((a,b)=>a.target.localeCompare(b.target,undefined,{numeric:true})).map(r=>{
  return <div className={`shell-host ${consoleMode?'console-host':''} ${selected?.target===r.target?'selected':''}`} key={r.target}>
   <button type="button" className="host-connect" disabled={consoleMode?consoleOnly&&r.kind==='Nodes':busy||!files&&savedConnections.loading}
    aria-label={consoleMode?`Open console for ${r.name}`:`Connect to ${r.name}`} onClick={()=>consoleMode?openConsole(r):connect(r)}>
    <span className="host-identity"><span className={`shell-host-icon ${r.kind==='Containers'?'ct':r.kind==='Nodes'?'node':'vm'}`}><r.icon size={22}/></span><b title={r.name}>{r.name}</b></span>
    <small className="host-node">{r.kind==='Nodes'?'Proxmox Node':r.node}</small>
   </button>
   <HostStatus status={r.status||'Unknown'}/>
   {!consoleMode&&<button type="button" className="icon-btn shell-saved" title="Connection Settings" aria-label={`Connection settings for ${r.name}`} disabled={busy||!files&&savedConnections.loading} onClick={()=>connect(r,true)}><Ellipsis size={20} aria-hidden="true"/></button>}
  </div>})}</div></div>:null})}
 {!sessionId&&!filtered.length&&<Card><p>{live.loading?'Discovering hosts…':'No matching hosts reported by the connected cluster.'}</p></Card>}
 {tabs.map(t=><div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} style={{display:active===t.id?'block':'none'}} className="shell-active-view"><Card>{t.console?<ProxmoxConsole key={t.console.creation?.creationReceipt||t.id} target={t.console} active={visible&&active===t.id}/>:files?<SFTPBrowser sessionId={t.id} name={t.name} active={visible&&active===t.id} onDisconnect={message=>{closeTab(t.id);if(message)setError(message)}}/>:<SSHTerminal updateTab={!!t.updateTab} onUpdateSession={t.updateTab?undefined:(id:string)=>openSession({...t,name:t.name+' · OS updates',parentId:t.id,updateTab:true},id)} target={t.target} host={t.address} sessionId={t.id} active={visible&&active===t.id} name={t.name} onDisconnect={()=>t.updateTab?closeUpdate(t.id,t.parentId):closeTab(t.id)}/>}</Card></div>)}
 <Modal open={visible&&!consoleMode&&!!connection} title="Connection Settings" onClose={()=>setConnection(null)}>
  {connection&&<>
   {connection.notice&&<p role="alert" className="error">{connection.notice}</p>}
   <SSHLogin openImmediately={!files} key={connection.target} target={connection.target} host={connection.address}
    connection={connection.saved} editing={connection.editing} mode={mode} requirePassword={connection.requirePassword}
    onConnected={r=>{
     void savedConnections.refresh();
     if(connection.editing)void api(`/ssh/session/${encodeURIComponent(r.id)}`,{method:'DELETE'}).catch(()=>{});
     else openSession({...connection,address:r.host||connection.address},r.id);
     setConnection(null);
    }}/>
   {!files&&connection.kind==='Containers'&&connection.status==='running'&&live.data?.cluster?.accessMode!=='monitoring'&&
    <button type="button" className="btn secondary" onClick={()=>{
     openConsole(connection);
     setConnection(null);
     setParams(new URLSearchParams({mode:'console'}));
    }}>Open Proxmox Console</button>}
  </>}
 </Modal>
 </section>;
}
