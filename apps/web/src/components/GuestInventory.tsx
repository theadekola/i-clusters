import {useLayoutEffect,useRef} from 'react';
import {useLocation,useNavigate,useSearchParams} from 'react-router-dom';
import {Terminal} from 'lucide-react';
import {Badge} from './UI';
import './guest-inventory.css';

type Guest={id:string|number;name:string;node:string;status:string};
type Kind='vm'|'lxc';
let lastInventory:{entry:string;kind:Kind;top:number;tableTop:number;guest:string}|undefined;

export function useGuestInventory(kind:Kind,ready:boolean){
 const [params,setParams]=useSearchParams(),navigate=useNavigate(),location=useLocation();
 const listRef=useRef<HTMLDivElement>(null);
 const latest=useRef(params);latest.current=params;
 const update=(changes:Record<string,string>)=>{
  const next=new URLSearchParams(latest.current);
  for(const [key,value] of Object.entries(changes)){if(value)next.set(key,value);else next.delete(key)}
  latest.current=next;
  setParams(next,{replace:true,preventScrollReset:true});
 };
 const restored=lastInventory?.entry===location.key&&lastInventory.kind===kind?lastInventory:undefined;
 const selected=restored?.guest||params.get('guest')||'';
 useLayoutEffect(()=>{
  if(!ready||!restored)return;
  if(listRef.current)listRef.current.scrollTop=restored.tableTop;
  window.scrollTo(0,restored.top);
 },[ready,restored]);
 const openShell=(guest:Guest)=>{
  lastInventory={entry:location.key,kind,top:window.scrollY,tableTop:listRef.current?.scrollTop||0,guest:String(guest.id)};
  navigate('/tools/shell?target='+encodeURIComponent(kind+':'+guest.node+':'+guest.id));
 };
 const requestedPage=Number(params.get('page'));
 const page=Number.isSafeInteger(requestedPage)&&requestedPage>0?requestedPage:1;
 const size=Number(params.get('perPage'));
 const pageSize=[10,25,50].includes(size)?size:12;
 return {listRef,openShell,selected,setSelected:(id:string)=>update({guest:String(id)}),
  search:params.get('search')||'',setSearch:(search:string)=>update({search,page:''}),
  node:params.get('inventoryNode')||'all',setNode:(node:string)=>update({inventoryNode:node==='all'?'':node,page:'',guest:''}),
  status:params.get('status')||'all',setStatus:(status:string)=>update({status:status==='all'?'':status,page:''}),
  layout:params.get('layout')==='grid'?'grid':'list',setLayout:(layout:string)=>update({layout}),
  page,setPage:(page:number)=>update({page:String(page)}),rowsPerPage:pageSize,setRowsPerPage:(size:number)=>update({perPage:String(size),page:''})};
}

export function GuestStatus({status}:{status:string}){
 const ref=useRef<HTMLSpanElement>(null),previous=useRef(status);
 useLayoutEffect(()=>{
  if(previous.current===status)return;
  previous.current=status;
  if(window.matchMedia('(prefers-reduced-motion: no-preference)').matches){
   const pulse=ref.current?.animate?.([{outlineColor:'currentColor'},{outlineColor:'transparent'}],{duration:600});
   return ()=>pulse?.cancel();
  }
 },[status]);
 return <span className="guest-status" ref={ref}><Badge tone={status==='running'?'green':status==='stopped'?'red':'gray'}>{status||'Unknown'}</Badge></span>;
}

export function MobileGuestList({guests,kind,selected,select,openShell,canShell}:{guests:Guest[];kind:Kind;selected:string;select:(id:string)=>void;openShell:(guest:Guest)=>void;canShell:boolean}){
 return <div className="mobile-guest-list">{guests.map(guest=><div className="mobile-guest-row" key={guest.id}>
  <button className="guest-identity" aria-pressed={selected===String(guest.id)} onClick={()=>select(String(guest.id))}>
   <span><b>{guest.name}</b><small>{kind==='vm'?'VM':'CT'} {guest.id} · {guest.node}</small></span><GuestStatus status={guest.status}/>
  </button>
  {canShell&&<button className="icon-btn" aria-label="Shell" aria-description={guest.name} title="Shell" onClick={()=>openShell(guest)}><Terminal size={18}/></button>}
 </div>)}</div>;
}
