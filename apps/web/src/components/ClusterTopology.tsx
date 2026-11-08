import {useState,useEffect,useLayoutEffect,useRef} from 'react';
import {Link} from 'react-router-dom';
import {Cloud,Server,Monitor,Box,Search,Minus,Plus,Filter,HardDrive,Minimize,Maximize} from 'lucide-react';
import {Card,Modal} from './UI';
import {useApi} from '../hooks';
import ReportLoading from './ReportLoading';
import {clusterTopology,topologyState,topologyPercent,topologyGuestName} from '../cluster-topology';
import {guestActivity,nodeActivity,type Flow} from '../topology-flow';
export default function ClusterTopology({data,loading,error,networkMap=false,interfaces}:{networkMap?:boolean;interfaces?:any[];data:any,loading:boolean,error?:string}){
 const [layout,setLayout]=useState(networkMap?'tree':'horizontal'),[columns,setColumns]=useState(networkMap?2:4),[filters,setFilters]=useState(false),[drives,setDrives]=useState(false),[docker,setDocker]=useState(false);
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
 const [drawing,setDrawing]=useState<{width:number;height:number;paths:string[];keys:string[]}>({width:0,height:0,paths:[],keys:[]});
 useLayoutEffect(()=>{
  const measure=()=>{const v=viewport.current,c=canvas.current;if(!v||!c||!c.offsetWidth)return;
   const bounds=c.getBoundingClientRect(),scale=bounds.width/c.offsetWidth;if(!scale)return;
   const rect=(el:Element)=>{const r=el.getBoundingClientRect();return {x:(r.left-bounds.left+r.width/2)/scale,y:(r.top-bounds.top+r.height/2)/scale,w:r.width/scale,h:r.height/scale}};
   const root=c.querySelector('.cluster-topology-root'),paths:string[]=[],keys:string[]=[],stacked=layout==='vertical';
   if(root){const start=rect(root);for(const branch of c.querySelectorAll('.cluster-topology-branch')){
    const icon=branch.querySelector('.cluster-topology-node .topology-system-icon'),node=branch.querySelector('.cluster-topology-node');if(!icon||!node)continue;
    const target=rect(icon),panel=rect(node),join=target.y-target.h/2-24;
    if(layout==='tree'){
     const sx=start.x,sy=start.y+start.h/2,nx=panel.x,ny=panel.y-panel.h/2;
     paths.push(`M ${sx} ${sy} V ${(sy+ny)/2} H ${nx} V ${ny}`);keys.push(node.getAttribute('data-flow')||'');
     for(const guest of branch.querySelectorAll('.cluster-topology-guest')){
      const g=rect(guest),left=g.x-g.w/2,spine=left-10,bus=panel.y+panel.h/2+12;
      paths.push(`M ${nx} ${panel.y+panel.h/2} V ${bus} H ${spine} V ${g.y} H ${left}`);keys.push(guest.getAttribute('data-flow')||'');
     }
     continue;
    }
    if(!stacked){
     const curve=(x:number,y:number,endX:number,endY:number)=>{const mid=(x+endX)/2;return `M ${x} ${y} C ${mid} ${y}, ${mid} ${endY}, ${endX} ${endY}`};
     paths.push(curve(start.x+start.w/2,start.y,panel.x-panel.w/2,panel.y));
     for(const guest of branch.querySelectorAll('.cluster-topology-guest')){const g=rect(guest);paths.push(curve(panel.x+panel.w/2,panel.y,g.x-g.w/2,g.y))}
     continue;
    }
    paths.push(stacked?`M ${start.x} ${start.y+start.h/2+4} V ${start.y+start.h/2+18} H 8 V ${join} H ${target.x} V ${target.y-target.h/2-6}`:`M ${start.x} ${start.y+start.h/2+4} V ${join} H ${target.x} V ${target.y-target.h/2-6}`);
    const guests=[...branch.querySelectorAll('.cluster-topology-guest .topology-system-icon')].map(rect);
    const columns=new Map<number,typeof guests>();for(const guest of guests){const key=Math.round(guest.x);columns.set(key,[...(columns.get(key)||[]),guest])}for(const column of columns.values()){if(!column.length)continue;const spine=Math.min(...column.map(g=>g.x-g.w/2))-18,bus=panel.y+panel.h/2+10;
     paths.push(`M ${target.x} ${target.y+target.h/2+5} V ${bus} H ${spine} V ${column.at(-1)!.y}`);
     for(const g of column)paths.push(`M ${spine} ${g.y} H ${g.x-g.w/2-5}`);
    }
   }}
   setDrawing({width:c.offsetWidth,height:c.offsetHeight,paths,keys});
  };measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);if(viewport.current)observer?.observe(viewport.current);if(canvas.current)observer?.observe(canvas.current);window.addEventListener('resize',measure);return()=>{observer?.disconnect();window.removeEventListener('resize',measure)};
 },[data,search,error,zoom,expanded,layout,columns,drives,docker]);
 const centered=useRef(false);
 useLayoutEffect(()=>{
  if(layout!=='tree'||!drawing.paths.length||centered.current||!viewport.current)return;
  const v=viewport.current;v.scrollLeft=Math.max(0,(v.scrollWidth-v.clientWidth)/2);centered.current=true;
 },[layout,drawing.width,drawing.paths.length]);
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
 const rootStatus=error||!nodes.length?'Unknown':online===nodes.length&&!data?.errors?.length&&!data?.clusterStatus?.some((r:any)=>r.type==='cluster'&&(r.quorate===0||r.quorate===false))?'Online':online?'Partial availability':'Nodes unavailable';
 return <div ref={shell} className={expanded?'topology-shell expanded':'topology-shell'}><Card className="cluster-topology"><div className="cluster-topology-toolbar"><div><h3>Cluster Topology</h3><p className="muted">Connected nodes and their reported virtual machines and containers.</p></div><label className="cluster-topology-search"><Search size={15}/><input aria-label="Search topology" placeholder="Search nodes, VMs or CTs…" value={search} onInput={e=>setSearch(e.currentTarget.value)} onChange={e=>setSearch(e.target.value)}/></label><div className="cluster-topology-controls"><button className="icon-btn" aria-label="Zoom out topology" disabled={zoom<=.25} onClick={()=>setZoom(v=>Math.max(.25,Number((v-.1).toFixed(2))))}><Minus size={16}/></button><button className="icon-btn" aria-label="Zoom in topology" disabled={zoom>=1.6} onClick={()=>setZoom(v=>Math.min(1.6,Number((v+.1).toFixed(2))))}><Plus size={16}/></button><button className="icon-btn" aria-label={expanded?'Collapse':'Expand'} title={expanded?'Collapse':'Expand'} aria-pressed={expanded} onClick={toggleExpanded}>{expanded?<Minimize size={16}/>:<Maximize size={16}/>}</button></div><button type="button" className="btn secondary small" aria-expanded={filters} onClick={()=>setFilters(value=>!value)}><Filter size={16}/> Layout</button></div>
 {filters&&<div className="topology-filters"><label>Layout<select aria-label="Layout" value={layout} onChange={event=>setLayout(event.target.value)}>{networkMap&&<option value="tree">Network Map</option>}<option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label><label>Guests per row<select aria-label="Guests per row" value={columns} onChange={event=>setColumns(Number(event.target.value))}>{networkMap&&<option value={2}>2</option>}<option value={4}>4</option><option value={5}>5</option></select></label></div>}
 <div className="cluster-topology-legend"><span><i className="online"/>Online / running</span><span><i className="stopped"/>Stopped / offline</span><span><i className="paused"/>Paused / suspended</span><span><i className="unknown"/>Unknown</span><span><Monitor size={14}/>VM</span><span><Box size={14}/>CT</span><label><input type="checkbox" role="switch" checked={drives} onChange={event=>setDrives(event.target.checked)}/> See drives</label><label><input type="checkbox" role="switch" checked={docker} onChange={event=>setDocker(event.target.checked)}/> See Docker</label></div>
 {error&&<p role="alert" className="error">Topology inventory unavailable: {error}</p>}
 {!!data?.errors?.length&&<p role="status" className="muted">Partial inventory. Available nodes and guests remain visible. {data.errors.join(' · ')}</p>}
 <div ref={viewport} data-layout={layout} style={{'--topology-columns':columns} as React.CSSProperties} onPointerDown={event=>{if(event.button!==0||(event.target as HTMLElement).closest('button,input,select,a'))return;const element=event.currentTarget;drag.current={x:event.clientX,y:event.clientY,left:element.scrollLeft,top:element.scrollTop};element.setPointerCapture(event.pointerId)}} onPointerMove={event=>{if(!drag.current)return;event.currentTarget.scrollLeft=drag.current.left-(event.clientX-drag.current.x);event.currentTarget.scrollTop=drag.current.top-(event.clientY-drag.current.y)}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} className="cluster-topology-viewport" role="region" aria-label="Cluster topology, scroll to explore" tabIndex={0}><div ref={canvas} className="cluster-topology-canvas" style={{zoom}}><svg className="cluster-topology-links" width={drawing.width} height={drawing.height} aria-hidden="true">{drawing.paths.map((path,index)=><path key={index} d={path}/>)}{layout==='tree'&&drawing.paths.map((path,index)=><g key={index}>{(['rx','tx'] as const).map(dir=>{const flow=flows.get(drawing.keys[index]);return flow&&flow.until>now&&flow[dir]?<path key={dir} className={'map-pulse '+dir} d={path}/>:null})}</g>)}</svg><div className="cluster-topology-root"><SystemIcon kind="cluster" status={rootStatus==='Online'?'online':rootStatus==='Partial availability'?'paused':'unknown'}/><strong>{all.name}</strong><small>{rootStatus}</small></div>
 {tree.nodes.length?<ul className="cluster-topology-nodes">{tree.nodes.map(node=><li key={node.name} className="cluster-topology-branch"><button data-flow={'node:'+node.name} className={`cluster-topology-node topology-${topologyState(node)}`} aria-label={`Inspect node ${node.name}`} onClick={()=>setSelected(node)}><SystemIcon kind="node" status={topologyState(node)}/><span className="topology-system-label"><b>{node.name}</b><small className="cluster-topology-ip">{ipv4([node.ip]).join(' · ')||'IP unavailable'}</small><small className="topology-system-state">{topologyState(node)}</small>{node.status!=='online'&&<small className="cluster-topology-warning">Proxmox connection unconfirmed</small>}</span></button>
 {node.guests.length?<ul className="cluster-topology-guests">{node.guests.map((guest:any)=>{const status=topologyState(guest,node.status),name=topologyGuestName(guest);return <li key={guest.key}><button data-flow={guest.key} className={`cluster-topology-guest kind-${guest.kind}`} aria-label={`Inspect ${guest.kind==='lxc'?'CT':'VM'} ${name} on ${node.name}`} onClick={()=>setSelected(guest)}><SystemIcon kind={guest.kind} status={status}/><span className="topology-system-label">{layout==='tree'&&<strong>{guest.id}</strong>}<b>{name}</b><small className="cluster-topology-ip">{status==='running'&&guest.addresses?.length?ipv4(guest.addresses).join(' · ')||'IP unavailable':'IP unavailable'}</small><small className="topology-system-state">{status}</small></span></button>{(drives||docker)&&<GuestConnections guest={guest} drives={drives} docker={docker}/>}</li>})}</ul>:<p className="cluster-topology-empty">{node.status!=='online'?'Guest inventory unavailable while node state is offline or unconfirmed.':data?.nodeCoverage?.some((r:any)=>r.node===node.name&&r.status!=='available')?'No guests reported; node inventory is incomplete.':'No guests reported for this node.'}</p>}</li>)}</ul>:<p className="cluster-topology-empty">{loading?<ReportLoading/>:search?'No nodes or guests match your search.':'No nodes reported. Connect Proxmox to discover nodes, VMs and CTs.'}</p>}

 </div></div>{layout==='tree'?<small className="muted map-flow-key"><i/> RX · <em/> TX · Pulses show recent node interface or guest counter activity. Dashed lines show hosting relationships.</small>:<small className="muted">Dashed lines show which node hosts each guest. Pan or zoom to explore. Lines do not represent measured network traffic. Offline nodes do not confirm guest state. Guest IPs are runtime readings, not connectivity tests; VMs need a running QEMU guest agent and API access.</small>}
 <Modal open={!!selected} title={inspect?.kind==='node'?`Node ${inspect.name}`:inspect?topologyGuestName(inspect):'Resource unavailable'} onClose={()=>setSelected(null)}>{inspect?<><dl className="network-inspector">{Object.entries({Name:inspect.name,Type:inspect.kind==='node'?'Proxmox node':inspect.kind==='lxc'?'LXC container':'Virtual machine',Node:inspect.node||inspect.name,ID:inspect.id,Status:state,'Connection evidence':inspect.kind==='node'?inspect.connectionReason:null,IP:inspect.kind==='node'?ipv4([inspect.ip]).join(', ')||'Not reported':state==='running'&&inspect.addresses?.length?ipv4(inspect.addresses).join(', ')||'Unavailable':'Unavailable', 'IP source':inspect.kind==='node'?'Proxmox node inventory':inspect.addressSource||'Runtime interfaces', 'IP reading':inspect.kind==='node'?null:inspect.addressSampledAt||inspect.addressStatus||'Not reported','CPU usage':state==='online'||state==='running'?topologyPercent(inspect.cpu):'Unavailable','Memory usage':state==='online'||state==='running'?topologyPercent(inspect.kind==='node'?inspect.memoryPercent??inspect.memory:inspect.memoryPercent):'Unavailable'}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{String(value??'Not reported')}</dd></div>)}</dl><Link className="btn secondary" to={`/proxmox?tab=${inspect.kind==='node'?'Nodes':inspect.kind==='lxc'?'LXC%20Containers':'Virtual%20Machines'}&node=${encodeURIComponent(inspect.node||inspect.name)}`}>View in Proxmox</Link></>:<p>This resource is no longer in the latest inventory. Close this panel and select a current resource.</p>}</Modal></Card></div>;
}
function SystemIcon({kind,status}:{kind:string;status:string}){
 const Icon=kind==='cluster'?Cloud:kind==='node'?Server:kind==='lxc'?Box:Monitor;
 return <span className={`topology-system-icon icon-${kind}`} aria-hidden="true"><Icon size={kind==='cluster'?60:kind==='node'?48:36}/><i className={`topology-dot ${status}`}/></span>;
}

