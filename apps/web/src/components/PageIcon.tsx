import {useState} from 'react';
import {availableIcons} from '../fluent-icon-registry';
import {FluentFallback,iconSource} from './FluentIcon';
export const pageIcons={dashboard:'dashboard',storage:'storage',network:'network',backups:'backups',monitoring:'monitoring',alerts:'alerts',assistant:'ai-assistant',shell:'shell',files:'sftp',users:'users',settings:'settings'} as const;
export type PageIconName=typeof availableIcons[number]|keyof typeof pageIcons;
const paths:Record<string,PageIconName>={'/':'dashboard','/proxmox':'proxmox','/docker':'docker','/storage':'storage','/network':'network','/backups':'backups','/monitoring':'monitoring','/alerts':'alerts','/ai':'assistant','/tools/shell':'shell','/tools/sftp':'files','/users':'users','/settings':'settings'};
export function pageIconForPath(path:string):PageIconName{return Object.hasOwn(paths,path)?paths[path]:'dashboard'}
export function pageIconForTitle(title:string):PageIconName{
 for(const [pattern,icon] of [
  [/virtual machine|\bvm\b/i,'virtual-machines'],[/lxc|\bct\b/i,'lxc-containers'],[/compose|stack/i,'compose-stacks'],[/image/i,'images'],[/node/i,'nodes'],
  [/snapshot/i,'snapshots'],[/dataset/i,'datasets'],[/volume/i,'volumes'],[/disk/i,'disks'],[/share/i,'shares'],[/retention/i,'retention'],[/destination/i,'destinations'],[/restore/i,'restore-points'],[/schedule/i,'backup-schedules'],[/backup.*report/i,'backup-reports'],
  [/interface/i,'interfaces'],[/routing/i,'routing'],[/firewall/i,'firewall'],[/dns/i,'dns'],[/traffic/i,'traffic-analysis'],[/device/i,'devices'],[/task/i,'tasks'],[/log/i,'logs'],[/event/i,'events'],
  [/network/i,'network'],[/storage/i,'storage'],[/backup/i,'backups'],[/notification/i,'notifications'],[/alert.*history/i,'alert-history'],[/alert.*rule/i,'alert-rules'],[/alert/i,'alerts'],[/monitor|performance|provider job/i,'monitoring'],
  [/assistant|\bai\b/i,'assistant'],[/sftp|files/i,'files'],[/shell|terminal/i,'shell'],[/audit/i,'audit-logs'],[/user/i,'users'],[/appearance/i,'appearance'],[/security/i,'security'],[/about/i,'about'],[/setting|integration|connection|session/i,'settings']
 ] as [RegExp,PageIconName][]){if(pattern.test(title))return icon}
 return 'dashboard';
}
export default function PageIcon({name,size=24,className=''}:{name:PageIconName;size?:number;className?:string}){
 const [failed,setFailed]=useState(''),key=Object.hasOwn(pageIcons,name)?pageIcons[name as keyof typeof pageIcons]:name,src=iconSource(key)||iconSource('dashboard')!,dimension=Number.isFinite(size)?Math.max(12,Math.min(48,size)):24;
 return <span className={`page-image-icon ${className}`} data-page-icon={name} aria-hidden="true" style={{width:dimension,height:dimension}}>{failed===src?<FluentFallback size={dimension}/>:<img src={src} width={dimension} height={dimension} alt="" draggable={false} decoding="async" onError={()=>setFailed(src)}/>}</span>;
}
