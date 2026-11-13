import type {ClusterProfile} from '../cluster-profiles';
import {Badge} from './UI';

export default function ClusterStatus({profile,error,checking=false}:{profile?:ClusterProfile;error:string;checking?:boolean}){
  if(!profile&&checking&&!error)return <Badge tone="gray">Checking</Badge>;
  if(profile&&!profile.configured)return <Badge tone="gray">Not connected</Badge>;
  if(!error&&profile?.status==='online')return <Badge tone="green">Online</Badge>;
  if(!error&&profile?.status==='offline')return <Badge tone="red">Offline</Badge>;
  return <Badge tone="gray">Unknown</Badge>;
}
