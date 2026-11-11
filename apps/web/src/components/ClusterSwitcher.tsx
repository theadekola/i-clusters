import {useEffect,useState} from 'react';
import {Check,ChevronDown,Layers} from 'lucide-react';
import {useLocation} from 'react-router-dom';
import {useApi} from '../hooks';
import {clusterId,clusterLocation,nameCluster} from '../cluster-context';
import {Modal} from './UI';
import {ClusterConnection} from './ClusterConnection';
import './cluster-switcher.css';

type Profile={id:string;name:string;configured:boolean;endpoint?:string};
export default function ClusterSwitcher({owner}:{owner:boolean}){
  const {data,error,refresh}=useApi<{clusters:Profile[]}>('/cluster-profiles',{clusters:[]});
  const profiles=Array.isArray(data?.clusters)?data.clusters:[];
  const current=profiles.find(p=>p.id===clusterId);
  const [open,setOpen]=useState(false);
  const location=useLocation();
  const label=current?.name||'';
  const displayName=current?.endpoint&&profiles.some(p=>p.id!==current.id&&p.name===label)?label+' · '+current.endpoint:label;
  const approvalLabel=profiles.length>1?displayName:'';
  useEffect(()=>{nameCluster(approvalLabel)},[approvalLabel]);
  function select(id:string){
    if(id===clusterId){setOpen(false);return}
    window.location.assign(clusterLocation(id,location.pathname));
  }
  return <>
    <button type="button" className="cluster-switch-button" aria-label="Switch cluster" aria-describedby="current-cluster-name" title={displayName||'Switch cluster'}
      aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setOpen(true);void refresh()}}>
      <Layers size={17} aria-hidden="true"/><span id="current-cluster-name" translate={current?.configured?'no':undefined}>{current?.configured?displayName:'Clusters'}</span><ChevronDown size={14} aria-hidden="true"/>
    </button>
    <Modal portal open={open} title="Switch cluster" onClose={()=>setOpen(false)}>
      {error&&<p role="alert" className="error">{error}</p>}
      <div className="cluster-switch-list">{profiles.map(profile=><button key={profile.id} type="button" className="btn secondary"
        aria-current={profile.id===clusterId?'true':undefined} onClick={()=>select(profile.id)}>
        <Layers size={17}/><span translate={profile.configured?'no':undefined}>{profile.configured?profile.name:'Default workspace'}{profile.endpoint&&<small>{profile.endpoint}</small>}</span>
        {profile.id===clusterId&&<Check size={17} aria-label="Selected"/>}
      </button>)}</div>
      {owner&&<div className="modal-actions"><ClusterConnection compact createNew label="Add cluster" onConnected={()=>{setOpen(false);void refresh()}}/></div>}
    </Modal>
  </>;
}
