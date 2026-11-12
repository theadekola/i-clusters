import {clusterReportFilename,reportCluster} from '../cluster-context';
import RefreshButton from '../components/RefreshButton';
import ClusterTopology from '../components/ClusterTopology';
import {InspectableRow,SelectionBody} from '../components/TableActions';
import ReportLoading from '../components/ReportLoading';
import NetworkTraffic from './NetworkTraffic';
import NetworkDNS from './NetworkDNS';
import NetworkRouting from './NetworkRouting';
import NetworkDevices from './NetworkDevices';
import ProxmoxNetworks from './ProxmoxNetworks';
import {useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {Network as NetworkIcon,Server,Shield,RefreshCw,Download,Layers} from 'lucide-react';
import {useApi} from '../hooks';
import {Card,PageHeader,Stat,Tabs,Modal} from '../components/UI';
import DockerHostSelector from '../components/DockerHostSelector';
export default function Network(){
 const cluster=useApi<any>('/proxmox',null);
 const live=useApi<any>('/network',null),session=useApi<any>('/auth/me',null);
 const [params,setParams]=useSearchParams();
 const sections=['Network Map','Interfaces','Devices','Routing','DNS','Traffic Analysis','Docker Networks'];
 const tab=sections.includes(params.get('tab')||'')?params.get('tab')!:'Network Map';
 const setTab=(value:string)=>{const next=new URLSearchParams(params);next.set('tab',value);setParams(next);};
 const [search,setSearch]=useState(''),[selected,setSelected]=useState<any>(null);
 const data=live.data,interfaces=data?.interfaces||[],networks=data?.networks||[],connectors=data?.connectors||[];
 const configured=connectors.filter((r:any)=>r.status!=='not-configured'),reachable=configured.filter((r:any)=>r.status==='reachable').length;

 const overview=tab==='Network Map'||tab==='Docker Networks';
 const dockerKnown=!live.error&&(data?.dockerNetworksReported??!!data?.dockerHost?.name);
 const interfacesKnown=!live.error&&(data?.interfaceCoverage?.complete===true||data?.interfaceCoverage?.readNodes?.length>0||interfaces.length>0);
 const rows=(dockerKnown?networks:[]).filter((r:any)=>JSON.stringify(r).toLowerCase().includes(search.trim().toLowerCase()));
 const network=tab==='Docker Networks'&&dockerKnown&&selected&&selected.host===data?.dockerHost?.id?networks.find((r:any)=>r.id===selected?.id):null;
 const inspect=(r:any)=>setSelected({id:r.id,host:data?.dockerHost?.id});
 const exportReport=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({sourceCluster:reportCluster(),network:data,topology:cluster.data},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=clusterReportFilename('iclusters-network.json');a.click();URL.revokeObjectURL(url)};
 const navigation=<Tabs items={['Network Map','Interfaces','Devices','Routing','DNS','Traffic Analysis','Docker Networks']} active={tab} onChange={v=>{setTab(v);setSearch('');setSelected(null)}}/>;
 return <div className="network-overview">{overview&&<PageHeader title="Network Overview" subtitle="Explore connected nodes, virtual machines and containers." actions={<><RefreshButton className="btn secondary" aria-busy={live.loading||cluster.loading} disabled={live.loading||cluster.loading} onClick={()=>Promise.all([live.refresh(),cluster.refresh()])}><RefreshCw size={15}/> Refresh</RefreshButton><button className="btn secondary" disabled={!data} onClick={exportReport}><Download size={15}/> Export</button><Link className="btn primary" to="/proxmox?tab=Networks"><NetworkIcon size={14}/>Manage Interfaces</Link></>}/>}
 {overview&&live.error&&<p role="alert" className="error">{live.error}</p>}
 {overview&&<div className="network-stats metric-grid"><Stat reading={live} label="Provider Availability" value={configured.length?`${reachable}/${configured.length}`:'Unknown'} sub="Responding providers" icon={<Shield/>}/><Stat reading={cluster} label="Network Nodes" value={cluster.data&&!cluster.error&&(cluster.data.nodeInventory?.complete!==false||cluster.data.nodes?.length)?cluster.data.nodes?.length??'Unknown':'Unknown'} sub="Reported Proxmox nodes" icon={<Server/>}/><Stat reading={live} label={data?.interfaceCoverage?.complete===false?'Reported Interfaces':'Interfaces'} value={interfacesKnown?interfaces.length:'Unknown'} sub={interfacesKnown?`${interfaces.filter((r:any)=>r.status==='up').length} reported up`:'Not reported'} icon={<NetworkIcon/>}/><Stat reading={live} label="Docker Networks" value={dockerKnown?networks.length:'Unknown'} sub="Selected Docker host" icon={<Layers/>}/></div>}
 {overview&&navigation}
 {tab==='Traffic Analysis'?<NetworkTraffic navigation={navigation}/>:tab==='DNS'?<NetworkDNS navigation={navigation}/>:tab==='Routing'?<NetworkRouting navigation={navigation} onMap={()=>setTab('Network Map')}/>:tab==='Devices'?<NetworkDevices navigation={navigation}/>:tab==='Interfaces'?<ProxmoxNetworks navigation={navigation} interfaceView role={session.data?.user?.role} clusterUrl={cluster.data?.cluster?.url}/>:<div className="network-layout network-topology-layout"><div>{tab==='Network Map'?<ClusterTopology networkMap interfaces={live.error?undefined:data?.interfaces} data={cluster.data} loading={cluster.loading} error={cluster.error}/>:<Card><div className="network-panel-head"><h3>{tab}</h3><input aria-label="Search network resources" placeholder="Search network resources" value={search} onChange={e=>setSearch(e.target.value)}/></div>
 <DockerHostSelector/><p className="muted">Selected host: {data?.dockerHost?.name||data?.dockerHost?.id||'Unavailable'}.</p>
 <div className="table-wrap" tabIndex={0} role="region" aria-label="Network resources table, scroll horizontally for all columns"><table className="single-line-table"><thead><tr><th>Name</th><th>Driver</th><th>Subnet</th><th>Actions</th></tr></thead><SelectionBody>
 {rows.map((r:any)=><InspectableRow onInspect={()=>inspect(r)} aria-label={`Inspect ${r.name||r.id}`} key={r.id}><td>{r.name||r.id}</td><td>{r.driver||'Not reported'}</td><td>{r.subnets||'Not reported'}</td><td><button className="btn secondary small" onClick={()=>inspect(r)}>Details</button></td></InspectableRow>)}
 </SelectionBody></table></div>{!rows.length&&<p className="muted">{live.loading?<ReportLoading/>:dockerKnown?'No matching resources reported.':'Docker network inventory unavailable.'}</p>}
 {dockerKnown&&<small className="muted">{rows.length} resources</small>}</Card>}</div>
</div>}
 {overview&&(data?.errors?.length>0||connectors.some((r:any)=>r.error))&&<Card><details><summary>Connection diagnostics</summary>{data?.errors?.map((e:string,i:number)=><p className="muted small" key={i}>{e}</p>)}{connectors.filter((r:any)=>r.error).map((r:any)=><p className="muted small" key={r.name}>{r.name}: {r.error}</p>)}</details></Card>}
 {overview&&<small className="muted">Last measurement: {data?.sampledAt?new Date(data.sampledAt).toLocaleString():'Pending'}</small>}
 <Modal open={!!network} title={network?.name||'Network details'} onClose={()=>setSelected(null)}>{network&&<><dl className="network-inspector">{Object.entries({Name:network.name,Host:data.dockerHost?.name||data.dockerHost?.id,Driver:network.driver,Scope:network.scope,Subnet:network.subnets,Gateways:network.gateways}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{String(value||'Not reported')}</dd></div>)}</dl><details><summary>Reported Data</summary><pre className="live-output">{JSON.stringify(network,null,2)}</pre></details></>}</Modal></div>;
}
