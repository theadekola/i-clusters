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
 nodeAvailable?: boolean;
 cpu?: number | null;
 memoryPercent?: number | null;
 diskPercent?: number | null;
};

export function LayoutSwitch({grid, onChange}: {grid: boolean; onChange: (grid: boolean) => void}) {
 return <div className="pve-layout-switch" role="group" aria-label="Inventory layout">
  <button type="button" aria-label="Grid view" aria-pressed={grid} onClick={() => onChange(true)} data-icon-control><LayoutGrid size={16}/></button>
  <button type="button" aria-label="List view" aria-pressed={!grid} onClick={() => onChange(false)} data-icon-control><List size={17}/></button>
 </div>;
}

export function storagePercent(rows: any[]) {
 const {used, usedCapacity} = storageCapacity(rows);
 return used != null && usedCapacity > 0 ? Math.round(used / usedCapacity * 100) : null;
}

export function ProxmoxResourceCard({resource, kind, disk = resource.diskPercent, onDetails, onShell, shellEnabled}: {
 resource: Resource; kind: Kind; disk?: number | null;
 onDetails: () => void; onShell: () => void; shellEnabled: boolean;
}) {
 const Icon = {node: Server, vm: Monitor, lxc: Box}[kind];
 const status = resource.status || 'Unknown';
 const available = resource.nodeAvailable !== false && !['offline','unknown'].includes(status.toLowerCase());
 const subtitle = kind === 'node' ? resource.ip || 'IP not reported' : `${kind === 'vm' ? 'VM' : 'CT'} ${resource.id} · ${resource.node}`;
 const readings = [
  {label: 'CPU', icon: Cpu, value: resource.cpu, metric: 'cpu'},
  {label: 'Memory', icon: MemoryStick, value: resource.memoryPercent, metric: 'memory'},
  {label: 'Disk', icon: HardDrive, value: disk, metric: 'disk'},
 ];
 return <article className="pve-resource-card" data-kind={kind} aria-label={resource.name}>
  <header>
   <span className="pve-resource-icon"><Icon size={23}/></span>
   <div className="pve-resource-identity"><strong translate="no">{resource.name}</strong><small translate="no">{subtitle}</small></div>
   <span className="pve-resource-status" data-status={status.toLowerCase()}>{status}</span>
  </header>
  <div className="pve-resource-readings">{readings.map(({label, icon: MetricIcon, value, metric}) => {
   const reported = available && typeof value === 'number' && Number.isFinite(value) && value >= 0;
   return <div className="pve-resource-reading" data-metric={metric} key={metric}>
    <span><MetricIcon size={14}/>{label}</span>
    <span className="pve-resource-track" aria-hidden="true">{reported && <i style={{width: Math.min(value, 100) + '%'}}/>}</span>
    <span>{reported ? Math.round(value) + '%' : 'Unknown'}</span>
   </div>;
  })}</div>
  <footer>
   <button type="button" onClick={onDetails}><Info size={15}/>Details</button>
   <button type="button" disabled={!shellEnabled} onClick={onShell}><Terminal size={15}/>Shell</button>
  </footer>
 </article>;
}
