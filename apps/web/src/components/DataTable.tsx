import React from 'react';
import {Eye} from '../icons';
import {InspectableRow,SelectionBody} from './TableActions';
export function DataTable({columns,rows,onInspect,rowLabel}:{columns:{key:string;label:string;render?:(row:any)=>React.ReactNode}[];rows:any[];onInspect?:(row:any)=>void;rowLabel?:(row:any)=>string}) {
  const addAction=!!onInspect&&!columns.some(c=>c.key==='actions'||c.key==='action');
  return <div className="table-wrap"><table><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}{addAction&&<th>Actions</th>}</tr></thead>
  <SelectionBody>{rows.map((r,i)=>onInspect?<InspectableRow key={r.id||i} onInspect={()=>onInspect(r)} aria-label={rowLabel?.(r)}>{columns.map(c=><td key={c.key}>{c.render?c.render(r):String(r[c.key]??'')}</td>)}{addAction&&<td><button type="button" className="btn secondary table-action" aria-label={rowLabel?.(r)||'View details'} onClick={()=>onInspect(r)}><Eye size={16}/></button></td>}</InspectableRow>:<tr key={r.id||i}>{columns.map(c=><td key={c.key}>{c.render?c.render(r):String(r[c.key]??'')}</td>)}</tr>)}</SelectionBody></table></div>
}
