import fs from 'node:fs';
import path from 'node:path';
import {apiPolicy} from './api-policy.js';
import {createHistoryCleanup} from './alert-history-cleanup.js';
import {get,mutate} from './store.js';
import {monitor} from './monitor.js';
import {pool} from './db.js';

export function runClusterService(app,{port,host,controllerDirectory,onListen,onStop=()=>{},onSample=()=>{}}){
  const server=app.listen(port,host,()=>onListen(server.address().port));
  server.requestTimeout=7200000;
  const cleanup=createHistoryCleanup({get,mutate});
  const sample=()=>{
    if(fs.existsSync(path.join(controllerDirectory,'maintenance.json')))return;
    try{onSample();cleanup.runDue()}catch(error){console.error('Cluster maintenance:',error.message)}
    void monitor.sample(true).catch(error=>console.error('Monitoring:',error.message));
  };
  sample();const timer=setInterval(sample,apiPolicy.monitorIntervalMs);timer.unref();
  let stopping=false;
  const stop=()=>{
    if(stopping)return;stopping=true;clearInterval(timer);onStop();
    server.close(()=>{void pool.end().finally(()=>process.exit(0))});
    setTimeout(()=>process.exit(0),5000).unref();
  };
  for(const signal of ['SIGTERM','SIGINT','disconnect'])process.once(signal,stop);
  return server;
}
