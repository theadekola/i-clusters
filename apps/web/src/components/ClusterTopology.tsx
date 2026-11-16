import './cluster-topology.css';
import {useState,useEffect,useLayoutEffect,useRef} from 'react';
import {Link} from 'react-router-dom';
import {Cloud,Server,Monitor,Box,Search,Minus,Plus,HardDrive,Minimize,Maximize,CheckSquare} from 'lucide-react';
import {Card,Modal} from './UI';
import {useApi} from '../hooks';
import ReportLoading from './ReportLoading';
import {clusterTopology,topologyState,topologyPercent,topologyGuestName,topologyGuestAddress,topologyStorage} from '../cluster-topology';
import {archiveScopeComplete} from '../backup-selection';
import {guestActivity,nodeActivity,type Flow} from '../topology-flow';
type MapLink={id:string;path:string;target:string;label:string;active?:boolean;storage?:boolean};
type InventoryReading={data:any;error:string;loading:boolean};
const initialReading:InventoryReading={data:null,error:'',loading:true};
type Point={x:number;y:number};

function across(start:Point,end:Point){
 const mid=(start.x+end.x)/2;
 return `M ${start.x} ${start.y} C ${mid} ${start.y}, ${mid} ${end.y}, ${end.x} ${end.y}`;
}

// Enter later columns from the gap above their row so lines stay clear of other guest cards.
function guestLink(start:Point,left:number,top:number,width:number,height:number,firstLeft:number){
 if(left===firstLeft)return across(start,{x:left,y:top+height/2});
 const track=top-16,arrival=left+width/2;
 return across(start,{x:firstLeft-10,y:track})+` C ${firstLeft+16} ${track}, ${arrival} ${track-4}, ${arrival} ${top}`;
}

function mapLinks(canvas:HTMLDivElement){
 const bounds=canvas.getBoundingClientRect(),scale=bounds.width/canvas.offsetWidth;
 const box=(el:Element)=>{
  const r=el.getBoundingClientRect();
  return {left:(r.left-bounds.left)/scale,top:(r.top-bounds.top)/scale,width:r.width/scale,height:r.height/scale};
 };
 const links:MapLink[]=[],guests=new Map<string,{bounds:ReturnType<typeof box>;label:string}>();
 const root=canvas.querySelector<HTMLElement>('.cluster-topology-root');
 const branches=canvas.querySelectorAll('.cluster-topology-branch');
 const hosts=canvas.querySelectorAll('.cluster-topology-node');
 if(!root)return links;
 if(!hosts.length){root.style.removeProperty('top');return links;}
 const first=box(hosts[0]),last=box(hosts[hosts.length-1]);
 const middle=(first.top+first.height/2+last.top+last.height/2)/2;
 root.style.top=(middle-box(root.parentElement!).top-box(root).height/2)+'px';
 const cluster=box(root),source={x:cluster.left+cluster.width,y:cluster.top+cluster.height/2};
 for(const branch of branches){
  const node=branch.querySelector<HTMLButtonElement>('.cluster-topology-node');
  if(!node)continue;
  const host=box(node),y=host.top+host.height/2,flow=node.dataset.flow!;
  links.push({id:flow,target:flow,label:node.dataset.label!,active:node.dataset.active==='true',path:across(source,{x:host.left,y})});
  const start={x:host.left+host.width,y};
  const cards=branch.querySelectorAll<HTMLButtonElement>('.cluster-topology-guest');
  const firstLeft=cards.length?box(cards[0]).left:0;
  for(const card of cards){
   const g=box(card),flow=card.dataset.flow!;
   const label=card.dataset.label!;
   guests.set(flow,{bounds:g,label});
   links.push({id:flow,target:flow,label,active:card.dataset.active==='true',path:guestLink(start,g.left,g.top,g.width,g.height,firstLeft)});
  }
 }
 for(const pool of canvas.querySelectorAll<HTMLElement>('[data-storage-guests]')){
  const p=box(pool),x=p.left+p.width/2;
  for(const key of JSON.parse(pool.dataset.storageGuests||'[]')){
   const guest=guests.get(key);if(!guest)continue;
   const g=guest.bounds;
   const endX=g.left+g.width/2,endY=g.top+g.height,mid=(p.top+endY)/2;
   links.push({id:JSON.stringify([pool.dataset.storagePool,key]),storage:true,target:key,label:guest.label,path:`M ${x} ${p.top} C ${x} ${mid}, ${endX} ${mid}, ${endX} ${endY}`});
  }
 }
 return links;
}

