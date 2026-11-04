import {useEffect,useRef,useState} from 'react';
import {Check,ChevronDown,Globe} from 'lucide-react';
import {languages,setLocale,useLocale,type Locale} from '../i18n/locale';
export default function LanguageSelector(){
 const locale=useLocale(),selected=languages.find(language=>language.id===locale)!;
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const close=()=>{setOpen(false);trigger.current?.focus()};
 useEffect(()=>{if(!open)return;root.current?.querySelector<HTMLButtonElement>(`[data-locale="${locale}"]`)?.focus();const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)},[open,locale]);
 const choose=async(id:Locale)=>{if(busy)return;setBusy(true);setError('');try{await setLocale(id);close()}catch{setError('The language pack could not be loaded. Please try again.')}finally{setBusy(false);window.setTimeout(()=>trigger.current?.focus(),0)}};
 return <section className="card settings-overview-card language-settings" aria-labelledby="interface-language-title">
 <div className="settings-card-heading"><span><Globe size={23}/></span><div><h2 id="interface-language-title">Interface Language</h2><p>Choose the language used across pages, menus, dialogs and notifications.</p></div></div>
 <div className="language-picker" ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false)}} onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();if(!open){setOpen(true);return}const items=[...root.current!.querySelectorAll<HTMLButtonElement>('[role=option]')],current=items.indexOf(document.activeElement as HTMLButtonElement),index=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?(current+1)%items.length:current<0?items.length-1:(current-1+items.length)%items.length;items[index]?.focus()}
 }}>
 <label htmlFor="interface-language">Language</label><button ref={trigger} id="interface-language" type="button" className="language-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={open?'interface-language-options':undefined} disabled={busy} aria-busy={busy} onClick={()=>setOpen(!open)}><img src={`/flags/${selected.flag}.svg`} alt="" width="28" height="21"/><span translate="no" lang={selected.id}>{selected.nativeName}</span><small>{selected.country}</small><ChevronDown size={18}/></button>
 {open&&<div id="interface-language-options" className="language-options" role="listbox" aria-label="Interface language">{languages.map(language=><button key={language.id} type="button" role="option" aria-selected={language.id===locale} data-locale={language.id} tabIndex={language.id===locale?0:-1} disabled={busy} onClick={()=>void choose(language.id)}><img src={`/flags/${language.flag}.svg`} alt="" width="28" height="21"/><span translate="no" lang={language.id}>{language.nativeName}</span><small>{language.country}</small>{language.id===locale&&<Check size={16}/>}</button>)}</div>}
 </div><small className="settings-note">Language packs are included with i-Clusters. Your choice is saved in this browser. Resource names, addresses, paths and terminal output keep their original values.</small>{error&&<p role="alert" className="error">{error}</p>}
 </section>;
}
