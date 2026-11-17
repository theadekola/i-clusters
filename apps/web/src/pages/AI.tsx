import {Fragment,useRef,useState,useEffect,type FormEvent} from 'react';
import {Activity,Boxes,Database,History,MessageSquare,Network,MoreHorizontal,Pin,Plus,Send,Settings,Sparkles} from 'lucide-react';
import {api} from '../api';
import {useApi} from '../hooks';
import {useSearchParams} from 'react-router-dom';
import ConfigurationDialog from '../components/ConfigurationDialog';
import SavedAssistant from '../components/SavedAssistant';
import {Modal} from '../components/UI';
import {confirmChoice} from '../confirm-choice';
import './assistant.css';

type Exchange={id:number;question:string;answer?:string;error?:string;mode?:string};
type Thread={id:number;title?:string;pinned?:boolean;rows:Exchange[]};
type Chats={active:number;threads:Thread[]};
const historyKey='iclusters_ai_conversation';
function previous(scope:string):Chats{
 const fresh={active:0,threads:[{id:0,rows:[]}]};
 try{
  const saved=JSON.parse(sessionStorage.getItem(historyKey)||'null');
  if(saved?.scope!==scope)return fresh;
  if(Array.isArray(saved.threads)&&saved.threads.length&&saved.threads.every((t:Thread)=>Array.isArray(t.rows)))
   return {threads:saved.threads,active:saved.threads.some((t:Thread)=>t.id===saved.active)?saved.active:saved.threads[0].id};
  if(Array.isArray(saved.rows))return {active:0,threads:[{id:0,rows:saved.rows.slice(-12)}]};
 }catch{}
 return fresh;
}
const starters=[
 {icon:Activity,text:'Summarize cluster health'},
 {icon:Boxes,text:'Review VM and container status'},
 {icon:Database,text:'Review backup activity'},
 {icon:Network,text:'Explain my cluster topology'}
];
export default function AI(){
 const session=useApi<any>('/auth/me',null),identity=session.data?.user;
 const scope=identity?JSON.stringify([identity.sub||identity.id,identity.sid,window.location.pathname.split('/ai')[0]]):'';
 return <Conversation key={scope} scope={scope} owner={identity?.role==='owner'} name={identity?.name||identity?.username}/>;
}
function Conversation({scope,owner,name}:{scope:string;owner:boolean;name?:string}){
 const [params,setParams]=useSearchParams();
 const configure=(open:boolean)=>setParams(previous=>{const next=new URLSearchParams(previous);if(open)next.set('setup','ai');else next.delete('setup');return next},{replace:!open});
 const [chats,setChats]=useState(()=>previous(scope)),[draft,setDraft]=useState(''),[sidebar,setSidebar]=useState(false);
 const [saved,setSaved]=useState(false),[menu,setMenu]=useState<number|null>(null),[rename,setRename]=useState<number|null>(null),[title,setTitle]=useState(''),[shared,setShared]=useState('');
 useEffect(()=>{
  if(menu===null)return;
  const dismiss=(e:PointerEvent)=>{if(!(e.target as Element).closest('.chat-history-row'))setMenu(null)};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenu(null)};
  document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);
  return ()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape)};
 },[menu]);
 async function remove(t:Thread){
  setMenu(null);
  if(!await confirmChoice('Delete this chat?'))return;
  setChats(old=>{
   const remaining=old.threads.filter(item=>item.id!==t.id);
   if(!remaining.length)remaining.push({id:Date.now(),rows:[]});
   return {active:old.active===t.id?remaining[0].id:old.active,threads:remaining};
  });
  if(chats.active===t.id)setDraft('');
 }
 function edit(id:number,patch:Partial<Thread>){setChats(old=>({...old,threads:old.threads.map(t=>t.id===id?{...t,...patch}:t)}))}
 const [busy,setBusy]=useState<number|null>(null),sending=useRef(false),end=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const thread=chats.threads.find(t=>t.id===chats.active)!,rows=thread.rows;
 useEffect(()=>{if(scope)try{sessionStorage.setItem(historyKey,JSON.stringify({scope,...chats}))}catch{}},[scope,chats]);
 useEffect(()=>{const list=end.current;if(list)list.scrollTop=list.scrollHeight},[rows,busy]);
 function updateRows(id:number,update:(old:Exchange[])=>Exchange[]){
  setChats(old=>({...old,threads:old.threads.map(t=>t.id===id?{...t,title:t.title||t.rows[0]?.question,rows:update(t.rows)}:t)}));
 }
 function select(id:number){setMenu(null);setChats(old=>({...old,active:id}));setSidebar(false);setDraft('')}
 function newChat(){
  const empty=chats.threads.find(t=>!t.rows.length);
  if(empty){select(empty.id);return}
  const id=Date.now();setChats(old=>({active:id,threads:[{id,rows:[]},...old.threads].slice(0,20)}));setDraft('');setSidebar(false);input.current?.focus();
 }
 async function request(exchange:Exchange){
  if(sending.current)return;
  sending.current=true;setBusy(exchange.id);
  const patch=(value:Partial<Exchange>)=>updateRows(thread.id,list=>list.map(r=>r.id===exchange.id?{...r,...value}:r));
  patch({error:undefined});
  try{
   const history=rows.filter(row=>row.id<exchange.id&&row.answer).slice(-4).map(row=>({question:row.question.slice(0,2000),answer:row.answer!.slice(0,4000)}));
   const response=await api('/ai/chat',{method:'POST',body:JSON.stringify({message:exchange.question,history})});
   patch({answer:response.result.answer,mode:response.result.mode,error:response.result.providerError});
  }catch(e:any){patch({error:e.message})}finally{sending.current=false;setBusy(null)}
 }
 function send(event:FormEvent){
  event.preventDefault();if(!draft.trim()||sending.current||!scope)return;
  const exchange={id:Math.max(Date.now(),...rows.map(r=>r.id+1)),question:draft.trim()};
  updateRows(thread.id,list=>[...list.slice(-11),exchange]);setDraft('');void request(exchange);
 }
 return <section className="assistant-workspace">
  <button className="btn secondary history-toggle" aria-expanded={sidebar} onClick={()=>setSidebar(!sidebar)}><History size={18}/>Chat history</button>
  <aside className={'assistant-history'+(sidebar?' expanded':'')}>
   <button className="btn primary" onClick={newChat}><Plus size={17}/>New chat</button>
   <p className="assistant-history-label">Chat history</p><nav aria-label="Chat history">{chats.threads.filter(t=>t.rows.length).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)).map(t=>{
    const label=t.title||t.rows[0].question;
    return <div key={t.id} className="chat-history-row"><div className="chat-history-line"><button title={label} aria-current={t.id===thread.id?'page':undefined} onClick={()=>select(t.id)}>{t.pinned?<Pin size={15}/>:<MessageSquare size={15}/>}<span>{label}</span></button>
     <button className="chat-options" aria-label={`Chat options for ${label}`} aria-expanded={menu===t.id} onClick={()=>setMenu(menu===t.id?null:t.id)}><MoreHorizontal size={18}/></button></div>
     {menu===t.id&&<div className="chat-options-list">
      <button onClick={()=>{setRename(t.id);setTitle(label);setMenu(null)}}>Rename</button>
      <button onClick={()=>{edit(t.id,{pinned:!t.pinned});setMenu(null)}}>{t.pinned?'Unpin':'Pin'}</button>
      <button onClick={()=>{setMenu(null);setShared([label,...t.rows.flatMap(r=>[r.question,r.answer||r.error||''])].join('\n\n'))}}>Share</button>
      <button onClick={()=>void remove(t)}>Delete</button>
     </div>}</div>
   })}</nav>
   {owner&&<button className="btn secondary" onClick={()=>setSaved(true)}>Saved Assistant</button>}
   {owner&&<button className="btn secondary history-config" onClick={()=>configure(true)}><Settings size={16}/>Configure AI Assistant</button>}
  </aside>
  <div className={'assistant-main '+(rows.length?'has-messages':'welcome')}>
   {rows.length>0&&<h1 className="assistant-thread-title">{thread.title||rows[0].question}</h1>}
   {rows.length===0?<header className="assistant-greeting"><div className="assistant-symbol"><Sparkles size={44}/></div><h1>{name?`Hello, ${name}.`:'Hello.'} <span>How can i-Clusters help today?</span></h1><p>Ask about your connected homelab.</p></header>:
   <div className="assistant-messages" ref={end} role="log" aria-label="Conversation">{rows.map(exchange=><Fragment key={exchange.id}>
    <div className="bubble user">{exchange.question}</div>
    {(exchange.error||!exchange.answer)&&busy!==exchange.id&&<div>{exchange.error&&<p role="alert">{exchange.error}</p>}<button className="btn secondary small" disabled={busy!==null} onClick={()=>void request(exchange)}>Retry</button></div>}
    {busy===exchange.id&&<p role="status">Waiting for a reply…</p>}
    {exchange.answer&&<div className="bubble assistant">{exchange.answer}<small>{exchange.mode==='local'?'Local status summary':exchange.mode==='inventory'?'Cluster inventory':exchange.mode==='openai'?'OpenAI':exchange.mode}</small></div>}
   </Fragment>)}</div>}
   <form onSubmit={send} className="composer assistant-compose"><input ref={input} aria-label="Message" value={draft} onChange={e=>setDraft(e.target.value)} required placeholder="Ask about your connected homelab"/><button className="btn primary" aria-label="Send" disabled={busy!==null||!scope||!draft.trim()}><Send size={18}/>Send</button></form>
   {!rows.length&&<div className="assistant-starters">{starters.map(({icon:Icon,text})=><button key={text} onClick={()=>{setDraft(text);input.current?.focus()}}><Icon size={20}/>{text}</button>)}</div>}
   <details className="assistant-privacy"><summary>About assistant data</summary><p>A configured AI provider receives the current cluster’s service health, alerts, inventory and up to four prior exchanges. Without a provider, the assistant summarizes measurements locally.</p></details>
  </div>
  {owner&&saved&&<SavedAssistant close={()=>setSaved(false)} configure={()=>{setSaved(false);configure(true)}}/>}
  <Modal open={rename!==null} title="Rename chat" onClose={()=>setRename(null)}><form onSubmit={e=>{e.preventDefault();if(rename!==null&&title.trim()){edit(rename,{title:title.trim()});setRename(null)}}}><label>Chat name<input required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label><button className="btn primary" disabled={!title.trim()}>Save</button></form></Modal>
  <Modal open={!!shared} title="Share chat" onClose={()=>setShared('')}><textarea className="chat-transcript" aria-label="Chat transcript" readOnly value={shared} onFocus={e=>e.target.select()}/>{typeof navigator.share==='function'&&<button className="btn secondary" onClick={()=>{void navigator.share({text:shared}).catch(()=>{})}}>Share</button>}<button className="btn primary" onClick={()=>{const url=URL.createObjectURL(new Blob([shared],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='i-clusters-chat.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}>Download transcript</button></Modal>
  {owner&&<ConfigurationDialog service={params.get('setup')==='ai'?'ai':''} onClose={()=>configure(false)}/>}
 </section>
}
