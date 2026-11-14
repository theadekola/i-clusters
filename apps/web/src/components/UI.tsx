import {PageRefreshContext} from './PageRefresh';
import {createPortal} from 'react-dom';
import BrandIcon from './BrandIcon';
import {lockPageScroll} from '../scroll-lock';
import {cardValue} from './ReportLoading';
import PageIcon, {pageIconForTitle} from './PageIcon';
import React, { useEffect, useState, useRef, useId } from 'react';
import { CheckCircle2, X } from 'lucide-react';

export function PageHeader({title, subtitle, actions, middle, className=''}:{title:string; subtitle:string; actions?:React.ReactNode; middle?:React.ReactNode; className?:string}) {
  return <div className={`page-header ${className}`}><div><h1>{/docker|compose|container/i.test(title)?<BrandIcon brand="docker" size={27}/>:<PageIcon name={pageIconForTitle(title)} className="page-title-icon"/>}{title}</h1><p>{subtitle}</p></div>{middle}<div className="header-actions">{actions}</div></div>
}

export function Card({children, className=''}:{children:React.ReactNode; className?:string}) {
  return <div className={`card ${className}`}>{children}</div>
}

export function Stat({label,value,sub,icon,reading}:{label:string;value:string|number;sub?:string;icon?:React.ReactNode;reading?:{loading?:boolean;error?:string;data?:any}}) {
  return <Card className="stat"><div><div className="muted small">{label}</div><div className="stat-value">{reading?cardValue(value,reading):value}</div>{sub && <div className="small positive">{sub}</div>}</div>{icon && <div className="stat-icon">{icon}</div>}</Card>
}

export function Badge({children,tone='green'}:{children:React.ReactNode;tone?:'green'|'red'|'yellow'|'blue'|'purple'|'gray'}) {
  return <span className={`badge ${tone}`}>{children}</span>
}

export function Button({children,onClick,variant='primary',disabled=false}:{children:React.ReactNode;onClick?:()=>void;variant?:'primary'|'secondary'|'danger'|'ghost';disabled?:boolean}) {
  return <button className={`btn ${variant}`} onClick={onClick} disabled={disabled}>{children}</button>
}

const modalLayers:HTMLDivElement[]=[];
let nextModalLayer=1000;
export function Modal({open,onClose,title,children,success,closeDisabled=false,portal=false}:{open:boolean;onClose:()=>void;title:string;children:React.ReactNode;success?:string;closeDisabled?:boolean;portal?:boolean}) {
  const dialog=useRef<HTMLDivElement>(null),close=useRef(onClose),titleId=useId();close.current=()=>{if(!closeDisabled)onClose()};
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null,unlock=lockPageScroll(),element=dialog.current!;
    modalLayers.push(element);if(element.parentElement)element.parentElement.style.zIndex=String(++nextModalLayer);
    const focusable=()=>Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"],summary')).filter(control=>{
      if(control.closest('[hidden],[inert]')||control.getAttribute('type')==='hidden')return false;
      const closed=control.closest('details:not([open])');
      return !closed||(control===closed.querySelector(':scope > summary')&&!closed.parentElement?.closest('details:not([open])'));
    });
    const key=(event:KeyboardEvent)=>{
      if(modalLayers.at(-1)!==dialog.current)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();}
      if(event.key==='Tab'){const controls=focusable(),first=controls[0],last=controls.at(-1);if(!first){event.preventDefault();dialog.current?.focus();return;}if(event.shiftKey&&(document.activeElement===first||!dialog.current?.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!dialog.current?.contains(document.activeElement))){event.preventDefault();first.focus();}}
    };
    (focusable()[0]||dialog.current)?.focus({preventScroll:true});document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);const layer=modalLayers.indexOf(element);if(layer>=0)modalLayers.splice(layer,1);if(!modalLayers.length)nextModalLayer=1000;unlock();if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[open]);
  if(!open) return null;
  const backdrop=<div className="modal-backdrop" onMouseDown={()=>close.current()}><div ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onMouseDown={e=>e.stopPropagation()}>
    <div className="modal-head"><h3 id={titleId}>{title}</h3><button type="button" className="icon-btn" aria-label="Close dialog" disabled={closeDisabled} onClick={()=>close.current()}><X size={18}/></button></div>{success?<ConnectionSuccess message={success} onDone={()=>close.current()}/>:children}
  </div></div>;
  const content=<PageRefreshContext.Provider value={null}>{backdrop}</PageRefreshContext.Provider>;
  return portal?createPortal(content,document.body):content;
}

export function usePopupSuccess(open:boolean){
 const [success,setSuccess]=useState('');
 useEffect(()=>{if(!open)setSuccess('')},[open]);
 return [success,setSuccess] as const;
}

export const CONNECTION_SUCCESS_DELAY=2000;
export function ConnectionSuccess({message,onDone}:{message:string;onDone:()=>void}){
 const done=useRef(onDone),notice=useRef<HTMLDivElement>(null);done.current=onDone;
 useEffect(()=>{const timer=setTimeout(()=>done.current(),CONNECTION_SUCCESS_DELAY);notice.current?.focus({preventScroll:true});const modal=notice.current?.closest('.modal');if(modal)modal.scrollTop=0;return()=>clearTimeout(timer)},[message]);
 return <div ref={notice} tabIndex={-1} className="connection-success" role="status" aria-live="polite"><CheckCircle2 size={32} aria-hidden="true"/><strong>{message}</strong><small>Closing automatically…</small></div>;
}

export function tabKeys(event:React.KeyboardEvent<HTMLElement>){
 const target=event.target as HTMLElement,group=event.currentTarget;
 const tabs=Array.from(group.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
 const index=tabs.indexOf(target as HTMLButtonElement);
 if(index<0||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 event.preventDefault();
 const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
 const tab=tabs[next],label=group.getAttribute('aria-label');
 // Route changes may replace the entire tab strip after the key event completes.
 const observer=new MutationObserver(()=>{
  if(tab.isConnected)return;
  const replacement=Array.from(document.querySelectorAll('[role="tablist"]')).find(row=>row.getAttribute('aria-label')===label);
  const selected=replacement?.querySelector<HTMLElement>('[aria-selected="true"]');
  if(selected){if(document.activeElement===document.body)selected.focus();observer.disconnect();clearTimeout(timer)}
 });
 observer.observe(document.body,{subtree:true,childList:true});
 const timer=window.setTimeout(()=>observer.disconnect(),1000);
 tab.focus();tab.click();
}
export function Tabs({items,active,onChange,label,controls}:{items:string[];active:string;onChange:(v:string)=>void;label?:string;controls?:string}) {
  return <div className="tabs" role="tablist" aria-label={label||items[0]} onKeyDown={tabKeys}>{items.map(i=><button key={i} type="button" role="tab" tabIndex={active===i?0:-1} aria-selected={active===i} aria-controls={controls} className={active===i?'tab active':'tab'} onClick={()=>onChange(i)}>{i}</button>)}</div>
}

export function Toast({message,onDone}:{message:string;onDone:()=>void}) {
  useEffect(()=>{const t=setTimeout(onDone,2500);return()=>clearTimeout(t)},[message]);
  return <div className="toast">{message}</div>
}

export function Progress({value}:{value:number}) {
  return <div className="progress"><div style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div>
}
