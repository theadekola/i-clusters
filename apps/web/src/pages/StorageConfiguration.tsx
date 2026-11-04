import {isActionCancelled} from '../action-cancellation';
import DiskConfiguration from '../components/DiskConfiguration';
import StorageContents from '../components/StorageContents';
import RefreshButton from '../components/RefreshButton';
import ReportLoading from '../components/ReportLoading';
import {InspectableRow,TableAction,SelectionBody} from '../components/TableActions';
import {useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {Database,Plus,RefreshCw,Search,Eye,Play,Pause} from '../icons';
import {useApi} from '../hooks';
import {confirmedApi} from '../api';
import {Card,Badge,Modal} from '../components/UI';
import StorageRegistration from '../components/StorageRegistration';
import {storageTabs} from '../storage-navigation';

export const configurationLocation=(row:any)=>row.path||(row.server&&row.export?`${row.server}:${row.export}`:row.server||row.portal||(row.vgname?[row.vgname,row.thinpool].filter(Boolean).join(' / '):row.pool||'Not reported'));
export default function StorageConfiguration({onTab,admin,onChanged}:{onTab:(tab:string)=>void;admin:boolean;onChanged:()=>void}){
 const navigate=useNavigate();
 const live=useApi<any>('/proxmox/storage/configuration',null),[search,setSearch]=useState(''),[selected,setSelected]=useState<any>(null),[adding,setAdding]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const rows=Array.isArray(live.data?.resources)?live.data.resources:[],filtered=rows.filter((row:any)=>[row.id,row.type,configurationLocation(row),...(row.content||[]),...(row.nodes||[])].join(' ').toLowerCase().includes(search.toLowerCase()));
 const refresh=async()=>{await live.refresh();onChanged()};
 const toggle=async(row:any)=>{if(!admin||busy||typeof row.enabled!=='boolean')return;setBusy(true);setError('');setMessage('');try{await confirmedApi(`/proxmox/storage/${encodeURIComponent(row.id)}/enabled`,{method:'PUT',body:JSON.stringify({enabled:!row.enabled})});setMessage(`${row.id} ${row.enabled?'disabled':'enabled'} in the cluster configuration. Node availability is checked separately.`);await refresh()}catch(e:any){if(isActionCancelled(e))return;setError(e.message||'Storage configuration could not be changed.')}finally{setBusy(false)}};
 if(selected)return <StorageContents storage={selected} admin={admin} onBack={()=>setSelected(null)}/>;
 return <section className="storage-configuration storage-overview"><div className="page-header"><div><h1><Database className="page-title-icon"/>Storage Configuration</h1><p className="muted">Cluster-wide Proxmox storage registrations, shown once per storage ID.</p></div><div className="header-actions"><RefreshButton className="btn secondary" aria-busy={live.loading||busy} disabled={live.loading||busy} onClick={refresh}><RefreshCw size={15}/>Refresh</RefreshButton>{admin&&<button className="btn primary" aria-busy={busy} disabled={busy} onClick={()=>{setError('');setAdding(true)}}><Plus size={15}/>Configure Disk</button>}</div></div>
 <div className="tabs" role="tablist">{storageTabs.map(tab=><button key={tab} role="tab" aria-selected={tab==='Configuration'} className={tab==='Configuration'?'active':''} onClick={()=>onTab(tab)}>{tab}</button>)}</div>

 {(error||live.error)&&<p className="error" role="alert">{error||live.error}</p>}{message&&<p className="storage-feedback" role="status">{message}</p>}
 <Card className="storage-configuration-card"><div className="storage-overview-toolbar"><h3>Storage Configuration</h3><label><Search size={15}/><input aria-label="Search storage configuration" placeholder="Search ID, path or node…" value={search} onChange={event=>setSearch(event.target.value)}/></label><small className="muted">{live.error&&!live.data?'Configuration unavailable':live.loading&&!live.data?<ReportLoading/>:`${filtered.length} of ${rows.length} storage IDs`}</small></div>
 <div className="table-wrap"><table className="single-line-table configuration-table"><thead><tr>{['ID','Type','Content','Path / Server','Nodes','Shared','Configuration Status','Actions'].map(label=><th key={label}>{label}</th>)}</tr></thead><SelectionBody>{filtered.map((row:any)=><InspectableRow key={row.id} onInspect={()=>{if(row.content?.length===1&&row.content[0]==='backup')navigate('/backups?tab=Restore%20Points&storage='+encodeURIComponent(row.id));else setSelected({...row})}} aria-label={`Storage ${row.id}`}><td><span className="configuration-id"><Database size={16}/><b>{row.id}</b></span></td><td><Badge tone="gray">{row.type}</Badge></td><td><div className="configuration-tags">{row.content?.length?row.content.map((content:string)=><Badge key={content} tone="blue">{content}</Badge>):<span className="muted">Not reported</span>}</div></td><td><span className="configuration-path" title={configurationLocation(row)}>{configurationLocation(row)}</span></td><td>{row.nodes?.length?row.nodes.join(', '):'All'}</td><td>{row.shared===true?'Yes':row.shared===false?'No':'Not set'}</td><td><Badge tone={row.enabled===true?'green':row.enabled===false?'gray':'yellow'}>{row.enabled===true?'Enabled':row.enabled===false?'Disabled':'Unknown'}</Badge></td><td><div className="table-actions"><TableAction label={`View contents ${row.id}`} title="View storage contents" onClick={()=>{if(row.content?.length===1&&row.content[0]==='backup')navigate('/backups?tab=Restore%20Points&storage='+encodeURIComponent(row.id));else setSelected({...row})}}><Eye size={16}/></TableAction>{admin&&<TableAction disabled={busy||typeof row.enabled!=='boolean'} label={`${row.enabled?'Disable':'Enable'} storage ${row.id} across assigned nodes`} title={`${row.enabled?'Disable':'Enable'} across assigned nodes`} onClick={()=>toggle(row)}>{row.enabled?<Pause size={16}/>:<Play size={16}/>}</TableAction>}</div></td></InspectableRow>)}</SelectionBody></table></div>
 {!filtered.length&&<p className="muted">{live.loading?<ReportLoading/>:live.error?'Configuration could not be read. Retry after checking Proxmox connectivity and token permissions.':rows.length?'No matching storage configuration.':'No Proxmox storage registrations were reported.'}</p>}
 <small className="muted">Configuration source: Proxmox cluster. Last read: {live.data?.sampledAt?new Date(live.data.sampledAt).toLocaleString():'Not available'}.</small></Card>
 <p className="muted">TrueNAS pools and Docker volumes are shown in their storage views. This table lists registrations managed by the connected Proxmox cluster.</p><Link className="btn secondary small" to="/settings?tab=Connections">Manage Connections</Link>
 <Modal open={adding} title="Configure Disk" closeDisabled={busy} onClose={()=>!busy&&setAdding(false)}><DiskConfiguration onBusy={setBusy} onSaved={()=>{setAdding(false);setMessage('Disk storage configured successfully.');void refresh()}}/></Modal>
 </section>;
}
