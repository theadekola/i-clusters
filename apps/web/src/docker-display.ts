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
