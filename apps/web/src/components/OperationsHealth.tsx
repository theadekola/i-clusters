import RefreshButton from './RefreshButton';
import ConnectionActionDialog from './ConnectionActionDialog';
import ReportLoading from './ReportLoading';
import './operations.css';
import {useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {useApi} from '../hooks';
import {api} from '../api';
import {Card} from './UI';
const value=(v:any,suffix='')=>typeof v==='number'?`${v}${suffix}`:'Not reported';
export default function OperationsHealth(){
 const live=useApi<any>('/operations/health',null,30000),session=useApi<any>('/auth/me',null),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[checks,setChecks]=useState<any>(null);
 const performance=useApi<any>('/operations/performance',null,30000);
 const owner=session.data?.user?.role==='owner',nodes=live.data?.nodes||[],node=nodes.find((n:any)=>n.id===selected)||nodes[0],current=node?.status==='current',report=node?.report;
 const [toolsNode,setToolsNode]=useState<any>(null);
 const pending=useRef(false);
 const checkNetwork=async()=>{
  if(pending.current||!node)return;
  pending.current=true;setBusy(true);setError('');
  try{
   const result=await api(`/operations/${encodeURIComponent(node.id)}/network-check`,{method:'POST',body:'{}'});
   setChecks(result.result);await live.refresh();
  }catch(e:any){setError(e.message)}finally{pending.current=false;setBusy(false)}
 };
 return <>{toolsNode&&<ConnectionActionDialog node={toolsNode} target="node" targetName={toolsNode.name} action="monitoring-tools" onClose={()=>setToolsNode(null)} onChanged={()=>{void live.refresh()}}/>}<Card className="operational-panel"><h1>Hardware, Power & Network Diagnostics</h1><RefreshButton indicator className="btn secondary" aria-busy={busy||live.loading||performance.loading} disabled={busy||live.loading||performance.loading} onClick={()=>Promise.all([live.refresh(),performance.refresh()])}>Refresh Readings</RefreshButton><p>Read-only host measurements from paired connectors. Missing tools or stale reports are shown explicitly.</p>{live.error&&<p role="alert">{live.error}</p>}{!nodes.length&&<p>{live.loading?<ReportLoading/>:'Pair a host under Connections to enable operational monitoring.'}</p>}{!!nodes.length&&<><label>Host<select aria-label="Operational host" value={node?.id||''} disabled={busy} onChange={e=>{setSelected(e.target.value);setChecks(null);setError('');}}>{nodes.map((n:any)=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label><p role="status">Report: {node?.status} · {report?.receivedAt?new Date(report.receivedAt).toLocaleString():'No measurements yet'}</p>{!current&&<p>Operational tools require an online node connector version 7 and a fresh report. <Link to="/settings?tab=Connections">Manage or update the connector</Link>.</p>}{current&&<><h3>Disk health</h3><button className="btn secondary" aria-busy={!!(busy)} disabled={!owner||busy} onClick={()=>setToolsNode(node)}>Install Monitoring Tools</button>{report.disks.map((r:any,i:number)=><p key={i}>{r.name}: {r.healthy===true?'Passed':r.healthy===false?'Failed':'Not reported'}</p>)}<h3>UPS</h3>{!report.ups.length&&<p>No local UPS reported. Configure Network UPS Tools on this host to report battery readings.</p>}{report.ups.map((r:any,i:number)=><p key={i}>{r.name}: {r.status||'Not reported'} · Battery {value(r.charge,'%')} · Runtime {value(r.runtime,' seconds')}</p>)}{report.errors.map((e:string,i:number)=><p className="muted" key={i}>{e}</p>)}</>}<h3>Report response times</h3><p>{performance.data?.note}</p>{performance.error&&<p role="alert">{performance.error}</p>}{performance.data?.routes?.map((r:any)=><p key={r.route}>{r.route} · {r.samples} samples · p50 {r.p50} ms · p95 {r.p95} ms · {r.errors} errors</p>)}<h3>Registry connectivity</h3><p>Tests fixed Docker registry HTTPS endpoints from the paired host. Guest networking must be checked separately. Authentication-required responses still demonstrate endpoint reachability.</p><button className="btn secondary" aria-busy={!!(busy)} disabled={!owner||!current||busy} onClick={checkNetwork}>{busy?'Checking…':'Run Network Diagnostics'}</button>{checks?.checks?.map((r:any)=><p key={r.name}>{r.name}: {r.status} {r.milliseconds!=null?`· ${r.milliseconds} ms`:''} {r.dnsMilliseconds!=null?` · DNS ${r.dnsMilliseconds} ms · TLS ${r.tlsMilliseconds} ms`:''} {r.message||''}</p>)}</>}{busy&&<ReportLoading message="Waiting for host operation…"/>}{error&&<p className="error" role="alert">{error}</p>}</Card></>;
}
