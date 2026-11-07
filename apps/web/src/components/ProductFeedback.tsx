import {useEffect,useRef,useState} from 'react';
import {MessageSquare} from 'lucide-react';
import './product-feedback.css';
import {api} from '../api';
import {Modal} from './UI';

type Preferences={enabled:boolean;available:boolean;version:string};
const sections=new Set('proxmox docker storage network backups restore schedules retention monitoring alerts ai users settings tools'.split(' '));
const post=(data:unknown)=>({method:'POST',body:JSON.stringify(data)});

export default function ProductFeedback({path,search}:{path:string;search:string}){
 const segment=path.split('/')[1]||'dashboard';
 const tab=new URLSearchParams(search).get('tab');
 const page=segment==='backups'&&tab==='Restore Points'?'restore':sections.has(segment)?segment:'dashboard';
 const [open,setOpen]=useState(false),[pref,setPref]=useState<Preferences|null>(null);
 const [category,setCategory]=useState('general'),[message,setMessage]=useState(''),[email,setEmail]=useState('');
 const [error,setError]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false);
 const previous=useRef(''),submission=useRef({key:'',id:''}),[context,setContext]=useState(page);
 useEffect(()=>{
  if(previous.current===page)return;
  previous.current=page;
  void api('/product/visit',post({feature:page})).catch(()=>{});
 },[page]);
 useEffect(()=>{
  if(!open)return;
  let active=true;
  api<Preferences>('/product/preferences').then(value=>{if(active)setPref(value)}).catch(e=>{if(active)setError(e.message)});
  return()=>{active=false};
 },[open]);
 async function changeReporting(){
  if(!pref||busy)return;
  setBusy(true);setError('');
  try{await api('/product/preferences',{method:'PUT',body:JSON.stringify({enabled:!pref.enabled})});setPref({...pref,enabled:!pref.enabled})}
  catch(e:any){setError(e.message)}finally{setBusy(false)}
 }
 async function submit(event:React.FormEvent){
  event.preventDefault();if(busy)return;
  setBusy(true);setError('');
  try{
   const key=JSON.stringify([category,message,email,context]);
   if(submission.current.key!==key)submission.current={key,id:crypto.randomUUID()};
   await api('/product/feedback',post({id:submission.current.id,category,message,email,page:context}));
   setSent(true);setMessage('');setEmail('');submission.current={key:'',id:''};
  }catch(e:any){setError(e.message)}finally{setBusy(false)}
 }
 return <><details className="product-reporting"><summary>Help, feedback and usage reporting</summary><p>Monthly usage totals help improve i-Clusters. You can turn off reporting for your account.</p><button type="button" className="btn secondary small" onClick={()=>{setOpen(true);setContext(page);setSent(false);setError('')}}><MessageSquare size={16}/> Feedback &amp; usage</button></details>
 <Modal open={open} title="Feedback and usage" closeDisabled={busy} onClose={()=>setOpen(false)}>
 <p>i-Clusters automatically shares monthly feature counts, active account totals and selected action results to improve the software. The reporting service estimates the installation country.</p>
 {pref&&<label><input type="checkbox" checked={pref.enabled} disabled={busy||!pref.available} onChange={changeReporting}/> Include my activity in usage reports</label>}
 {sent?<p role="status">Feedback received. Thank you.</p>:<form className="form-grid" onSubmit={submit}>
 <label>Feedback type<select value={category} onChange={e=>setCategory(e.target.value)}><option value="general">General feedback</option><option value="problem">Report a problem</option><option value="idea">Suggest a feature</option></select></label>
 <label>Message<textarea required maxLength={3000} value={message} onChange={e=>setMessage(e.target.value)}/></label>
 <label>Reply email (optional)<input type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <p>Your message goes privately to the i-Clusters team. Included page and version: {context} · {pref?.version}</p>
 <button className="btn primary" disabled={busy||!pref||!message.trim()}>Send feedback</button></form>}
 {error&&<p role="alert">{error}</p>}
 </Modal></>;
}
