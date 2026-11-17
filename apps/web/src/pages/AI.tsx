import {Fragment,useRef,useState,useEffect,type FormEvent} from 'react';
import {Activity,Boxes,Database,History,MessageSquare,Network,Plus,Send,Settings,Sparkles} from 'lucide-react';
import {api} from '../api';
import {useApi} from '../hooks';
import {useSearchParams} from 'react-router-dom';
import ConfigurationDialog from '../components/ConfigurationDialog';
import './assistant.css';

type Exchange={id:number;question:string;answer?:string;error?:string;mode?:string};
type Thread={id:number;title?:string;rows:Exchange[]};
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
 const [busy,setBusy]=useState<number|null>(null),sending=useRef(false),end=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const thread=chats.threads.find(t=>t.id===chats.active)!,rows=thread.rows;
 useEffect(()=>{if(scope)try{sessionStorage.setItem(historyKey,JSON.stringify({scope,...chats}))}catch{}},[scope,chats]);
 useEffect(()=>{const list=end.current;if(list)list.scrollTop=list.scrollHeight},[rows,busy]);
 function updateRows(id:number,update:(old:Exchange[])=>Exchange[]){
  setChats(old=>({...old,threads:old.threads.map(t=>t.id===id?{...t,title:t.title||t.rows[0]?.question,rows:update(t.rows)}:t)}));
 }
 function select(id:number){setChats(old=>({...old,active:id}));setSidebar(false);setDraft('')}
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
   <p className="assistant-history-label">Chat history</p><nav aria-label="Chat history">{chats.threads.filter(t=>t.rows.length).map(t=><button key={t.id} title={t.title||t.rows[0].question} aria-current={t.id===thread.id?'page':undefined} onClick={()=>select(t.id)}><MessageSquare size={15}/><span>{t.title||t.rows[0].question}</span></button>)}</nav>
   {owner&&<button className="btn secondary history-config" onClick={()=>configure(true)}><Settings size={16}/>Configure AI Assistant</button>}
  </aside>
  <div className={'assistant-main '+(rows.length?'has-messages':'welcome')}>
   {rows.length>0&&<h1 className="assistant-thread-title">{thread.title||rows[0].question}</h1>}
   {rows.length===0?<header className="assistant-greeting"><div className="assistant-symbol"><Sparkles size={44}/></div><h1>{name?`Hello, ${name}.`:'Hello.'} <span>How can i-Clusters help today?</span></h1><p>Ask about your connected homelab.</p></header>:
   <div className="assistant-messages" ref={end} role="log" aria-label="Conversation">{rows.map(exchange=><Fragment key={exchange.id}>
    <div className="bubble user">{exchange.question}</div>
    {(exchange.error||!exchange.answer)&&busy!==exchange.id&&<div>{exchange.error&&<p role="alert">{exchange.error}</p>}<button className="btn secondary small" disabled={busy!==null} onClick={()=>void request(exchange)}>Retry</button></div>}
    {busy===exchange.id&&<p role="status">Waiting for a reply…</p>}
    {exchange.answer&&<div className="bubble assistant">{exchange.answer}<small>{exchange.mode==='local'?'Local status summary':exchange.mode}</small></div>}
   </Fragment>)}</div>}
   <form onSubmit={send} className="composer assistant-compose"><input ref={input} aria-label="Message" value={draft} onChange={e=>setDraft(e.target.value)} required placeholder="Ask about your connected homelab"/><button className="btn primary" aria-label="Send" disabled={busy!==null||!scope||!draft.trim()}><Send size={18}/>Send</button></form>
   {!rows.length&&<div className="assistant-starters">{starters.map(({icon:Icon,text})=><button key={text} onClick={()=>{setDraft(text);input.current?.focus()}}><Icon size={20}/>{text}</button>)}</div>}
   <details className="assistant-privacy"><summary>About assistant data</summary><p>A configured AI provider receives the current cluster’s service health, alerts, inventory and up to four prior exchanges. Without a provider, the assistant summarizes measurements locally.</p></details>
  </div>
  {owner&&<ConfigurationDialog service={params.get('setup')==='ai'?'ai':''} onClose={()=>configure(false)}/>}
 </section>
}
