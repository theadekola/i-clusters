// A document and its pending promises are bound to one cluster. A switch loads
// a new document, so changing tabs or reloading cannot retarget an approved job.
const path=globalThis.window?.location?.pathname||'/';
const segment=path.match(/^\/clusters\/([^/]+)(?:\/|$)/)?.[1];
export const clusterId=segment||'default';
export const clusterBase=segment?'/clusters/'+segment:'';
export const connectorBase=segment?'/api/cluster-profiles/'+encodeURIComponent(segment):'';
const controllerRoute=/^\/(?:auth|account|users|product|updates|cluster-profiles)(?:[/?]|$)/;
export function clusterApiPath(route:string,profile=clusterId){
  const prefix=profile==='default'||controllerRoute.test(route)?'':'/api/cluster-profiles/'+encodeURIComponent(profile);
  return prefix+'/api'+route;
}
export function clusterStorageKey(key:string){return segment?key+':cluster:'+segment:key}
export function clusterLocation(id:string,route='/proxmox'){
  return (id==='default'?'':'/clusters/'+encodeURIComponent(id))+route;
}
let activeName='';
type ReportCluster={id:string;name?:string;endpoint?:string|null};
let source:ReportCluster={id:clusterId};
export function nameCluster(name:string,profile?:ReportCluster){
  activeName=name;
  source=profile?.id===clusterId?{id:clusterId,name:profile.name,endpoint:profile.endpoint}:{id:clusterId};
}
export function reportCluster(){return {...source}}
export function clusterReportFilename(filename:string){
  if(clusterId==='default')return filename;
  const label=source.name?.replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,40);
  return [label,encodeURIComponent(clusterId),filename].filter(Boolean).join('-');
}
export function approvalDescription(detail?:string){
  return activeName?[`Cluster: ${activeName}`,detail].filter(Boolean).join(' · '):detail;
}
