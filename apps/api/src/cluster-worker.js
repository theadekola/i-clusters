import path from 'node:path';
import express from 'express';
import {createApp} from './app.js';
import {runClusterService} from './cluster-service.js';
import {closeSessionAccess} from './ssh-access.js';

const directory=process.env.DATA_DIR;
if(!process.send||!process.env.ICLUSTERS_CLUSTER_PROFILE||!directory)throw Error('A cluster runtime requires its controller.');
process.on('message',message=>{if(message?.type==='revoke')closeSessionAccess(message.user,message.sessionId)});
const internal=express();
internal.use((req,res,next)=>{
  if(!process.env.ICLUSTERS_WORKER_KEY||req.get('x-iclusters-worker-key')!==process.env.ICLUSTERS_WORKER_KEY)return res.sendStatus(403);
  delete req.headers['x-iclusters-worker-key'];next();
});
internal.use(createApp({operationJournalFile:path.join(directory,'docker-operation-journal.json')}));
runClusterService(internal,{
  port:0,host:'127.0.0.1',controllerDirectory:process.env.ICLUSTERS_CONTROLLER_DATA,
  onListen:port=>process.send({type:'ready',port})
});