function ipv4(addresses:any[]=[]){return addresses.filter((value:any)=>typeof value==='string'&&/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)&&value.split('.').every((part:string)=>Number(part)<=255))}
function GuestConnections({guest,drives,docker}:{guest:any;drives:boolean;docker:boolean}){
 return <div className="topology-attachments">{drives&&<GuestDrives guest={guest}/ >}{docker&&<GuestDocker guest={guest}/>}</div>;
}
function GuestDrives({guest}:{guest:any}){
 const inventory=useApi<any>('/storage/datasets',null);
 const rows=(inventory.error?[]:inventory.data?.resources||[]).filter((row:any)=>row.node===guest.node&&String(row.vmid)===String(guest.id)&&['CT Volume','VM Volume','CT Bind Mount'].includes(row.type));
 return <div className="topology-drives">{inventory.error?<small role="status">{inventory.error}</small>:inventory.loading&&!inventory.data?<ReportLoading/>:rows.length?rows.map((row:any)=><div className="topology-attachment" key={row.id}><HardDrive size={15}/><span translate="no">{row.pool} · {row.disk||row.resourceId}</span></div>):<small>No drives reported</small>}</div>;
}
function GuestDocker({guest}:{guest:any}){
 const inventory=useApi<any>('/monitoring',null);
 const hosts=(inventory.error?[]:inventory.data?.dockerFleet?.hosts||[]).filter((host:any)=>host.node===guest.node&&host.id?.endsWith(':'+guest.kind+'/'+guest.id));
 const containers=hosts.flatMap((host:any)=>['reachable','partial'].includes(host.status)?host.inventory?.containers||[]:[]);
 return <div className="topology-docker">{inventory.error?<small role="status">{inventory.error}</small>:inventory.loading&&!inventory.data?<ReportLoading/>:containers.length?containers.map((container:any)=><div className="topology-attachment" key={container.id}><Box size={15}/><span translate="no">{container.name}</span><small translate="no">{container.status}</small></div>):<small>No containers reported</small>}</div>;
}
