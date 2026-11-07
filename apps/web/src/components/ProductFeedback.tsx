import {useEffect,useRef,useState} from 'react';
import {MessageSquare, MessagesSquare, Send, Rocket, TriangleAlert, ChartColumn, Star} from 'lucide-react';
import './product-feedback.css';
import {api} from '../api';
import {Modal} from './UI';

type Preferences={enabled:boolean;available:boolean;version:string};
const sections=new Set('proxmox docker storage network backups restore schedules retention monitoring alerts ai users settings tools'.split(' '));
const post=(data:unknown)=>({method:'POST',body:JSON.stringify(data)});

export function ProductVisit({path,search}:{path:string;search:string}){
 const segment=path.split('/')[1]||'dashboard';
 const tab=new URLSearchParams(search).get('tab');
 const page=segment==='backups'&&tab==='Restore Points'?'restore':sections.has(segment)?segment:'dashboard';
 const previous=useRef('');
 useEffect(()=>{
  if(previous.current===page)return;
  previous.current=page;
  void api('/product/visit',post({feature:page})).catch(()=>{});
 },[page]);
 return null;
}

export default function ProductFeedback(){
 const context='settings';
 const [open,setOpen]=useState(false),[pref,setPref]=useState<Preferences|null>(null);
 const [category,setCategory]=useState('general'),[message,setMessage]=useState(''),[email,setEmail]=useState('');
 const [error,setError]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false);
 const submission=useRef({key:'',id:''});
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
 return <><button type="button" className="btn secondary feedback-trigger" aria-haspopup="dialog" onClick={()=>{setOpen(true);setSent(false);setError('')}}><MessageSquare size={17}/> Feedback &amp; usage</button>
 <Modal open={open} title="Feedback & Usage" closeDisabled={busy} onClose={()=>setOpen(false)}>
 <div className="feedback-columns">
 <aside className="feedback-guide"><MessagesSquare className="feedback-art" aria-hidden="true"/><h3>We Value Your Feedback</h3><p>Tell us what’s working well, what we can improve, or what you’d like to see next.</p>
 <ul><li><Rocket/>Suggest a Feature</li><li><TriangleAlert/>Report an Issue</li><li><ChartColumn/>Share Your Experience</li><li><Star/>General Feedback</li></ul></aside>
 <section className="feedback-panel"><h3><Send size={22}/> Send Feedback</h3><p>Your message goes privately to the i-Clusters team.</p>
 {pref&&<label className="feedback-choice"><input type="checkbox" checked={pref.enabled} disabled={busy||!pref.available} onChange={changeReporting}/> Include my activity in usage reports</label>}
 {sent?<p role="status">Feedback received. Thank you.</p>:<form onSubmit={submit}>
 <label>Feedback type<select value={category} onChange={e=>setCategory(e.target.value)}><option value="general">General feedback</option><option value="problem">Report a problem</option><option value="idea">Suggest a feature</option></select></label>
 <label>Message<textarea required rows={4} maxLength={1000} value={message} onChange={e=>setMessage(e.target.value)}/></label><small className="feedback-count">{message.length} / 1000</small>
 <label>Reply email (optional)<input type="email" autoComplete="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <button className="btn primary" disabled={busy||!message.trim()}><Send size={16}/> Send feedback</button></form>}
 {error&&<p role="alert">{error}</p>}</section></div>
 </Modal></>;
}
