import RefreshButton from './RefreshButton';
import {OSIcon} from './BrandIcon';
import {Link} from 'react-router-dom';
import {Monitor,Database,Wrench,RefreshCw,ExternalLink,AppWindow} from 'lucide-react';
import {Card,Badge} from './UI';
import {safeLocale} from '../regional';
const uptime=(value:any)=>typeof value==='number'&&Number.isFinite(value)?`${Math.floor(value/86400)}d ${Math.floor(value%86400/3600)}h ${Math.floor(value%3600/60)}m`:'Not reported';
function Block({title,detail,icon:Icon,children}:any){return <Card className="settings-overview-card system-settings-card"><div className="settings-card-heading"><span><Icon size={23}/></span><div><h2>{title}</h2><p>{detail}</p></div></div>{children}</Card>}
type Props={
 data:any;
 busy:boolean;
 owner:boolean;
 show:(title:string,keywords:string)=>boolean;
 onRefresh:()=>Promise<unknown>;
 onClear:()=>void;
 onReload:()=>void;
 onShowChecks:()=>void;
};
export default function SystemSettings({data,busy,onRefresh,onClear,onReload,show,owner,onShowChecks}:Props){
 const system=data.system||{},fact=(label:string,value:any)=><div className="settings-fact" key={label}><span>{label}</span><b>{value??'Not reported'}</b></div>;
 return <>
 {show('System Information','hostname operating system kernel architecture Node runtime uptime time database')&&<Block title="System Information" detail="Live information about the i-Clusters API runtime." icon={Monitor}>{fact('API status',<Badge tone="green">Responding</Badge>)}{fact('Hostname',system.hostname)}{fact('Operating system',<span><OSIcon hints={[system.operatingSystem,system.platform]} size={18}/> {system.operatingSystem||system.platform||'Not reported'}</span>)}{fact('Kernel',system.release)}{fact('Architecture',system.architecture)}{fact('Node.js runtime',system.runtime)}{fact('API uptime',uptime(system.uptime))}{fact('Server time',system.serverTime&&!Number.isNaN(Date.parse(system.serverTime))?new Date(system.serverTime).toLocaleString(safeLocale(navigator.language)):'Not reported')}{fact('Account / audit database','PostgreSQL')}{fact('Monitoring / settings state','Persisted JSON')}<small className="settings-note">Runtime information may describe a container. API uptime is not the host’s uptime.</small></Block>}
 {show('System Maintenance','cache refresh reload browser')&&<Block title="System Maintenance" detail="Browser maintenance tools." icon={Wrench}><div className="system-maintenance-actions"><button type="button" className="btn secondary" onClick={onClear}><Database size={17}/><span>Clear Read Cache<small>Refresh cached browser API reads</small></span></button><RefreshButton type="button" className="btn secondary" aria-busy={busy} disabled={busy} onClick={onRefresh}><RefreshCw size={17}/><span>Refresh System Information<small>Read the current server metadata</small></span></RefreshButton><button type="button" className="btn secondary" onClick={onReload}><AppWindow size={17}/>Reload Interface</button></div>{owner&&<Link className="settings-card-link" to="?tab=General#provider-compatibility" onClick={onShowChecks}>Provider Compatibility Checks<ExternalLink size={14}/></Link>}<small className="settings-note">Reloading affects this browser and may disconnect open terminals. It does not restart i-Clusters services or guests.</small></Block>}
 </>;
}
