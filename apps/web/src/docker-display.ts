// Display labels never replace the canonical IDs used for Docker operations.
export function imageReference(image:any):string {
 const candidates=[...(image.tags||[]),...String(image.name||'').split(/,\s*/),...(image.digests||[])].filter((value:any)=>typeof value==='string'&&value&&value!=='<none>:<none>');
 return candidates.find((value:string)=>!value.includes('@')&&!/^sha256:|^[a-f0-9]{64}$/i.test(value))||candidates.find((value:string)=>value.includes('@'))?.split('@')[0]||'Untagged image';
}
export function volumeLabel(volume:any,containers:any[]):string {
 if(!/^[a-f0-9]{64}$/i.test(volume.name||''))return volume.name||'Unnamed volume';
 const mounts=containers.flatMap(c=>(c.mounts||[]).filter((m:any)=>m.Type==='volume'&&m.Name===volume.name).map((m:any)=>`${c.name} · ${m.Destination||'data'}`));
 return [...new Set(mounts)].join(', ')||`Anonymous volume · ${String(volume.name).slice(0,8)}`;
}
export function containerAddresses(container:any,network:any):string[] {
 const endpoint=container.networks?.[network.name];
 return [...new Set([endpoint?.IPAddress,endpoint?.GlobalIPv6Address].filter((v:any)=>typeof v==='string'&&v).map((v:string)=>v.split('/')[0]))];
}

// A published host binding is different from the container's network address.
export function publishedEndpoints(container:any,host:any):string[] {
 const format=(value:string)=>value.includes(':')?`[${value}]`:value;
 return [...new Set((container.portBindings||[]).filter((p:any)=>Number.isInteger(p.hostPort)&&p.hostPort>0&&p.hostPort<=65535&&Number.isInteger(p.containerPort)&&p.containerPort>0&&p.containerPort<=65535).map((p:any)=>{
  const ip=String(p.hostIp||''),wildcard=!ip||ip==='0.0.0.0'||ip==='::';
  const address=wildcard?(host?.hostname||'Docker host'):ip;
  const scope=wildcard?` (${ip==='::'?'all host IPv6 interfaces':ip==='0.0.0.0'?'all host IPv4 interfaces':'host interfaces'})`:ip==='127.0.0.1'||ip==='::1'?' (host loopback only)':'';
  return `${format(address)}:${p.hostPort} → ${p.containerPort}/${p.protocol||'tcp'}${scope}`;
 }))] as string[];
}
