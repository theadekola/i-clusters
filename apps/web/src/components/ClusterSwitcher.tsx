import {useEffect,useState} from 'react';
import {Check,ChevronDown,Layers,Settings} from 'lucide-react';
import {useLocation,useNavigate} from 'react-router-dom';
import {clusterId,clusterLocation,nameCluster} from '../cluster-context';
import {useClusterProfiles,hostSettingsPath} from '../cluster-profiles';
import ClusterStatus from './ClusterStatus';
import {Modal} from './UI';
import {ClusterConnection} from './ClusterConnection';
import './cluster-switcher.css';

export default function ClusterSwitcher({owner}:{owner:boolean}){
  const {profiles,current,error,refresh,loading}=useClusterProfiles();
  const [open,setOpen]=useState(false),[pendingId,setPendingId]=useState('');
  const target=profiles.find(p=>p.id===pendingId);
  const location=useLocation(),navigate=useNavigate();
  const label=current?.name||'';
  const displayName=current?.endpoint&&profiles.some(p=>p.id!==current.id&&p.name===label)?label+' · '+current.endpoint:label;
  const approvalLabel=profiles.length>1?displayName:'';
  useEffect(()=>{nameCluster(approvalLabel,current)},[approvalLabel,current]);
  function close(){setPendingId('');setOpen(false)}
  return <>
    <button type="button" className="cluster-switch-button" aria-label="Switch cluster" aria-describedby="active-cluster-summary" title={displayName||'Switch cluster'}
      aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setOpen(true);void refresh()}}>
      <Layers size={17} aria-hidden="true"/><span id="active-cluster-summary"><span id="current-cluster-name" translate={current?.configured?'no':undefined}>{current?.configured?displayName:'Clusters'}</span>
      <span id="current-cluster-status"><ClusterStatus profile={current} error={error} checking={loading}/></span></span><ChevronDown size={14} aria-hidden="true"/>
    </button>
    <Modal portal open={open} title="Switch cluster" onClose={close}>
      {error&&<p role="alert" className="error">{error}</p>}
      <div className="cluster-switch-list">{profiles.map(profile=><button key={profile.id} type="button" className="btn secondary"
        aria-current={profile.id===clusterId?'true':undefined} onClick={()=>profile.id===clusterId?close():setPendingId(profile.id)}>
        <Layers size={17}/><span className="cluster-switch-identity"><span className="cluster-switch-line">
          <span className="cluster-switch-name" translate={profile.configured?'no':undefined}>{profile.configured?profile.name:'Default workspace'}</span>
          <ClusterStatus profile={profile} error={error}/>
        </span>{profile.endpoint&&<small translate="no">{profile.endpoint}</small>}</span>
        {profile.id===clusterId&&<Check size={17} aria-label="Selected"/>}
      </button>)}</div>
      {owner&&<div className="cluster-switch-actions"><ClusterConnection compact createNew label="Add cluster" onConnected={()=>{close();void refresh()}}/>
        <button type="button" className="btn secondary" onClick={()=>{close();navigate(hostSettingsPath)}}><Settings size={16}/><span>Settings</span></button>
      </div>}
    </Modal>
    <Modal portal open={open&&!!target} title="Confirm cluster switch" onClose={()=>setPendingId('')}>
      {target&&<><p>Switch to this cluster?</p><p className="cluster-switch-target" translate="no"><strong>{target.name}</strong>{target.endpoint&&<small>{target.endpoint}</small>}</p>
        <div className="modal-actions"><button type="button" className="btn secondary" onClick={()=>setPendingId('')}>No</button>
        <button type="button" className="btn primary" onClick={()=>window.location.assign(clusterLocation(target.id,location.pathname))}>Yes</button></div></>}
    </Modal>
  </>;
}
