import {useEffect,useRef,useState} from 'react';
import {Check,CircleUserRound,LogOut,Monitor,Moon,Sun} from 'lucide-react';
import {loadAppearance,saveAppearance} from '../appearance';

const modes=[['light','Light',Sun],['dark','Dark',Moon],['system','System',Monitor]] as const;

export default function SidebarAccount({labels,openAccount,signOut}:{labels:boolean;openAccount:()=>void;signOut:()=>void}){
 const [menu,setMenu]=useState<'theme'|'account'|null>(null);
 const [mode,setMode]=useState(()=>loadAppearance().theme);
 const [error,setError]=useState('');
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement|null>(null);
 const Icon=modes.find(([id])=>id===mode)![2];
 useEffect(()=>{
  const sync=()=>setMode(loadAppearance().theme);
  window.addEventListener('iclusters-appearance',sync);
  return ()=>window.removeEventListener('iclusters-appearance',sync);
 },[]);
 useEffect(()=>{
  if(!menu)return;
  root.current?.querySelector<HTMLButtonElement>('.sidebar-popover button')?.focus();
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setMenu(null)};
  document.addEventListener('pointerdown',outside);return ()=>document.removeEventListener('pointerdown',outside);
 },[menu]);
 function toggle(name:'theme'|'account',button:HTMLButtonElement){trigger.current=button;setMenu(menu===name?null:name);setError('')}
 function close(){setMenu(null);trigger.current?.focus()}
 return <div ref={root} className="sidebar-account" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setMenu(null)}} onKeyDown={e=>{
  if(menu&&e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}
  if(menu&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
   const items=Array.from(root.current!.querySelectorAll<HTMLButtonElement>('.sidebar-popover button'));if(!items.length)return;
   e.preventDefault();const i=items.indexOf(document.activeElement as HTMLButtonElement);
   items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();
  }
 }}>
 <button className="profile-trigger" aria-label="User profile" title="User profile" aria-expanded={menu==='account'} aria-haspopup="menu" onClick={e=>toggle('account',e.currentTarget)}><CircleUserRound/>{labels&&'Profile'}</button>
 <button className="profile-trigger" aria-label="Theme mode" title="Theme mode" aria-expanded={menu==='theme'} aria-haspopup="menu" onClick={e=>toggle('theme',e.currentTarget)}><Icon/>{labels&&'Theme mode'}</button>
 {menu&&<div className="sidebar-popover" role="menu" aria-label={menu==='theme'?'Theme mode':'User profile'}>
 {menu==='theme'?modes.map(([id,label,Glyph])=><button role="menuitemradio" key={id} aria-checked={mode===id} onClick={()=>{try{saveAppearance({...loadAppearance(),theme:id});close()}catch(err){setError(String(err))}}}><Glyph size={18}/>{label}{mode===id&&<Check size={16}/>}</button>):<><button role="menuitem" onClick={()=>{close();openAccount()}}><CircleUserRound size={18}/>View account</button><button role="menuitem" onClick={()=>{close();signOut()}}><LogOut size={18}/>Sign out</button></>}
 {error&&<p role="alert">{error}</p>}</div>}
 </div>
}
