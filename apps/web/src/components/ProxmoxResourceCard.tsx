import {Box, Cpu, HardDrive, Info, LayoutGrid, List, MemoryStick, Monitor, Server, Terminal} from 'lucide-react';
import {storageCapacity} from '../storage-presentation';
import './proxmox-resource-card.css';

type Kind = 'node' | 'vm' | 'lxc';
type Resource = {
 name: string;
 id?: number | string;
 ip?: string;
 node?: string;
 status?: string;
 powerStatus?: string;
 nodeAvailable?: boolean;
 cpu?: number | null;
 memoryPercent?: number | null;
 diskPercent?: number | null;
};

export function LayoutSwitch({grid, onChange}: {grid: boolean; onChange: (grid: boolean) => void}) {
 return <div className="pve-layout-switch" role="group" aria-label="Inventory layout">
  <button type="button" aria-label="Grid view" aria-pressed={grid} onClick={() => onChange(true)}><LayoutGrid size={16}/></button>
  <button type="button" aria-label="List view" aria-pressed={!grid} onClick={() => onChange(false)}><List size={17}/></button>
 </div>;
}

export function storagePercent(rows: any[]) {
 const {used, usedCapacity} = storageCapacity(rows);
 return used != null && usedCapacity > 0 ? Math.round(used / usedCapacity * 100) : null;
}

export function ResourceReadings({cpu,memory,disk}:{cpu?:number|null;memory?:number|null;disk?:number|null}) {
 const readings = [
  {label:'CPU', icon:Cpu, value:cpu, metric:'cpu'},
  {label:'Memory', icon:MemoryStick, value:memory, metric:'memory'},
  {label:'Disk', icon:HardDrive, value:disk, metric:'disk'},
 ];
 return <div className="pve-resource-readings">{readings.map(({label, icon: MetricIcon, value, metric}) => {
   const reported = typeof value === 'number' && Number.isFinite(value) && value >= 0;
   return <div className="pve-resource-reading" data-metric={metric} key={metric}>
    <span><MetricIcon size={14}/>{label}</span>
    <span className="pve-resource-track" aria-hidden="true">{reported && <i style={{width: Math.min(value, 100) + '%'}}/>}</span>
    <span>{reported ? Math.round(value) + '%' : 'Unknown'}</span>
   </div>;
  })}</div>;
}

export function ResourceHeader({name,subtitle,status,kind,onOpen}:{name:string;subtitle?:string;status:string;kind:Kind|'cluster';onOpen?:()=>void}) {
 const Icon={node:Server,vm:Monitor,lxc:Box,cluster:Server}[kind];
 return <header>
  <span className="pve-resource-icon"><Icon size={23}/></span>
  <div className="pve-resource-identity"><strong translate="no" title={name}>{onOpen?<button type="button" className="pve-resource-name" onClick={onOpen}>{name}</button>:name}</strong><small translate="no">{subtitle}</small></div>
  <span className="pve-resource-status" data-status={status.toLowerCase()}>{status}</span>
 </header>;
}

export function ProxmoxResourceCard({resource, kind, disk = resource.diskPercent, onDetails, onShell, shellEnabled}: {
 resource: Resource; kind: Kind; disk?: number | null;
 onDetails: () => void; onShell?: () => void; shellEnabled?: boolean;
}) {
 const status = (kind==='vm'&&resource.powerStatus) || resource.status || 'Unknown';
 const available = resource.nodeAvailable !== false && !['offline','unknown'].includes(status.toLowerCase());
 const subtitle = kind === 'node' ? resource.ip || 'IP not reported' : `${kind === 'vm' ? 'VM' : 'CT'} ${resource.id} · ${resource.node}`;
 return <article className="pve-resource-card" data-kind={kind} data-status={resource.nodeAvailable===false?'unknown':status.toLowerCase()} aria-label={resource.name}>
  <ResourceHeader name={resource.name} subtitle={subtitle} status={resource.nodeAvailable===false?'Unknown':status} kind={kind} onOpen={onShell?undefined:onDetails}/>
  <ResourceReadings cpu={available?resource.cpu:null} memory={available?resource.memoryPercent:null} disk={available?disk:null}/>
  {onShell&&<footer>
   <button type="button" onClick={onDetails}><Info size={15}/>Details</button>
   <button type="button" disabled={!shellEnabled} onClick={onShell}><Terminal size={15}/>Shell</button>
  </footer>}
 </article>;
}
