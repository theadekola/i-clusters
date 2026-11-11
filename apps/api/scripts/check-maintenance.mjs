import fs from 'node:fs';
import path from 'node:path';
import {unseal} from '../src/mfa.js';
import {createClusterProfiles} from '../src/cluster-profiles.js';
const root=process.env.DATA_DIR||'/app/runtime',profiles=createClusterProfiles(root);
for(const directory of [root,...profiles.allIds().map(profiles.folder)]){
  const file=path.join(directory,'docker-operation-journal.json');
  if(!fs.existsSync(file))continue;
  const state=JSON.parse(fs.readFileSync(file,'utf8'));
  const entries=JSON.parse(unseal(state.data));
  if(entries.some(([,entry])=>['running','interrupted','recovering'].includes(entry.status))){
    console.error('Finish or recover Docker updates before controller maintenance.');
    process.exit(1);
  }
}
console.log('No active or interrupted Docker update requires recovery.');
