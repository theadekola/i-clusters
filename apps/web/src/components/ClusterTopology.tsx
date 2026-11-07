import {useState,useLayoutEffect,useRef} from 'react';
import {Link} from 'react-router-dom';
import {Cloud,Server,Monitor,Box,Search,Minus,Plus,Scan,Minimize,Maximize} from 'lucide-react';
import {Card,Modal} from './UI';
import ReportLoading from './ReportLoading';
import {clusterTopology,topologyState,topologyPercent,topologyGuestName} from '../cluster-topology';
export default function ClusterTopology({data,loading,error}:{data:any,loading:boolean,error?:string}){
 const [search,setSearch]=useState(''),[zoom,setZoom]=useState(1),[selected,setSelected]=useState<any>(null);
 const [expanded,setExpanded]=useState(false);
 const shell=useRef<HTMLDivElement>(null);
 async function toggleExpanded(){
  if(document.fullscreenElement===shell.current){await document.exitFullscreen();return}
  if(expanded){setExpanded(false);return}
  try{await shell.current!.requestFullscreen()}catch{setExpanded(true)}
 }
 useLayoutEffect(()=>{
  const sync=()=>setExpanded(document.fullscreenElement===shell.current);
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!selected&&!document.fullscreenElement)setExpanded(false)};
  document.addEventListener('fullscreenchange',sync);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('fullscreenchange',sync);document.removeEventListener('keydown',escape)};
 },[selected]);
 const viewport=useRef<HTMLDivElement>(null),canvas=useRef<HTMLDivElement>(null),[fit,setFit]=useState(1);
 const [drawing,setDrawing]=useState<{width:number;height:number;paths:string[]}>({width:0,height:0,paths:[]});
 useLayoutEffect(()=>{
  const measure=()=>{const v=viewport.current,c=canvas.current;if(!v||!c||!c.offsetWidth)return;
   setFit(Math.min(1,(v.clientWidth-24)/c.offsetWidth,(v.clientHeight-24)/c.offsetHeight));
   const bounds=c.getBoundingClientRect(),scale=bounds.width/c.offsetWidth;if(!scale)return;
   const rect=(el:Element)=>{const r=el.getBoundingClientRect();return {x:(r.left-bounds.left+r.width/2)/scale,y:(r.top-bounds.top+r.height/2)/scale,w:r.width/scale,h:r.height/scale}};
   const root=c.querySelector('.cluster-topology-root'),paths:string[]=[],list=c.querySelector('.cluster-topology-nodes'),stacked=list&&getComputedStyle(list).flexDirection==='column';
   if(root){const start=rect(root);for(const branch of c.querySelectorAll('.cluster-topology-branch')){
    const icon=branch.querySelector('.cluster-topology-node .topology-system-icon'),node=branch.querySelector('.cluster-topology-node');if(!icon||!node)continue;
    const target=rect(icon),panel=rect(node),join=target.y-target.h/2-24;
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
   setDrawing({width:c.offsetWidth,height:c.offsetHeight,paths});
  };measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);if(viewport.current)observer?.observe(viewport.current);if(canvas.current)observer?.observe(canvas.current);window.addEventListener('resize',measure);return()=>{observer?.disconnect();window.removeEventListener('resize',measure)};
 },[data,search,error,zoom,expanded]);
 const current=error?{...data,nodes:(data?.nodes||[]).map((n:any)=>({...n,status:'unknown'})),vms:(data?.vms||[]).map((g:any)=>({...g,nodeAvailable:false})),lxc:(data?.lxc||[]).map((g:any)=>({...g,nodeAvailable:false}))}:data;
 const tree=clusterTopology(current,search),all=clusterTopology(current),nodes=all.nodes,online=nodes.filter(n=>n.status==='online').length;
 const inspect=selected?.kind==='node'?nodes.find(n=>n.name===selected.name):all.nodes.flatMap(n=>n.guests).find(g=>g.key===selected?.key);
 const state=inspect?topologyState(inspect,inspect.kind==='node'?undefined:nodes.find(n=>n.name===inspect.node)?.status):'unknown';
 const rootStatus=error||!nodes.length?'Unknown':online===nodes.length&&!data?.errors?.length&&!data?.clusterStatus?.some((r:any)=>r.type==='cluster'&&(r.quorate===0||r.quorate===false))?'Online':online?'Partial availability':'Nodes unavailable';
 return <div ref={shell} className={expanded?'topology-shell expanded':'topology-shell'}><Card className="cluster-topology"><div className="cluster-topology-toolbar"><div><h3>Cluster Topology</h3><p className="muted">Connected nodes and their reported virtual machines and containers.</p></div><label className="cluster-topology-search"><Search size={15}/><input aria-label="Search topology" placeholder="Search nodes, VMs or CTs…" value={search} onInput={e=>setSearch(e.currentTarget.value)} onChange={e=>setSearch(e.target.value)}/></label><div className="cluster-topology-controls"><button className="icon-btn" aria-label="Zoom out topology" disabled={zoom<=.25} onClick={()=>setZoom(v=>Math.max(.25,Number((v-.1).toFixed(2))))}><Minus size={16}/></button><button className="icon-btn" aria-label="Zoom in topology" disabled={zoom>=1.6} onClick={()=>setZoom(v=>Math.min(1.6,Number((v+.1).toFixed(2))))}><Plus size={16}/></button><button className="icon-btn" aria-label="Reset topology zoom" title="Fit the entire topology" onClick={()=>setZoom(fit)}><Scan size={16}/></button><button className="icon-btn" aria-label={expanded?'Collapse':'Expand'} title={expanded?'Collapse':'Expand'} aria-pressed={expanded} onClick={toggleExpanded}>{expanded?<Minimize size={16}/>:<Maximize size={16}/>}</button></div></div>
 <div className="cluster-topology-legend"><span><i className="online"/>Online / running</span><span><i className="stopped"/>Stopped / offline</span><span><i className="paused"/>Paused / suspended</span><span><i className="unknown"/>Unknown</span><span><Monitor size={14}/>VM</span><span><Box size={14}/>CT</span></div>
 {error&&<p role="alert" className="error">Topology inventory unavailable: {error}</p>}
 {!!data?.errors?.length&&<p role="status" className="muted">Partial inventory. Available nodes and guests remain visible. {data.errors.join(' · ')}</p>}
 <div ref={viewport} className="cluster-topology-viewport" role="region" aria-label="Cluster topology, scroll to explore" tabIndex={0}><div ref={canvas} className="cluster-topology-canvas" style={{zoom}}><svg className="cluster-topology-links" width={drawing.width} height={drawing.height} aria-hidden="true">{drawing.paths.map((path,index)=><path key={index} d={path}/>)}</svg><div className="cluster-topology-root"><SystemIcon kind="cluster" status={rootStatus==='Online'?'online':rootStatus==='Partial availability'?'paused':'unknown'}/><strong>{all.name}</strong><small>{rootStatus}</small></div>
 {tree.nodes.length?<ul className="cluster-topology-nodes">{tree.nodes.map(node=><li key={node.name} className="cluster-topology-branch"><button className={`cluster-topology-node topology-${topologyState(node)}`} aria-label={`Inspect node ${node.name}`} onClick={()=>setSelected(node)}><SystemIcon kind="node" status={topologyState(node)}/><span className="topology-system-label"><b>{node.name}</b><small className="cluster-topology-ip">{node.ip||'IP unavailable'}</small><small className="topology-system-state">{topologyState(node)}</small>{node.status!=='online'&&<small className="cluster-topology-warning">Proxmox connection unconfirmed</small>}</span></button>
 {node.guests.length?<ul className="cluster-topology-guests">{node.guests.map((guest:any)=>{const status=topologyState(guest,node.status),name=topologyGuestName(guest);return <li key={guest.key}><button className={`cluster-topology-guest kind-${guest.kind}`} aria-label={`Inspect ${guest.kind==='lxc'?'CT':'VM'} ${name} on ${node.name}`} onClick={()=>setSelected(guest)}><SystemIcon kind={guest.kind} status={status}/><span className="topology-system-label"><b>{name}</b><small className="cluster-topology-ip">{status==='running'&&guest.addresses?.length?guest.addresses.join(' · '):'IP unavailable'}</small><small className="topology-system-state">{status}</small></span></button></li>})}</ul>:<p className="cluster-topology-empty">{node.status!=='online'?'Guest inventory unavailable while node state is offline or unconfirmed.':data?.nodeCoverage?.some((r:any)=>r.node===node.name&&r.status!=='available')?'No guests reported; node inventory is incomplete.':'No guests reported for this node.'}</p>}</li>)}</ul>:<p className="cluster-topology-empty">{loading?<ReportLoading/>:search?'No nodes or guests match your search.':'No nodes reported. Connect Proxmox to discover nodes, VMs and CTs.'}</p>}

 </div></div><small className="muted">Dashed lines show which node hosts each guest. Pan or zoom to explore; use Fit to see the whole map. Lines do not represent measured network traffic. Offline nodes do not confirm guest state. Guest IPs are runtime readings, not connectivity tests; VMs need a running QEMU guest agent and API access.</small>
 <Modal open={!!selected} title={inspect?.kind==='node'?`Node ${inspect.name}`:inspect?topologyGuestName(inspect):'Resource unavailable'} onClose={()=>setSelected(null)}>{inspect?<><dl className="network-inspector">{Object.entries({Name:inspect.name,Type:inspect.kind==='node'?'Proxmox node':inspect.kind==='lxc'?'LXC container':'Virtual machine',Node:inspect.node||inspect.name,ID:inspect.id,Status:state,'Connection evidence':inspect.kind==='node'?inspect.connectionReason:null,IP:inspect.kind==='node'?inspect.ip||'Not reported':state==='running'&&inspect.addresses?.length?inspect.addresses.join(', '):'Unavailable', 'IP source':inspect.kind==='node'?'Proxmox node inventory':inspect.addressSource||'Runtime interfaces', 'IP reading':inspect.kind==='node'?null:inspect.addressSampledAt||inspect.addressStatus||'Not reported','CPU usage':state==='online'||state==='running'?topologyPercent(inspect.cpu):'Unavailable','Memory usage':state==='online'||state==='running'?topologyPercent(inspect.kind==='node'?inspect.memoryPercent??inspect.memory:inspect.memoryPercent):'Unavailable'}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{String(value??'Not reported')}</dd></div>)}</dl><Link className="btn secondary" to={`/proxmox?tab=${inspect.kind==='node'?'Nodes':inspect.kind==='lxc'?'LXC%20Containers':'Virtual%20Machines'}&node=${encodeURIComponent(inspect.node||inspect.name)}`}>View in Proxmox</Link></>:<p>This resource is no longer in the latest inventory. Close this panel and select a current resource.</p>}</Modal></Card></div>;
}
function SystemIcon({kind,status}:{kind:string;status:string}){
 const Icon=kind==='cluster'?Cloud:kind==='node'?Server:kind==='lxc'?Box:Monitor;
 return <span className={`topology-system-icon icon-${kind}`} aria-hidden="true"><Icon size={kind==='cluster'?60:kind==='node'?48:36}/><i className={`topology-dot ${status}`}/></span>;
}
