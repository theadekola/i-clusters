import {useState} from 'react';
import {api} from '../api';
import {useApi} from '../hooks';
import {confirmChoice} from '../confirm-choice';
import {Modal} from './UI';

export default function SavedAssistant({close,configure}:{close:()=>void;configure:()=>void}){
 const live=useApi<any>('/configuration/ai',null,0);
 const [operation,setOperation]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const data=live.data,field=(key:string)=>data?.fields?.find((f:any)=>f.key===key);
 const provider=field('AI_PROVIDER')?.value,enabled=data&&!data.disabled&&field('OPENAI_API_KEY')?.hasValue;
 async function run(action:'test'|'revoke'){
  if(operation||!await confirmChoice(action==='test'?'Send a test message to this assistant?':'Revoke this assistant connection?'))return;
  setOperation(action);setError('');setNotice('');
  try{
   if(action==='test'){
    const result=await api('/configuration/ai/test',{method:'POST',body:JSON.stringify({confirm:true})});
    setNotice(result.result.message);
   }else{
    const result=await api('/configuration/ai',{method:'DELETE'});
    live.setData(result.result);setNotice('Assistant connection revoked.');
   }
  }catch(e:any){setError(e.message)}finally{setOperation('')}
 }
 return <Modal open title="Saved Assistant" onClose={()=>{if(!operation)close()}} closeDisabled={!!operation}>
  {live.error&&<p role="alert">{live.error}</p>}
  {enabled?<dl className="saved-assistant-info">{[
   ['AI provider',data.providers?.[provider]?.label||provider],['API type',field('OPENAI_API_TYPE')?.optionLabels?.[field('OPENAI_API_TYPE')?.value]||field('OPENAI_API_TYPE')?.value],
   provider==='n8n'?['Production webhook URL',field('N8N_WEBHOOK_URL')?.value]:['Model',field('OPENAI_MODEL')?.value]
  ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>:<p>{live.loading?'Loading…':'No active assistant connection.'}</p>}
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  <div className="configuration-actions">
   <button className="btn secondary" disabled={!enabled||!!operation} aria-busy={operation==='test'} onClick={()=>void run('test')}>Test Connection</button>
   <button className="btn primary" disabled={!!operation} onClick={configure}>Reconfigure</button>
   <button className="btn danger" disabled={!enabled||!!operation} aria-busy={operation==='revoke'} onClick={()=>void run('revoke')}>Revoke</button>
  </div>
 </Modal>;
}
