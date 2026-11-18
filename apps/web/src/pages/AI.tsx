import {Fragment,useRef,useState,useEffect,type FormEvent} from 'react';
import {Activity,Bookmark,Boxes,Database,History,MessageSquare,Network,MoreHorizontal,Pin,Plus,Search,Send,Settings,Sparkles} from 'lucide-react';
import {api} from '../api';
import {useApi} from '../hooks';
import {useSearchParams} from 'react-router-dom';
import ConfigurationDialog from '../components/ConfigurationDialog';
import SavedAssistant from '../components/SavedAssistant';
import {Modal} from '../components/UI';
import {confirmChoice} from '../confirm-choice';
import './assistant.css';

type Exchange={id:number;question:string;answer?:string;error?:string;mode?:string;pending?:boolean;notice?:string;webSearch?:boolean;sources?:{url:string;title:string}[];searchSuggestions?:string};
type Thread={id:number;title?:string;question?:string;pinned?:boolean;loaded?:boolean;rows:Exchange[]};
type Chats={active:number;threads:Thread[]};
const historyKey='iclusters_ai_conversation';
const chatId=()=>Date.now()*1000+Math.floor(Math.random()*1000);
const freshChats=():Chats=>{const id=chatId();return {active:id,threads:[{id,rows:[],loaded:true}]}};
function legacyThreads(scope:string):Thread[]{
 try{
  const saved=JSON.parse(window.sessionStorage.getItem(historyKey)||'null');
  const [user,cluster]=JSON.parse(scope),old=JSON.parse(saved?.scope||'null');
  if(!Array.isArray(old)||old[0]!==user||old[2]!==cluster)return [];
  return Array.isArray(saved.threads)?saved.threads:Array.isArray(saved.rows)?[{id:0,rows:saved.rows.slice(-12)}]:[];
 }catch{return []}
}
const starters=[
 {icon:Activity,text:'Summarize cluster health'},
 {icon:Boxes,text:'Review VM and container status'},
 {icon:Database,text:'Review backup activity'},
 {icon:Network,text:'Explain my cluster topology'}
];
function WebAnswer({answer}:{answer:string}){
 const parts:React.ReactNode[]=[];
 const links=/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)/g;
 let previous=0;
 for(const match of answer.matchAll(links)){
  parts.push(answer.slice(previous,match.index));
  const url=match[2]||match[3].replace(/[).,;]+$/,'');
  parts.push(<a key={match.index} href={url} target="_blank" rel="noopener noreferrer">{match[1]||url}</a>);
  if(match[3])parts.push(match[3].slice(url.length));
  previous=match.index!+match[0].length;
 }
 parts.push(answer.slice(previous));
 return <>{parts}</>;
}
export default function AI(){
 const session=useApi<any>('/auth/me',null),identity=session.data?.user;
 const scope=identity?JSON.stringify([identity.sub||identity.id,window.location.pathname.split('/ai')[0]]):'';
 if(!identity)return <p role="status">Loading AI Assistant…</p>;
 return <Conversation key={scope} scope={scope} owner={identity?.role==='owner'} name={identity?.name||identity?.username}/>;
}
function Conversation({scope,owner,name}:{scope:string;owner:boolean;name?:string}){
 const [params,setParams]=useSearchParams();
 const configure=(open:boolean)=>setParams(previous=>{const next=new URLSearchParams(previous);if(open)next.set('setup','ai');else next.delete('setup');return next},{replace:!open});
 const [chats,setChats]=useState<Chats>(freshChats),[draft,setDraft]=useState(''),[sidebar,setSidebar]=useState(false);
 const [saved,setSaved]=useState(false),[menu,setMenu]=useState<number|null>(null),[rename,setRename]=useState<number|null>(null),[title,setTitle]=useState(''),[shared,setShared]=useState('');
 const [loading,setLoading]=useState(true),[historyError,setHistoryError]=useState(''),[loadAttempt,setLoadAttempt]=useState(0);
 const selectionKey='iclusters-ai-active:'+scope;
 useEffect(()=>{
  let cancelled=false;
  setLoading(true);setHistoryError('');
  void (async()=>{
   const legacy=legacyThreads(scope);
   if(legacy.length){for(const thread of legacy)await api('/ai/conversations/import',{method:'POST',body:JSON.stringify({threads:[thread]})});window.sessionStorage.removeItem(historyKey);}
   const result=await api('/ai/conversations');
   if(cancelled)return;
   const threads:Thread[]=Array.isArray(result.threads)?result.threads:[];
   if(!threads.length){setChats(freshChats());return;}
   let wanted:number|undefined;
   try{wanted=Number(localStorage.getItem(selectionKey));}catch{}
   const active=threads.find(t=>t.id===wanted)?.id??threads[0].id;
   const detail=await api('/ai/conversations/'+active);
   if(!cancelled)setChats({active,threads:threads.map(t=>t.id===active?{...detail.thread,loaded:true}:t)});
  })().catch(e=>{if(!cancelled)setHistoryError('Chat history could not be loaded. '+e.message)}).finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[scope,loadAttempt]);
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
  try{await api('/ai/conversations/'+t.id,{method:'DELETE'});}catch(e:any){setHistoryError(e.message);return;}
  setChats(old=>{
   const remaining=old.threads.filter(item=>item.id!==t.id);
   if(!remaining.length)remaining.push({id:chatId(),rows:[],loaded:true});
   return {active:old.active===t.id?remaining[0].id:old.active,threads:remaining};
  });
  if(chats.active===t.id)setDraft('');
 }
 async function edit(id:number,patch:Partial<Thread>){try{const result=await api('/ai/conversations/'+id,{method:'PATCH',body:JSON.stringify(patch)});setChats(old=>({...old,threads:old.threads.map(t=>t.id===id?{...result.thread,loaded:true}:t)}));setHistoryError('');return true;}catch(e:any){setHistoryError(e.message);return false;}}
 async function share(t:Thread){setMenu(null);try{const full=t.loaded?t:(await api('/ai/conversations/'+t.id)).thread;setShared([full.title||full.question,...full.rows.flatMap((r:Exchange)=>[r.question,r.answer||r.error||''])].join('\n\n'));}catch(e:any){setHistoryError(e.message)}}
 const [busy,setBusy]=useState<number|null>(null),sending=useRef(false),end=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const thread=chats.threads.find(t=>t.id===chats.active)!,rows=thread.rows;
 useEffect(()=>{if(!loading)try{localStorage.setItem(selectionKey,String(chats.active))}catch{}},[chats.active,loading,selectionKey]);
 useEffect(()=>{
  if(loading||thread.loaded)return;
  let cancelled=false;
  api('/ai/conversations/'+thread.id).then(({thread:full})=>{if(!cancelled)setChats(old=>({...old,threads:old.threads.map(t=>t.id===full.id?{...full,loaded:true}:t)}))}).catch(e=>{if(!cancelled)setHistoryError(e.message)});
  return()=>{cancelled=true};
 },[thread.id,thread.loaded,loading]);
 useEffect(()=>{
  if(!rows.some(r=>r.pending)||busy!==null)return;
  let cancelled=false;
  const timer=setTimeout(()=>{api('/ai/conversations/'+thread.id).then(({thread:full})=>{if(!cancelled)setChats(old=>({...old,threads:old.threads.map(t=>t.id===full.id?{...full,loaded:true}:t)}))}).catch(e=>{if(!cancelled)setHistoryError(e.message)})},2000);
  return()=>{cancelled=true;clearTimeout(timer)};
 },[rows,busy,thread.id]);
 useEffect(()=>{const list=end.current;if(list)list.scrollTop=list.scrollHeight},[rows,busy]);
 function updateRows(id:number,update:(old:Exchange[])=>Exchange[]){
  setChats(old=>({...old,threads:old.threads.map(t=>t.id===id?{...t,title:t.title||t.rows[0]?.question,rows:update(t.rows)}:t)}));
 }
 function select(id:number){setMenu(null);setChats(old=>({...old,active:id}));setSidebar(false);setDraft('')}
 function newChat(){
  const empty=chats.threads.find(t=>t.loaded&&!t.rows.length&&!t.question);
  if(empty){select(empty.id);return}
  const id=chatId();setChats(old=>({active:id,threads:[{id,rows:[],loaded:true},...old.threads]}));setDraft('');setSidebar(false);input.current?.focus();
 }
 async function request(exchange:Exchange){
  if(sending.current)return;
  sending.current=true;setBusy(exchange.id);
  const patch=(value:Partial<Exchange>)=>updateRows(thread.id,list=>list.map(r=>r.id===exchange.id?{...r,...value}:r));
  patch({error:undefined,pending:true});
  try{
   const history=rows.filter(row=>row.id<exchange.id&&row.answer).slice(-4).map(row=>({question:row.question.slice(0,2000),answer:row.answer!.slice(0,4000)}));
   const response=await api('/ai/chat',{method:'POST',body:JSON.stringify({message:exchange.question,history,threadId:thread.id,exchangeId:exchange.id})});
   patch({...response.result,error:undefined,pending:false});
  }catch(e:any){patch({error:e.message,pending:false})}finally{sending.current=false;setBusy(null)}
 }
 function send(event:FormEvent){
  event.preventDefault();if(!draft.trim()||sending.current||!scope||loading||!thread.loaded||historyError||rows.some(r=>r.pending))return;
  const exchange={id:Math.max(Date.now(),...rows.map(r=>r.id+1)),question:draft.trim()};
  updateRows(thread.id,list=>[...list,exchange]);setDraft('');void request(exchange);
 }
 return <section className="assistant-workspace">
  <button className="btn secondary history-toggle" aria-expanded={sidebar} onClick={()=>setSidebar(!sidebar)}><History size={18}/>Chat history</button>
  <aside className={'assistant-history'+(sidebar?' expanded':'')}>
   <button className="btn primary" disabled={loading||!!historyError} onClick={newChat}><Plus size={17}/>New chat</button>
   <p className="assistant-history-label">Chat history</p><nav aria-label="Chat history">{chats.threads.filter(t=>t.question||t.rows.length).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)).map(t=>{
    const label=t.title||t.question||t.rows[0]?.question||'Chat';
    return <div key={t.id} className="chat-history-row"><div className="chat-history-line"><button title={label} aria-current={t.id===thread.id?'page':undefined} onClick={()=>select(t.id)}>{t.pinned?<Pin size={15}/>:<MessageSquare size={15}/>}<span>{label}</span></button>
     <button className="chat-options" aria-label={`Chat options for ${label}`} aria-expanded={menu===t.id} onClick={()=>setMenu(menu===t.id?null:t.id)}><MoreHorizontal size={18}/></button></div>
     {menu===t.id&&<div className="chat-options-list">
      <button onClick={()=>{setRename(t.id);setTitle(label);setMenu(null)}}>Rename</button>
      <button onClick={()=>{void edit(t.id,{pinned:!t.pinned});setMenu(null)}}>{t.pinned?'Unpin':'Pin'}</button>
      <button onClick={()=>void share(t)}>Share</button>
      <button onClick={()=>void remove(t)}>Delete</button>
     </div>}</div>
   })}</nav>
   {owner&&<div className="assistant-settings-list" role="group" aria-label="AI Assistant">
    <button type="button" className="btn secondary" onClick={()=>configure(true)}><Settings size={18} aria-hidden="true"/><span>Configure AI Assistant</span></button>
    <button type="button" className="btn secondary" onClick={()=>setSaved(true)}><Bookmark size={18} aria-hidden="true"/><span>Saved Assistant</span></button>
   </div>}
  </aside>
  <div className={'assistant-main '+(rows.length?'has-messages':'welcome')}>
   {historyError&&<p role="alert">{historyError} <button type="button" className="btn secondary" onClick={()=>setLoadAttempt(v=>v+1)}>Reload history</button></p>}
   {(loading||!thread.loaded)&&<p role="status">Loading chat history…</p>}
   {rows.length>0&&<h1 className="assistant-thread-title">{thread.title||rows[0].question}</h1>}
   {rows.length===0&&!loading&&thread.loaded?<header className="assistant-greeting"><div className="assistant-symbol"><Sparkles size={44}/></div><h1>{name?`Hello, ${name}.`:'Hello.'} <span>How can i-Clusters help today?</span></h1><p>Ask about your connected homelab.</p></header>:
   <div className="assistant-messages" ref={end} role="log" aria-label="Conversation">{rows.map(exchange=><Fragment key={exchange.id}>
    <div className="bubble user">{exchange.question}</div>
    {(exchange.error||!exchange.answer)&&busy!==exchange.id&&!exchange.pending&&<div>{exchange.error&&<p role="alert">{exchange.error}</p>}<button className="btn secondary small" disabled={busy!==null} onClick={()=>void request(exchange)}>Retry</button></div>}
    {(busy===exchange.id||exchange.pending)&&<p role="status">Waiting for a reply…</p>}
    {exchange.answer&&<div className="bubble assistant"><WebAnswer answer={exchange.answer}/>{exchange.sources?.length? <ul className="assistant-sources">{exchange.sources.map(source=><li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul>:null}{exchange.searchSuggestions&&<iframe title="Google Search suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src https: data:">'+exchange.searchSuggestions}/>}{exchange.notice&&<p className="assistant-search-notice">{exchange.notice}</p>}<small>{exchange.mode==='local'?'Local status summary':exchange.mode==='inventory'?'Cluster inventory':exchange.mode==='openai'?'OpenAI':exchange.mode==='web'?'Public web search':exchange.mode}</small></div>}
   </Fragment>)}</div>}
   <form onSubmit={send} className="composer assistant-compose"><input ref={input} aria-label="Message" value={draft} onChange={e=>setDraft(e.target.value)} required placeholder="Ask about your connected homelab"/><button className="btn primary" aria-label="Send" disabled={busy!==null||!scope||!draft.trim()||loading||!thread.loaded||!!historyError||rows.some(r=>r.pending)}><Send size={18}/>Send</button></form>
   {!rows.length&&!loading&&thread.loaded&&<div className="assistant-starters">{starters.map(({icon:Icon,text})=><button key={text} onClick={()=>{setDraft(text);input.current?.focus()}}><Icon size={20}/>{text}</button>)}<button type="button" onClick={()=>{setDraft('web: ');input.current?.focus()}}><Search size={20} aria-hidden="true"/>Search the web</button></div>}
  </div>
  {owner&&saved&&<SavedAssistant close={()=>setSaved(false)} configure={()=>{setSaved(false);configure(true)}}/>}
  <Modal open={rename!==null} title="Rename chat" onClose={()=>setRename(null)}><form onSubmit={async e=>{e.preventDefault();if(rename!==null&&title.trim()&&await edit(rename,{title:title.trim()}))setRename(null)}}><label>Chat name<input required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label><button className="btn primary" disabled={!title.trim()}>Save</button></form></Modal>
  <Modal open={!!shared} title="Share chat" onClose={()=>setShared('')}><textarea className="chat-transcript" aria-label="Chat transcript" readOnly value={shared} onFocus={e=>e.target.select()}/>{typeof navigator.share==='function'&&<button className="btn secondary" onClick={()=>{void navigator.share({text:shared}).catch(()=>{})}}>Share</button>}<button className="btn primary" onClick={()=>{const url=URL.createObjectURL(new Blob([shared],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='i-clusters-chat.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}>Download transcript</button></Modal>
  {owner&&<ConfigurationDialog service={params.get('setup')==='ai'?'ai':''} onClose={()=>configure(false)}/>}
 </section>
}
