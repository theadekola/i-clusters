import {Fragment,useRef,useState,useEffect,type FormEvent} from 'react';
import {api} from '../api';
import {useApi} from '../hooks';
import {PageHeader,Card} from '../components/UI';
import {Link} from 'react-router-dom';

type Exchange={id:number;question:string;answer?:string;error?:string;mode?:string};
const historyKey='iclusters_ai_conversation';
function previous(scope:string):Exchange[]{
 try{const saved=JSON.parse(sessionStorage.getItem(historyKey)||'null');return saved?.scope===scope&&Array.isArray(saved.rows)?saved.rows.slice(-12):[]}catch{return []}
}
export default function AI(){
 const session=useApi<any>('/auth/me',null);
 const identity=session.data?.user;
 const scope=identity?JSON.stringify([identity.sub||identity.id,identity.sid,window.location.pathname.split('/ai')[0]]):'';
 return <Conversation key={scope} scope={scope} owner={identity?.role==='owner'}/>;
}
function Conversation({scope,owner}:{scope:string;owner:boolean}){
 const [draft,setDraft]=useState(''),[exchanges,setExchanges]=useState<Exchange[]>(()=>previous(scope));
 const [pending,setPending]=useState(false),sending=useRef(false),nextId=useRef(Math.max(Date.now(),...exchanges.map(row=>row.id+1)));
 useEffect(()=>{if(scope)try{sessionStorage.setItem(historyKey,JSON.stringify({scope,rows:exchanges.slice(-12)}))}catch{}},[scope,exchanges]);


 async function request(exchange:Exchange){
  if(sending.current)return;
  sending.current=true;
  setPending(true);
  const update=(patch:Partial<Exchange>)=>setExchanges(rows=>rows.map(row=>row.id===exchange.id?{...row,...patch}:row));
  update({error:undefined});
  try{
   const response=await api('/ai/chat',{method:'POST',body:JSON.stringify({message:exchange.question,history:exchanges.filter(row=>row.id<exchange.id&&row.answer).slice(-4).map(row=>({question:row.question.slice(0,2000),answer:row.answer!.slice(0,4000)}))})});
   update({answer:response.result.answer,mode:response.result.mode});
  }catch(error:any){
   update({error:error.message});
  }finally{
   sending.current=false;
   setPending(false);
  }
 }
 function send(event:FormEvent){
  event.preventDefault();
  if(!draft.trim()||sending.current)return;
  const exchange={id:nextId.current++,question:draft};
  setExchanges(rows=>[...rows.slice(-11),exchange]);
  setDraft('');
  void request(exchange);
 }
 return <><PageHeader title="Assistant" subtitle="Read-only analysis of the latest live measurements."
  actions={owner&&<Link className="btn secondary" to="/settings?tab=Integrations&setup=ai">Configure AI</Link>}/>
  <Card><p className="muted">A configured AI provider receives the current cluster’s service health, alerts, inventory and up to four prior exchanges. Without a provider, the assistant summarizes measurements locally.</p>
   <div className="chat">{exchanges.map(exchange=><Fragment key={exchange.id}>
    <div className="bubble user">{exchange.question}</div>
    {exchange.error&&<div><p role="alert">{exchange.error}</p><button type="button" className="btn secondary small" disabled={pending} onClick={()=>void request(exchange)}>Retry</button></div>}
    {exchange.answer&&<div className="bubble assistant">{exchange.answer}<small className="muted">{exchange.mode==='local'?'Local status summary':exchange.mode}</small></div>}
   </Fragment>)}</div>
   <form onSubmit={send} className="composer"><input value={draft} onChange={e=>setDraft(e.target.value)} required placeholder="Ask about your connected homelab"/><button className="btn primary" aria-busy={pending} disabled={pending||!scope}>{pending?'Reading…':'Send'}</button></form>
  </Card></>;
}
