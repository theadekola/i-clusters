import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {api} from '../api';
import {isActionCancelled} from '../action-cancellation';
import {finished,historyLink,restartId,restartMessage,restartsPath,submitRestart,type GuestKind,type RestartList,type RestartReason,type RestartRecord} from '../guest-power-cycle';
import {watchRestartDialog,claimRestartNotice} from '../restart-notices';
import {Modal} from './UI';
import ReportLoading from './ReportLoading';

type Props={
  node:string; id:string; name:string; kind?:GuestKind; reason?:RestartReason; initial?:RestartRecord;
  onClose:()=>void; onComplete:()=>void; onBusy?:(busy:boolean)=>void;
};
export default function GuestRestartDialog({node,id,kind='vm',reason='setup',name,initial,onClose,onComplete,onBusy}:Props){
  const [record,setRecord]=useState<RestartRecord|null>(initial||null),[cluster,setCluster]=useState('');
  const [requestId,setRequestId]=useState(initial?.id||''),[check,setCheck]=useState(0),[error,setError]=useState('');
  const [submitting,setSubmitting]=useState(false),[now,setNow]=useState(Date.now);
  const [reviewedHistory,setReviewedHistory]=useState(false);
  const mutation=useRef<AbortController|null>(null);
  const attempt=useRef('');
  useEffect(()=>()=>mutation.current?.abort(),[]);

  // Opening a dialog or restoring a session can only list/read an existing attempt.
  useEffect(()=>{
    const c=new AbortController();
    api<RestartList>(restartsPath,{signal:c.signal}).then(list=>{
      if(c.signal.aborted)return;
      setCluster(list.cluster);
      if(!requestId&&!initial){
        const prior=list.restarts.find(r=>r.node===node&&r.kind===kind&&r.guest===id&&!finished(r.phase));
        if(prior){setRecord(prior);setRequestId(prior.id)}
      }
    }).catch(e=>{if(!c.signal.aborted)setError(e.message)});
    return ()=>c.abort();
  },[node,kind,id,initial?.id,requestId,check]);

  useEffect(()=>{
    if(!requestId||submitting)return;
    const c=new AbortController();
    let timer:ReturnType<typeof setTimeout>,missingSince=0;
    const poll=async()=>{
      try{
        const next=await api<RestartRecord>(restartsPath+'/'+encodeURIComponent(requestId),{signal:c.signal});
        if(c.signal.aborted)return;
        setRecord(next);setError(next.readError||'');
        if(finished(next.phase))return;
      }catch(e:any){
        if(c.signal.aborted)return;
        setError(e.status===404&&!record?'Restart receipt unavailable. Check progress.':e.message);
        if(e.status===401||e.status===403)return;
        if(e.status===404){
          missingSince ||= Date.now();
          // A reply can be lost before the server creates the record. A fresh
          // explicit attempt reuses its id, including across the lookup race.
          if(Date.now()-missingSince>=10000&&!record){setRequestId('');setRecord(null);return}
        }
      }
      timer=setTimeout(poll,2500);
    };
    void poll();
    return ()=>{c.abort();clearTimeout(timer)};
  },[requestId,check,submitting]);

  useEffect(()=>{
    if(!record||finished(record.phase))return;
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return ()=>clearInterval(timer);
  },[record?.id,record?.phase]);

  async function submit(){
    if(!cluster||mutation.current)return;
    const recovery=record||undefined;
    if(recovery && (recovery.phase!=='recoverable'||recovery.readError))return;
    const c=new AbortController();mutation.current=c;
    let uuid=recovery?.id||attempt.current;
    setSubmitting(true);onBusy?.(true);setError('');
    try{
      uuid ||= (attempt.current=restartId());
      const next=await submitRestart({node,id,kind,name,reason:recovery?.reason||reason},cluster,uuid,c.signal,recovery);
      if(!c.signal.aborted){setRecord(next);setRequestId(next.id)}
    }catch(e:any){
      if(!c.signal.aborted&&!isActionCancelled(e)){
        setError(e.message);
        if(e.checkReceipt)setRequestId(uuid);
        setCheck(value=>value+1);
      }
    }finally{
      mutation.current=null;
      if(!c.signal.aborted){setSubmitting(false);onBusy?.(false)}
    }
  }
  const completedElsewhere=record?.reason!==reason;
  const complete=record?.phase==='complete';
  useEffect(()=>{
    if(requestId&&reason==='update')return watchRestartDialog(requestId);
  },[requestId,reason]);
  useEffect(()=>{
    if(record?.phase==='complete'&&record.reason==='update')claimRestartNotice(record.id);
  },[record?.phase,record?.reason,record?.id]);
  const finish=complete && (initial||!completedElsewhere)?onComplete:onClose;
  const elapsed=record?Math.max(0,Math.floor(((finished(record.phase)?Date.parse(record.updated_at):now)-Date.parse(record.started_at))/1000)):0;
  const canRecover=record?.phase==='recoverable'&&!record.readError&&!error;
  return createPortal(<Modal open title={`Restart ${kind==='vm'?'VM':'CT'} · ${name}`} onClose={finish} closeDisabled={submitting}
    success={complete&&(!initial||reason==='update')&&record.reason===reason?restartMessage(record):undefined}>
    <p><b>{name}</b> ({node} / {id})</p>
    {!record&&<><p>{reason==='update'?'Restart this guest to finish the OS update.':'Restart this guest to finish setup.'}</p>
      <p>Proxmox will shut it down and start it automatically after one SSH approval. Services will be interrupted.</p>
      {kind==='lxc'&&<p>If the container exceeds its shutdown timeout, Proxmox may stop its remaining processes before startup.</p>}</>}
    {submitting&&<div role="status"><ReportLoading inline/> Requesting approval for the power action…</div>}
    {record&&<><p role="status">{restartMessage(record)}</p><p className="muted">Last confirmed power state: {record.power} · Elapsed: {elapsed}s</p>
      {record.detail&&<p className="error">{record.detail}</p>}
      <a href={historyLink(record)} target="_blank" rel="noreferrer" onClick={()=>setReviewedHistory(true)}>{record.task?'View task log':'View guest task history'}</a></>}
    {requestId&&!record&&<p><a href={historyLink({id:requestId})} target="_blank" rel="noreferrer">View guest task history</a></p>}
    {error&&<p role="alert" className="error">{error}</p>}
    <div className={reason==='update'?'modal-actions guest-restart-sheet':'modal-actions'}>
      <button type="button" className="btn secondary" disabled={submitting} onClick={finish}>{record||requestId?'Close':'Later'}</button>
      {(!record&&!requestId||canRecover)&&<button type="button" className="btn primary" disabled={!cluster||submitting} aria-busy={submitting} onClick={submit}>
        {canRecover?(kind==='vm'?'Start VM':'Start CT'):'Shutdown, Start & Verify'}
      </button>}
      {(!cluster||requestId&&!complete)&&<button type="button" className="btn secondary" disabled={submitting} onClick={()=>{setError('');setCheck(v=>v+1)}}>Check progress</button>}
      {initial && record && (finished(record.phase)||record.phase==='verifying'||record.phase==='recoverable'||record.phase==='unknown'&&reviewedHistory)&&
        <button type="button" className="btn secondary" onClick={async()=>{
          try{await api(restartsPath+'/'+record.id,{method:'DELETE'});onClose()}catch(e:any){setError(e.message)}
        }}>{record.phase==='unknown'?'Mark history reviewed':finished(record.phase)?'Dismiss result':'End tracking'}</button>}
    </div>
  </Modal>,document.body);
}
