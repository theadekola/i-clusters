import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {retainAlerts} from '../src/alert-history-cleanup.js';
import {alertConditions} from '../src/monitor.js';

test('retention preserves acknowledged failures and skipped backups do not page operators',()=>{
 const history=Array.from({length:1001},(_,id)=>({id,status:'resolved'}));
 const active={id:'backup',status:'acknowledged'};
 assert.equal(retainAlerts([...history,active]).length,1001);
 assert.equal(retainAlerts([...history,active]).at(-1),active);
 const now=Math.floor(Date.now()/1000),task={node:'pve',upid:'1',starttime:now-10,endtime:now,exitstatus:'skipped'};
 const snapshot={services:[],proxmox:{nodes:[],vms:[],lxc:[],backupHistory:{tasks:[task]}}};
 assert.equal(alertConditions(snapshot,[]).length,0);
});
test('temperature reports preserve gaps, sensor identity, cluster isolation and history after restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'monitor-history-'));process.env.DATA_DIR=dir;
 try{
  const url=new URL('../src/measurement-history.js',import.meta.url).href,now=Date.now();
  execFileSync(process.execPath,['--input-type=module','-e',`import {recordMeasurements} from ${JSON.stringify(url)};
   for(const [time,value] of [[${now}-300000,40],[${now}-60000,52]])recordMeasurements('first',[{kind:'system',id:'cpu',label:'Package',value}],time);
   recordMeasurements('second',[{kind:'drive',id:'nvme',label:'NVMe',value:35}],${now});`],{env:{...process.env,DATA_DIR:dir}});
  const {temperatureReport,recordMeasurements,diskHistory}=await import(url);
  for(const time of [now-300000,now-60000])recordMeasurements('first',[{kind:'io',id:'disk',label:'Physical disks',value:512,secondary:0}],time);
  const rates=diskHistory('first','day',now);
  assert.deepEqual(rates.map(p=>p.diskRead),[512,null,512]);
  assert.deepEqual(rates.map(p=>p.diskWrite),[0,null,0]);
  const report=temperatureReport([{id:'first',name:'One',online:false}],{},true,now);
  assert.equal(report.series.length,1);const [cpu]=report.series;
  assert.equal(cpu.latest,52);assert.equal(cpu.minimum,40);assert.equal(cpu.maximum,52);
  assert.equal(cpu.points.filter(p=>p.value!==null).length,2);assert.ok(cpu.points.some(p=>p.value===null));
  assert.throws(()=>temperatureReport([{id:'first'}],{host:'second'},true),/not found/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
