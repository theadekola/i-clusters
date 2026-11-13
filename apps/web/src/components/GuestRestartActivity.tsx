import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useApi} from '../hooks';
import {finished,restartMessage,restartsPath,type RestartList,type RestartRecord} from '../guest-power-cycle';
import {claimRestartNotice,hasRestartDialog} from '../restart-notices';
import GuestRestartDialog from './GuestRestartDialog';

type Select=(record:RestartRecord)=>void;
function RestartLabel({record}:{record:RestartRecord}){
  return <>{record.name} ({record.node} / {record.guest}) · {restartMessage(record)}</>;
}
function RestartItem({record,select}:{record:RestartRecord;select:Select}){
  return <div><button type="button" className="btn secondary small" onClick={()=>select(record)}><RestartLabel record={record}/></button></div>;
}
const updateComplete=(r:RestartRecord)=>r.reason==='update'&&r.phase==='complete';
function refreshInterval(r?:RestartRecord){return r&&finished(r.phase)?0:10000}
function ActiveRestart({row,select,notify}:{row:RestartRecord;select:Select;notify:Select}){
  const {data}=useApi<RestartRecord>(restartsPath+'/'+row.id,row,refreshInterval);
  const record=data?.id===row.id?data:row;
  useEffect(()=>{if(updateComplete(record))notify(record)},[record,notify]);
  return updateComplete(record)?null:<RestartItem record={record} select={select}/>;
}
function CompletionNotice({record,onDone}:{record:RestartRecord;onDone:(id:string)=>void}){
  useEffect(()=>{const timer=setTimeout(()=>onDone(record.id),5000);return ()=>clearTimeout(timer)},[record.id,onDone]);
  return <div className="restart-toast" role="status"><RestartLabel record={record}/></div>;
}
export default function GuestRestartActivity(){
  const [selected,setSelected]=useState<RestartRecord|null>(null);
  const [notices,setNotices]=useState<RestartRecord[]>([]);
  const {data}=useApi<RestartList>(restartsPath,{cluster:'',restarts:[]},30000);
  const watching=useRef(new Set<string>());
  const notify=useCallback((r:RestartRecord)=>{
    if(hasRestartDialog(r.id))return;
    // Historical results on sign-in are available in task history.
    if(!watching.current.has(r.id)&&Date.now()-Date.parse(r.updated_at)>120000)return;
    if(claimRestartNotice(r.id))setNotices(previous=>[...previous,r]);
  },[]);
  const dismiss=useCallback((id:string)=>setNotices(rows=>rows.filter(row=>row.id!==id)),[]);
  useEffect(()=>{
    if(!Array.isArray(data?.restarts))return;
    const update=()=>{
      for(const r of data.restarts)if(updateComplete(r))notify(r);
      watching.current=new Set(data.restarts.filter(r=>!finished(r.phase)).map(r=>r.id));
    };
    update();window.addEventListener('iclusters-restart-dialog-closed',update);
    return ()=>window.removeEventListener('iclusters-restart-dialog-closed',update);
  },[data,notify]);
  const rows=Array.isArray(data?.restarts)?data.restarts:[];
  const active=rows.filter(r=>!finished(r.phase));
  const recent=rows.filter(r=>finished(r.phase)&&!updateComplete(r));
  return <>
    {(active.length>0||recent.length>0)&&<section aria-label="Guest restarts">
      {active.map(r=><ActiveRestart key={r.id} row={r} select={setSelected} notify={notify}/>)}
      {recent[0]&&<RestartItem record={recent[0]} select={setSelected}/>}
      {recent.length>1&&<details><summary>Recent guest restarts ({recent.length-1})</summary>{recent.slice(1).map(r=><RestartItem key={r.id} record={r} select={setSelected}/>)}</details>}
    </section>}
    {notices.length>0&&createPortal(<div className="restart-notices">{notices.map(r=><CompletionNotice key={r.id} record={r} onDone={dismiss}/>)}</div>,document.body)}
    {selected&&<GuestRestartDialog key={selected.id} initial={selected} name={selected.name} node={selected.node} id={selected.guest} kind={selected.kind} reason={selected.reason}
      onClose={()=>setSelected(null)} onComplete={()=>setSelected(null)}/>}
  </>;
}
