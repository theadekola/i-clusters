import {Fragment,useRef,useState,type FormEvent} from 'react';
import {api} from '../api';
import {useApi} from '../hooks';
import {PageHeader,Card} from '../components/UI';
import {Link} from 'react-router-dom';

type Exchange={id:number;question:string;answer?:string;error?:string};

export default function AI(){
 const session=useApi<any>('/auth/me',null);
 const [draft,setDraft]=useState(''),[exchanges,setExchanges]=useState<Exchange[]>([]);
 const [pending,setPending]=useState(false),sending=useRef(false),nextId=useRef(0);

 async function request(exchange:Exchange){
  if(sending.current)return;
  sending.current=true;
  setPending(true);
  const update=(patch:Partial<Exchange>)=>setExchanges(rows=>rows.map(row=>row.id===exchange.id?{...row,...patch}:row));
  update({error:undefined});
  try{
   const response=await api('/ai/chat',{method:'POST',body:JSON.stringify({message:exchange.question})});
   update({answer:response.result.answer});
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
  setExchanges(rows=>[...rows,exchange]);
  setDraft('');
  void request(exchange);
 }
 return <><PageHeader title="Assistant" subtitle="Read-only analysis of the latest live measurements."
  actions={session.data?.user?.role==='owner'&&<Link className="btn secondary" to="/settings?tab=Integrations&setup=ai">Configure AI</Link>}/>
  <Card><p className="muted">This assistant cannot execute infrastructure actions or perform security scans. With no AI API key it returns a measured status summary.</p>
   <div className="chat">{exchanges.map(exchange=><Fragment key={exchange.id}>
    <div className="bubble user">{exchange.question}</div>
    {exchange.error&&<div><p role="alert">{exchange.error}</p><button type="button" className="btn secondary small" disabled={pending} onClick={()=>void request(exchange)}>Retry</button></div>}
    {exchange.answer&&<div className="bubble assistant">{exchange.answer}</div>}
   </Fragment>)}</div>
   <form onSubmit={send} className="composer"><input value={draft} onChange={e=>setDraft(e.target.value)} required placeholder="Ask about your connected homelab"/><button className="btn primary" aria-busy={pending} disabled={pending}>{pending?'Reading…':'Send'}</button></form>
  </Card></>;
}
