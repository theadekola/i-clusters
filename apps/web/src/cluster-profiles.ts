import {useApi} from './hooks';
import {clusterId} from './cluster-context';

export type ClusterProfile={id:string;name:string;configured:boolean;endpoint?:string;status:'online'|'offline'|'unknown'|'not-configured'};
export function useClusterProfiles(){
  const {data,error,refresh,loading}=useApi<{clusters:ClusterProfile[]}>('/cluster-profiles',{clusters:[]},15000);
  const profiles=Array.isArray(data?.clusters)?data.clusters:[];
  return {profiles,current:profiles.find(p=>p.id===clusterId),error,refresh,loading};
}
