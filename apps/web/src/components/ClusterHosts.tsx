import {useRef,useState,type FormEvent} from 'react';
import {Activity,Trash2} from 'lucide-react';
import {api} from '../api';
import {useLocale} from '../i18n/locale';
import hostLabels from '../i18n/cluster-hosts.json';
import {clusterId,clusterLocation} from '../cluster-context';
import {hostSettingsPath,useClusterProfiles,type ClusterProfile} from '../cluster-profiles';
import {Modal} from './UI';
import {useApi} from '../hooks';
import {proxmoxAvailability} from '../proxmox-availability';
import {ResourceHeader,ResourceReadings,storagePercent} from './ProxmoxResourceCard';

function useHostLabels(){
  const language=useLocale().split('-')[0] as keyof typeof hostLabels;
  return hostLabels[language];
}

type RemovalTarget=Pick<ClusterProfile,'id'|'name'|'endpoint'>;

export function RemoveClusterDialog({profile,onClose,onRemoved}:{profile:RemovalTarget;onClose:()=>void;onRemoved:()=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef(false);
  const labels=useHostLabels();
  async function remove(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(pending.current)return;
    const form=event.currentTarget;
    const password=new FormData(form).get('password');
    if(!password)return;
    pending.current=true;setBusy(true);setError('');form.reset();
    try{
      await api('/connections/proxmox',{method:'DELETE',clusterProfile:profile.id,body:JSON.stringify({password})});
      if(profile.id===clusterId&&clusterId!=='default'){
        window.location.assign(clusterLocation('default',hostSettingsPath));
        return;
      }
      onRemoved();
    }catch(e:any){setError(e.message)}
    finally{pending.current=false;setBusy(false)}
  }
  return <Modal portal open title={labels.remove} onClose={onClose} closeDisabled={busy}>
    <form className="cluster-removal-form" onSubmit={remove}>
      <div className="cluster-switch-target" translate="no"><strong>{profile.name}</strong>{profile.endpoint&&<small>{profile.endpoint}</small>}</div>
      <label>{labels.password}<input name="password" type="password" autoComplete="current-password" required disabled={busy}/></label>
      {error&&<p role="alert" className="error">{error}</p>}
      <div className="confirmation-actions"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="btn danger" disabled={busy} aria-busy={busy}>{labels.remove}</button></div>
    </form>
  </Modal>;
}

function HostReadings({id}:{id:string}){
  const live=useApi<any>('/proxmox',null,30000,id);
  const report=live.error?null:live.data;
  const {cpuUsed,cores,usedMemory,totalMemory,storage}=proxmoxAvailability(report);
  const ratio=(used:number|null,total:number|null)=>used!=null&&total?100*used/total:null;
  return <ResourceReadings cpu={ratio(cpuUsed,cores)} memory={ratio(usedMemory,totalMemory)} disk={storagePercent(storage)}/>;
}

function HostCard({profile,stale,refresh,onRemove}:{profile:ClusterProfile;stale:boolean;refresh:()=>Promise<void>;onRemove:()=>void}){
  const [checking,setChecking]=useState(false),[error,setError]=useState(''),[checked,setChecked]=useState('');
  const labels=useHostLabels();
  async function check(){
    setChecking(true);setError('');setChecked('');
    try{
      const result=await api<Pick<ClusterProfile,'id'|'status'>>('/cluster-profiles/'+encodeURIComponent(profile.id)+'/health');
      setChecked(result.status==='online'?'Online':result.status==='offline'?'Offline':'Unknown');
      await refresh();
    }catch(e:any){setError(e.message)}
    finally{setChecking(false)}
  }
  const status=stale?'unknown':profile.status;
  return <article className="pve-resource-card cluster-host-card" data-status={status} aria-label={profile.name}>
    <ResourceHeader name={profile.name} subtitle={profile.endpoint} status={status==='online'?'Online':status==='offline'?'Offline':'Unknown'} kind="cluster"/>
    {status==='online'?<HostReadings id={profile.id}/>:<ResourceReadings/>}
    {checked&&<small role="status"><span>Cluster Health</span> · <span>{checked}</span></small>}
    {error&&<small role="alert" className="error">{error}</small>}
    <footer>
      <button type="button" onClick={check} disabled={checking} aria-busy={checking}><Activity size={15}/>{labels.check}</button>
      <button type="button" onClick={onRemove}><Trash2 size={15}/>Remove</button>
    </footer>
  </article>;
}

export default function ClusterHosts(){
  const {profiles,loading,error,refresh}=useClusterProfiles();
  const [target,setTarget]=useState<ClusterProfile|null>(null);
  const labels=useHostLabels();
  const hosts=profiles.filter(p=>p.configured);
  return <section aria-label="Clusters">
    <h2>Clusters</h2>
    {error&&<p role="alert" className="error">{error}</p>}
    {hosts.length?<div className="pve-resource-grid">{hosts.map(profile=><HostCard key={profile.id} profile={profile} stale={!!error} refresh={refresh} onRemove={()=>setTarget(profile)}/>)}</div>
      :!error&&<p role="status">{loading?'Checking…':labels.empty}</p>}
    {target&&<RemoveClusterDialog profile={target} onClose={()=>setTarget(null)} onRemoved={()=>{setTarget(null);void refresh()}}/>}
  </section>;
}
