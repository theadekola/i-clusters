import './temperature-reports.css';
import {useState} from 'react';
import {Area,AreaChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {api} from '../api';
import {useApi} from '../hooks';
import {reportCluster,clusterReportFilename} from '../cluster-context';
import {reportCsv} from '../backup-reports';
import {Card} from './UI';

type Sensor={id:string;kind:'system'|'drive';label:string;minimum:number;maximum:number;lastSeen:number};
type Series=Sensor & {latest:number;points:{time:number;value:number|null;minimum:number|null;maximum:number|null}[]};
type Report={enabled:boolean;host:string|null;hosts:{id:string;name:string;online:boolean;version:number}[];sensors:Sensor[];series:Series[];generatedAt:string};
const ranges=[['day','Last 24 hours'],['week','Last 7 days'],['month','Last 30 days']];
const display=(value:number)=>value.toLocaleString(undefined,{maximumFractionDigits:1})+' °C';

export default function TemperatureReports({role}:{role?:string}){
 const [host,setHost]=useState(''),[period,setPeriod]=useState('day'),[system,setSystem]=useState(''),[drive,setDrive]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const query=new URLSearchParams({period,host,system,drive});
 const live=useApi<Report|null>('/monitoring/temperatures?'+query,null,60000);
 const report=live.data,selected=report?.hosts?.find(h=>h.id===report.host);
 async function toggle(){
   if(!report)return;
   setBusy(true);setError('');
   try{await api('/monitoring/temperatures',{method:'PUT',body:JSON.stringify({enabled:!report.enabled})});await live.refresh()}
   catch(e:any){setError(e.message)}finally{setBusy(false)}
 }
 function download(){
   if(!report)return;
   const rows=report.series.flatMap(sensor=>sensor.points.filter(p=>p.value!==null).map(p=>[
     reportCluster().id,selected?.name,sensor.kind,sensor.id,sensor.label,new Date(p.time).toISOString(),p.minimum,p.value,p.maximum
   ]));
   const csv=reportCsv([['Cluster','Host','Type','Sensor ID','Sensor','Interval start UTC','Minimum °C','Average °C','Maximum °C'],...rows]);
   const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
   const a=document.createElement('a');a.href=url;a.download=clusterReportFilename('temperatures-'+period+'.csv');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section aria-label="Temperature reports" className="thermal-reports">
   <div className="header-actions">
    <label>Sensor host <select value={selected?.id||''} onChange={e=>{setHost(e.target.value);setSystem('');setDrive('')}}>{!selected&&<option value="">No paired hosts</option>}{report?.hosts?.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
    <label>Report period <select value={period} onChange={e=>setPeriod(e.target.value)}>{ranges.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    {['owner','admin'].includes(role||'')&&<label><input type="checkbox" role="switch" checked={report?.enabled===true} disabled={!report||busy} onChange={toggle}/> Collect temperatures</label>}
    <button className="btn secondary" disabled={!report?.series?.length} onClick={download}>Export CSV</button>
   </div>
   {(live.error||error)&&<p role="alert">{live.error||error}</p>}
   {report&&!report.enabled&&<p>Temperature collection is off for this cluster. An administrator can enable it here.</p>}
   {selected&&(!selected.online||selected.version<11)&&<p role="status">{!selected.online?'Connector offline. Showing retained readings.':'Update this connector to collect temperatures.'}</p>}
   <div className="performance-charts">{(['system','drive'] as const).map(kind=>{
    const series=report?.series?.find(s=>s.kind===kind);
    return <Card key={kind}><h3>{kind==='system'?'System temperature':'Drive temperature'}</h3>
     {series?<><label>Sensor <select value={series.id} onChange={e=>(kind==='system'?setSystem:setDrive)(e.target.value)}>{report?.sensors.filter(s=>s.kind===kind).map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
      <p>Last {display(series.latest)} · Min {display(series.minimum)} · Max {display(series.maximum)}</p>
      <ResponsiveContainer width="100%" height={185}><AreaChart data={series.points}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="time" type="number" domain={['dataMin','dataMax']} tickFormatter={t=>period==='day'?new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):new Date(t).toLocaleDateString([],{month:'short',day:'numeric'})}/><YAxis unit="°" width={42}/><Tooltip labelFormatter={v=>new Date(Number(v)).toLocaleString()} formatter={(v:any)=>display(Number(v))}/><Area name="Average" dataKey="value" stroke={kind==='system'?'#45b6e7':'#a77dec'} fill={kind==='system'?'#45b6e733':'#a77dec33'} dot={p=>p.value==null?<g key={p.index}/>:<circle key={p.index} cx={p.cx} cy={p.cy} r={1} fill="currentColor"/>} connectNulls={false} isAnimationActive={false}/></AreaChart></ResponsiveContainer><small>Last reading {new Date(series.lastSeen).toLocaleString()}</small></>:<p>{live.loading?'Loading readings…':'No measurements reported for this host and period.'}</p>}
    </Card>
   })}</div>
 </section>;
}
