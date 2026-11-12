import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildInfo} from './build-info.js';
export function updateChanges(changes){return [...new Set((Array.isArray(changes)?changes:[]).filter(line=>typeof line==='string').map(line=>line.trim()).filter(line=>line&&!/^(?:merge\b|pull request\b|merged? pull request\b)/i.test(line)))];}

export function updateBridge(directory=process.env.ICLUSTERS_CONTROLLER_DATA||process.env.DATA_DIR||'runtime'){
 const statusFile=path.join(process.env.UPDATE_STATUS_DIR||directory,'update-status.json'),requestFile=path.join(directory,'update-request.json');
 return {
  status(){try{const status=JSON.parse(fs.readFileSync(statusFile,'utf8')),age=Date.now()-Date.parse(status.checkedAt),enabled=Number.isFinite(age)&&age>=-60000&&age<15*60*1000;return {...status,version:buildInfo.version,buildNumber:buildInfo.buildNumber,changes:updateChanges(status.changes),configured:true,enabled,...(!enabled?{state:'unavailable',lastState:status.state,message:'The Ubuntu updater has not reported a recent check. Open About and check for updates, or inspect the iclusters-updater service on the VM.'}:{}),pending:fs.existsSync(requestFile),checking:fs.existsSync(path.join(directory,'update-check.json'))||enabled&&status.state==='checking'};}catch{return {version:buildInfo.version,buildNumber:buildInfo.buildNumber,changes:[],configured:!!process.env.UPDATE_STATUS_DIR&&fs.existsSync(process.env.UPDATE_STATUS_DIR),enabled:false,available:false,state:'unavailable',message:'The Ubuntu updater has not reported status. On Ubuntu run: cd /opt/i-clusters && sudo bash deployment/setup-updater.sh'};}},
  check(){const status=this.status();if(!status.enabled&&!status.configured)throw Object.assign(new Error(status.message||'Ubuntu updater unavailable. Run sudo bash deployment/setup-updater.sh in /opt/i-clusters.'),{status:503});if(status.state==='updating')return {ok:true,state:'updating'};const checkId=crypto.randomUUID();fs.writeFileSync(path.join(directory,'update-check.json'),JSON.stringify({checkId})+'\n',{mode:0o600});return {ok:true,state:'checking',checkedAt:status.checkedAt,checkId};},
  request(revision){
   const status=this.status();
   if(!status.enabled)throw Object.assign(new Error(status.message||'Ubuntu updater is unavailable.'),{status:503});
   if(status.state==='updating'||status.pending)throw Object.assign(new Error('An update is already running.'),{status:409});
   if(!status.available)throw Object.assign(new Error('No update is available.'),{status:409});
   if(!/^[a-f0-9]{40}$/.test(revision||'')||revision!==status.latest)throw Object.assign(new Error('Review the available revision before installing the update.'),{status:409});
   // Publish only a complete request to the host path watcher.
   const temporary=requestFile+'.'+crypto.randomUUID();
   try{
    fs.writeFileSync(temporary,JSON.stringify({revision})+'\n',{flag:'wx',mode:0o600});
    fs.linkSync(temporary,requestFile);
   }catch(error){
    if(error.code==='EEXIST')throw Object.assign(new Error('An update is already running.'),{status:409});
    throw error;
   }finally{fs.rmSync(temporary,{force:true})}
   return {ok:true,state:'queued',revision};
  }

 };
}
export const updates=updateBridge();