export default function ClusterTopology({data,loading,error,networkMap=false,interfaces}:{networkMap?:boolean;interfaces?:any[];data:any,loading:boolean,error?:string}){
 const [columns,setColumns]=useState(4),[drives,setDrives]=useState(false),[vlan,setVlan]=useState(false),[ipAddress,setIpAddress]=useState(false);
 const [connections,setConnections]=useState<InventoryReading>(initialReading);
 const [showBackup,setShowBackup]=useState(false),[backups,setBackups]=useState<InventoryReading>(initialReading);
 const archived=new Set<string>();
 if(showBackup&&!backups.error)for(const point of backups.data?.points||[])archived.add(`${point.node}:${point.type}:${point.vmid}`);
 const [highlighted,setHighlighted]=useState('');
 const history=useRef<ReturnType<typeof guestActivity>>({samples:new Map(),flows:new Map()});
 const [flows,setFlows]=useState(new Map<string,Flow>()),[now,setNow]=useState(Date.now);
 useEffect(()=>{
  if(!networkMap)return;
  const nodes=clusterTopology(error?null:data).nodes;
  history.current=guestActivity(nodes.filter(n=>n.status==='online').flatMap(n=>n.guests),history.current.samples,Date.now(),history.current.flows);
  const result=new Map(history.current.flows),nodeFlows=nodeActivity(interfaces||[],Date.now());
  for(const n of nodes){const flow=nodeFlows.get(n.name);if(n.status==='online'&&flow)result.set('node:'+n.name,flow)}
  setNow(Date.now());setFlows(result);
 },[networkMap,data,error,interfaces]);
 useEffect(()=>{const deadlines=[...flows.values()].map(f=>f.until).filter(t=>t>now);if(!deadlines.length)return;const timer=setTimeout(()=>setNow(Date.now()),Math.max(1,Math.min(...deadlines)-Date.now()+1));return()=>clearTimeout(timer)},[flows,now]);
 const drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
 const [search,setSearch]=useState(''),[zoom,setZoom]=useState(1),[selected,setSelected]=useState<any>(null);
 const [expanded,setExpanded]=useState(false);
 const shell=useRef<HTMLDivElement>(null);
 function toggleExpanded(){setExpanded(value=>!value)}
 useLayoutEffect(()=>{
  const element=shell.current;if(!element||!expanded)return;
  if(element.showPopover){element.setAttribute('popover','manual');element.showPopover()}
  return()=>{if(element.hasAttribute('popover')){element.hidePopover();element.removeAttribute('popover')}}
 },[expanded]);
 useLayoutEffect(()=>{
  if(!expanded||selected)return;
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setExpanded(false)};
  document.addEventListener('keydown',escape);
  return()=>document.removeEventListener('keydown',escape);
 },[expanded,selected]);
 const viewport=useRef<HTMLDivElement>(null),canvas=useRef<HTMLDivElement>(null);
 function highlight(target:string){
  const card=Array.from(canvas.current?.querySelectorAll<HTMLButtonElement>('button[data-flow]')||[]).find(el=>el.dataset.flow===target);
  if(!card)return;
  setHighlighted(target);
  card.focus({preventScroll:true});
  card.scrollIntoView?.({block:'nearest',inline:'nearest'});
 }
 const [links,setLinks]=useState<MapLink[]>([]);
 useLayoutEffect(()=>{
  const c=canvas.current;if(!c)return;
  const measure=()=>{if(c.offsetWidth && c.getBoundingClientRect().width)setLinks(mapLinks(c))};
  measure();
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
  observer?.observe(c);
  for(const el of c.querySelectorAll('.cluster-topology-root,.cluster-topology-branch,.cluster-topology-node,.cluster-topology-guest,.topology-vlan-label,.topology-storage-pool'))observer?.observe(el);
  window.addEventListener('resize',measure);
  return()=>{observer?.disconnect();window.removeEventListener('resize',measure)};
 },[data,loading,search,error,zoom,expanded,columns,drives,vlan,ipAddress,connections,showBackup,backups]);
 useLayoutEffect(()=>{
  const element=viewport.current;if(!element)return;
  const wheel=(event:WheelEvent)=>{
   event.preventDefault();const factor=Math.exp(-event.deltaY*.0015);
   const rect=element.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
   setZoom(previous=>{const next=Math.max(.25,Math.min(1.6,previous*factor));requestAnimationFrame(()=>{element.scrollLeft=(element.scrollLeft+x)*next/previous-x;element.scrollTop=(element.scrollTop+y)*next/previous-y});return next});
  };
  element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);
 },[]);
 const current=error?{...data,nodes:(data?.nodes||[]).map((n:any)=>({...n,status:'unknown'})),vms:(data?.vms||[]).map((g:any)=>({...g,nodeAvailable:false})),lxc:(data?.lxc||[]).map((g:any)=>({...g,nodeAvailable:false}))}:data;
 const tree=clusterTopology(current,search),all=clusterTopology(current),nodes=all.nodes,online=nodes.filter(n=>n.status==='online').length;
 const inspect=selected?.kind==='node'?nodes.find(n=>n.name===selected.name):all.nodes.flatMap(n=>n.guests).find(g=>g.key===selected?.key);
 const state=inspect?topologyState(inspect,inspect.kind==='node'?undefined:nodes.find(n=>n.name===inspect.node)?.status):'unknown';
 const rootStatus=error||!nodes.length?'Unknown':online===nodes.length&&data?.nodeInventory?.complete!==false&&!data?.errors?.length&&!data?.clusterStatus?.some((r:any)=>r.type==='cluster'&&(r.quorate===0||r.quorate==='0'||r.quorate===false))?'Online':online?'Partial availability':data?.nodeInventory?.complete!==false&&nodes.every(n=>n.status==='offline')?'Nodes unavailable':'Unknown';
 return <div ref={shell} className={expanded?'topology-shell expanded':'topology-shell'}><Card className="cluster-topology"><div className="cluster-topology-toolbar"><div><h3>Cluster Topology</h3><p className="muted">Connected nodes and their reported virtual machines and containers.</p></div><label className="cluster-topology-search"><Search size={15}/><input aria-label="Search topology" placeholder="Search nodes, VMs or CTs…" value={search} onInput={e=>setSearch(e.currentTarget.value)} onChange={e=>setSearch(e.target.value)}/></label><div className="cluster-topology-controls"><button className="icon-btn" aria-label="Zoom out topology" disabled={zoom<=.25} onClick={()=>setZoom(v=>Math.max(.25,Number((v-.1).toFixed(2))))}><Minus size={16}/></button><button className="icon-btn" aria-label="Zoom in topology" disabled={zoom>=1.6} onClick={()=>setZoom(v=>Math.min(1.6,Number((v+.1).toFixed(2))))}><Plus size={16}/></button><button className="icon-btn" aria-label={expanded?'Collapse':'Expand'} title={expanded?'Collapse':'Expand'} aria-pressed={expanded} onClick={toggleExpanded}>{expanded?<Minimize size={16}/>:<Maximize size={16}/>}</button></div>
 <label className="topology-column-picker">Guests per row<select value={columns} onChange={event=>setColumns(Number(event.target.value))}>{[3,4,5,6,7].map(n=><option key={n} value={n}>{n}</option>)}</select></label></div>
 <div className="cluster-topology-legend"><span><i className="online"/>Online / running</span><span><i className="stopped"/>Stopped / offline</span><span><i className="paused"/>Paused / suspended</span><span><i className="unknown"/>Unknown</span><span><Monitor size={14}/>VM</span><span><Box size={14}/>CT</span><label><input type="checkbox" role="switch" checked={drives} onChange={event=>setDrives(event.target.checked)}/> Storage</label><label><input type="checkbox" role="switch" checked={vlan} onChange={event=>setVlan(event.target.checked)}/> VLAN</label><label><input type="checkbox" role="switch" checked={ipAddress} onChange={event=>setIpAddress(event.target.checked)}/> IP address</label><label><input type="checkbox" role="switch" checked={showBackup} onChange={event=>setShowBackup(event.target.checked)}/> Backup</label></div>
 {(drives||vlan)&&<MapInventory path="/proxmox/topology-connections" onChange={setConnections}/>}
 {showBackup&&<MapInventory path="/backups" onChange={setBackups}/>}
 {error&&<p role="alert" className="error">Topology inventory unavailable: {error}</p>}
 {!!data?.errors?.length&&<p role="status" className="muted">Partial inventory. Available nodes and guests remain visible. {data.errors.join(' · ')}</p>}
 <div ref={viewport} onPointerDown={event=>{if(event.pointerType==='touch'||event.button!==0||(event.target as HTMLElement).closest('button,input,select,a,[role="button"]'))return;const element=event.currentTarget;drag.current={x:event.clientX,y:event.clientY,left:element.scrollLeft,top:element.scrollTop};element.setPointerCapture(event.pointerId)}} onPointerMove={event=>{if(!drag.current)return;event.currentTarget.scrollLeft=drag.current.left-(event.clientX-drag.current.x);event.currentTarget.scrollTop=drag.current.top-(event.clientY-drag.current.y)}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} className="cluster-topology-viewport" role="region" aria-label="Cluster topology, scroll to explore" tabIndex={0}><div ref={canvas} className="cluster-topology-canvas" style={{zoom}}><svg className="cluster-topology-links" role="group" aria-label="Topology connections">
 {links.map(link=><path key={link.id} aria-hidden="true" className={link.storage?'storage-link':undefined} data-highlighted={link.target===highlighted} d={link.path}/>)}
 {networkMap&&<g aria-hidden="true">{links.filter(link=>link.active).map(link=>
  <path key={link.id} data-target={link.target} className="map-availability" d={link.path} pathLength={100}/>
 )}</g>}
 {networkMap&&links.map(link=>{
  const flow=link.active&&flows.get(link.target);if(!flow||flow.until<=now)return null;
  return <g aria-hidden="true" key={link.id}>{flow.rx&&<path className="map-pulse rx" d={link.path}/>} {flow.tx&&<path className="map-pulse tx" d={link.path}/>}</g>
 })}
 <g>{links.map(link=><path key={link.id} className="map-link-hit" d={link.path}
  role="button" tabIndex={0} aria-label={link.storage?`Highlight storage connection to ${link.label}`:`Highlight connection to ${link.label}`}
  onClick={()=>highlight(link.target)} onKeyDown={event=>{
   if(event.key==='Enter'||event.key===' '){event.preventDefault();highlight(link.target)}
  }}/>)}</g></svg><div className="topology-flow"><div className="cluster-topology-root"><SystemIcon kind="cluster" status={rootStatus==='Online'?'online':rootStatus==='Partial availability'?'paused':rootStatus==='Nodes unavailable'?'offline':'unknown'}/><span className="topology-system-label"><strong>{all.name}</strong><small className="topology-system-state">{rootStatus}</small></span></div>
 {tree.nodes.length?<ul className="cluster-topology-nodes">{tree.nodes.map(node=><li key={node.name} className="cluster-topology-branch"><div className="topology-host-lane"><button data-flow={'node:'+node.name} data-label={node.name} data-active={node.status==='online'} data-highlighted={highlighted==='node:'+node.name} className={`cluster-topology-node topology-${topologyState(node)}`} aria-label={`Inspect node ${node.name}`} onClick={()=>setSelected(node)}><SystemIcon kind="node" status={topologyState(node)}/><span className="topology-system-label"><b>{node.name}</b><small className="cluster-topology-ip">{ipv4([node.ip]).join(' · ')||'IP unavailable'}</small><small className="topology-system-state">{topologyState(node)}</small>{node.status!=='online'&&<small className="cluster-topology-warning">Proxmox connection unconfirmed</small>}</span></button></div>
 {node.guests.length?<ul className="cluster-topology-guests" style={{'--topology-columns':Math.min(columns,node.guests.length)} as React.CSSProperties}>{node.guests.map((guest:any)=>{const status=topologyState(guest,node.status),name=topologyGuestName(guest),address=topologyGuestAddress(guest,node.status);const label=`${guest.kind==='lxc'?'CT':'VM'} ${name} on ${node.name}`;
  const hasArchive=archived.has(guest.key);
  const detailsId='topology-details-'+guest.key;
  const backupKnown=!backups.error&&Array.isArray(backups.data?.points)&&archiveScopeComplete(backups.data,node.name);
  const archiveLabel=backups.loading&&!backups.data?'Loading backups…':backupKnown?'No archive reported':'Backup status unknown';
  return <li key={guest.key}><button data-flow={guest.key} data-label={label} data-active={status==='running'||status==='online'} data-highlighted={highlighted===guest.key}
   title={address} className={`cluster-topology-guest kind-${guest.kind}`} aria-label={`Inspect ${label}`} aria-describedby={detailsId} onClick={()=>setSelected(guest)}>
   <SystemIcon kind={guest.kind} status={status}/><span id={detailsId} className="topology-system-label"><b>{name}</b>
    <span className="topology-guest-meta"><strong className="topology-guest-identifier">{ipAddress?address:guest.id}</strong>
     <small className={status==='running'?'topology-guest-address':'topology-system-state'}>{status}</small>
     {vlan&&<small className="topology-vlan-label">{connections.error?'VLAN unavailable':connections.loading&&!connections.data?'Loading VLAN…':vlanLabel(connections.data?.guests?.find((g:any)=>g.key===guest.key))}</small>}
    </span>
    {!ipAddress&&<small className="topology-guest-address">{address}</small>}
    {showBackup&&<small className="topology-backup-mark">{hasArchive?<><CheckSquare size={13} aria-hidden="true"/>Backup archive</>:archiveLabel}</small>}
   </span></button></li>})}</ul>:<p className="cluster-topology-empty">{node.status!=='online'?'Guest inventory unavailable while node state is offline or unconfirmed.':data?.nodeCoverage?.some((r:any)=>r.node===node.name&&r.status!=='available')?'No guests reported; node inventory is incomplete.':'No guests reported for this node.'}</p>}</li>)}</ul>:<p className="cluster-topology-empty">{loading?<ReportLoading/>:search?'No nodes or guests match your search.':'No nodes reported. Connect Proxmox to discover nodes, VMs and CTs.'}</p>}</div>

 {drives&&<section className="topology-storage-layer" aria-label="Server storage"><h4>Storage</h4>{connections.error&&<p role="status">{connections.error}</p>}{connections.loading&&!connections.data?<ReportLoading/>:<>{topologyStorage(tree.nodes,error?[]:data?.storage||[],connections.error||error?[]:connections.data?.guests||[]).map(server=><div key={server.node} className="topology-server-storage"><h5 translate="no">{server.node}</h5><div className="topology-storage-pools">{server.pools.length?server.pools.map(pool=><div key={pool.name} className="topology-storage-pool" data-storage-pool={JSON.stringify([server.node,pool.name])} data-storage-guests={JSON.stringify(pool.guests)}><HardDrive size={24}/><b translate="no">{pool.name}</b><small>{pool.status}</small></div>):<small>No storage reported</small>}</div></div>)}<small>Lines show configured guest storage. Host bind mounts and unattached volumes are excluded.</small></>}</section>}
 {(drives||vlan)&&!!connections.data?.errors?.length&&<p className="muted" role="status">Some guest connections could not be read. Unavailable mappings are omitted.</p>}
 </div></div>{networkMap?<small className="muted map-flow-key"><span className="map-availability-key"/> Online connection · <i/> RX · <em/> TX · RX and TX show recent traffic. Select a line to highlight its destination.</small>:<small className="muted">Dashed lines show which node hosts each guest. Pan or zoom to explore. Lines do not represent measured network traffic. Offline nodes do not confirm guest state. Guest IPs are runtime readings, not connectivity tests; VMs need a running QEMU guest agent and API access.</small>}
 <Modal open={!!selected} title={inspect?.kind==='node'?`Node ${inspect.name}`:inspect?topologyGuestName(inspect):'Resource unavailable'} onClose={()=>setSelected(null)}>{inspect?<><dl className="network-inspector">{Object.entries({Name:inspect.name,Type:inspect.kind==='node'?'Proxmox node':inspect.kind==='lxc'?'LXC container':'Virtual machine',Node:inspect.node||inspect.name,ID:inspect.id,Status:state,'Connection evidence':inspect.kind==='node'?inspect.connectionReason:null,IP:inspect.kind==='node'?ipv4([inspect.ip]).join(', ')||'Not reported':state==='running'&&inspect.addresses?.length?ipv4(inspect.addresses).join(', ')||'Unavailable':'Unavailable', 'IP source':inspect.kind==='node'?'Proxmox node inventory':inspect.addressSource||'Runtime interfaces', 'IP reading':inspect.kind==='node'?null:inspect.addressSampledAt||inspect.addressStatus||'Not reported','CPU usage':state==='online'||state==='running'?topologyPercent(inspect.cpu):'Unavailable','Memory usage':state==='online'||state==='running'?topologyPercent(inspect.kind==='node'?inspect.memoryPercent??inspect.memory:inspect.memoryPercent):'Unavailable'}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{String(value??'Not reported')}</dd></div>)}</dl><Link className="btn secondary" to={`/proxmox?tab=${inspect.kind==='node'?'Nodes':inspect.kind==='lxc'?'LXC%20Containers':'Virtual%20Machines'}&node=${encodeURIComponent(inspect.node||inspect.name)}`}>View in Proxmox</Link></>:<p>This resource is no longer in the latest inventory. Close this panel and select a current resource.</p>}</Modal></Card></div>;
}
function SystemIcon({kind,status}:{kind:string;status:string}){
 const Icon=kind==='cluster'?Cloud:kind==='node'?Server:kind==='lxc'?Box:Monitor;
 return <span className={`topology-system-icon icon-${kind}`} aria-hidden="true"><Icon size={kind==='cluster'?60:kind==='node'?48:36}/><i className={`topology-dot ${status}`}/></span>;
}

function ipv4(addresses:any[]=[]){return addresses.filter((value:any)=>typeof value==='string'&&/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)&&value.split('.').every((part:string)=>Number(part)<=255))}
function MapInventory({path,onChange}:{path:string;onChange:(reading:InventoryReading)=>void}){
 const reading=useApi<any>(path,null);
 useEffect(()=>onChange({data:reading.data,error:reading.error,loading:reading.loading}),[reading.data,reading.error,reading.loading,onChange]);
 return null;
}
function vlanLabel(config:any){
 if(!config)return 'VLAN unavailable';
 return config.vlans?.length?'VLAN '+config.vlans.join(' · '):config.networks?'Untagged':'No network adapters';
}
