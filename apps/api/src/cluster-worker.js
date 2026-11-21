import path from 'node:path';
import express from 'express';
import {createApp} from './app.js';
import {runClusterService} from './cluster-service.js';
import {consoleSocketPath,createProxmoxConsole,rejectConsoleUpgrade} from './proxmox-console.js';
import {closeSessionAccess} from './ssh-access.js';

const directory=process.env.DATA_DIR;
if(!process.send||!process.env.ICLUSTERS_CLUSTER_PROFILE||!directory)throw Error('A cluster runtime requires its controller.');
const guestConsole=createProxmoxConsole();
process.on('message',message=>{
  if(message?.type!=='revoke')return;
  closeSessionAccess(message.user,message.sessionId);
  guestConsole.revoke(message.user,message.sessionId);
});
const internal=express();
internal.use((req,res,next)=>{
  if(!process.env.ICLUSTERS_WORKER_KEY||req.get('x-iclusters-worker-key')!==process.env.ICLUSTERS_WORKER_KEY)return res.sendStatus(403);
  delete req.headers['x-iclusters-worker-key'];next();
});
internal.use(createApp({guestConsole,operationJournalFile:path.join(directory,'docker-operation-journal.json')}));
const server=runClusterService(internal,{
  port:0,host:'127.0.0.1',controllerDirectory:process.env.ICLUSTERS_CONTROLLER_DATA,
  onStop:guestConsole.close,
  onListen:port=>process.send({type:'ready',port})
});
server.on('upgrade',(req,socket,head)=>{
  socket.on('error',()=>socket.destroy());
  if(req.url!==consoleSocketPath||!process.env.ICLUSTERS_WORKER_KEY||
     req.headers['x-iclusters-worker-key']!==process.env.ICLUSTERS_WORKER_KEY)return rejectConsoleUpgrade(socket);
  guestConsole.upgrade(req,socket,head);
});
