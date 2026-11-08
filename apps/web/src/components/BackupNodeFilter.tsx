import {useSearchParams} from 'react-router-dom';

export default function BackupNodeFilter({nodes}:{nodes:string[]}){
 const [params,setParams]=useSearchParams();
 const node=params.get('node')||'all';
 const choices=Array.from(new Set([...nodes,node].filter(value=>value&&value!=='all'))).sort();
 function select(value:string){
  const next=new URLSearchParams(params);
  if(value==='all')next.delete('node');
  else next.set('node',value);
  setParams(next,{replace:true,preventScrollReset:true});
 }
 return <select aria-label="Backup node" value={node} onChange={event=>select(event.target.value)}>
  <option value="all">All Nodes</option>
  {choices.map(value=><option key={value}>{value}</option>)}
 </select>;
}
