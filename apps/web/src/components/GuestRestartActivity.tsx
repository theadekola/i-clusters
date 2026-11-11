import {useState} from 'react';
import {useApi} from '../hooks';
import {finished,restartMessage,restartsPath,type RestartList,type RestartRecord} from '../guest-power-cycle';
import GuestRestartDialog from './GuestRestartDialog';

type Select=(record:RestartRecord)=>void;
function RestartItem({record,select}:{record:RestartRecord;select:Select}){
  return <div><button type="button" className="btn secondary small" onClick={()=>select(record)}>
    {record.name} ({record.node} / {record.guest}) · {restartMessage(record)}
  </button></div>;
}
function refreshInterval(r?:RestartRecord){return r&&finished(r.phase)?0:10000}
function ActiveRestart({row,select}:{row:RestartRecord;select:Select}){
  const {data}=useApi<RestartRecord>(restartsPath+'/'+row.id,row,refreshInterval);
  return <RestartItem record={data?.id===row.id?data:row} select={select}/>;
}
export default function GuestRestartActivity(){
  const [selected,setSelected]=useState<RestartRecord|null>(null);
  const {data}=useApi<RestartList>(restartsPath,{cluster:'',restarts:[]},30000);
  if(!Array.isArray(data?.restarts)||(!data.restarts.length&&!selected))return null;
  const active=data.restarts.filter(r=>!finished(r.phase));
  const recent=data.restarts.filter(r=>finished(r.phase));
  return <section aria-label="Guest restarts">
    {active.map(r=><ActiveRestart key={r.id} row={r} select={setSelected}/>)}
    {recent[0]&&<RestartItem record={recent[0]} select={setSelected}/>}
    {recent.length>1&&<details><summary>Recent guest restarts ({recent.length-1})</summary>{recent.slice(1).map(r=><RestartItem key={r.id} record={r} select={setSelected}/>)}</details>}
    {selected&&<GuestRestartDialog key={selected.id} initial={selected} name={selected.name} node={selected.node} id={selected.guest} kind={selected.kind} reason={selected.reason}
      onClose={()=>setSelected(null)} onComplete={()=>setSelected(null)}/>}
  </section>;
}
