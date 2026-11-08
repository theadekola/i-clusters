// Direction is relative to the resource at the end of a hosting link.
export type Flow = {rx:boolean;tx:boolean;until:number};
type Sample = {at:number;rx:number;tx:number;uptime:number};
export function guestActivity(rows:any[], previous:Map<string,Sample>, now:number, last:Map<string,Flow>){
 const samples=new Map<string,Sample>(),flows=new Map<string,Flow>();
 for(const g of rows){
  const s=g.networkSample,key=g.key;
  if(g.status!=='running'||g.nodeAvailable===false||!s||![s.rx,s.tx,s.uptime,s.at].every(n=>Number.isSafeInteger(n)&&n>=0)||s.at>now||now-s.at>60000)continue;
  samples.set(key,s);const old=previous.get(key);if(!old)continue;
  if(s.at===old.at){const f=last.get(key);if(f&&f.until>now)flows.set(key,f);continue}
  if(s.at<old.at||s.at-old.at>60000||s.uptime<old.uptime||s.rx<old.rx||s.tx<old.tx)continue;
  flows.set(key,{rx:s.rx>old.rx,tx:s.tx>old.tx,until:s.at+60000});
 }
 return {samples,flows};
}
export function nodeActivity(rows:any[],now:number){
 const result=new Map<string,Flow>();
 for(const r of rows){
  const at=Date.parse(r.networkSampledAt);
  if(r.telemetryStatus!=='ok'||r.status==='down'||!Number.isFinite(at)||at>now||now-at>=20000)continue;
  const rx=Number.isFinite(r.rxMbps)&&r.rxMbps>0,tx=Number.isFinite(r.txMbps)&&r.txMbps>0;
  if(rx||tx){const old=result.get(r.node);result.set(r.node,{rx:rx||!!old?.rx,tx:tx||!!old?.tx,until:Math.max(old?.until||0,at+20000)})}
 }
 return result;
}
