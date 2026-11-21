import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import {startUsageReports} from './product-usage.js';
import {migrate,pool} from './db.js';
import {createApp} from './app.js';
import {consoleSocketPath,createProxmoxConsole,rejectConsoleUpgrade} from './proxmox-console.js';
import {closeSessionAccess} from './ssh-access.js';
import {createClusterProfiles,dataDirectory} from './cluster-profiles.js';
import {createClusterWorkers} from './cluster-workers.js';
import {runClusterService} from './cluster-service.js';

await migrate();
startUsageReports(pool);
const directory=dataDirectory(),profiles=createClusterProfiles(directory),workers=createClusterWorkers(profiles,directory);
const gateway=express(),guestConsole=createProxmoxConsole();
if(process.env.TRUST_PROXY)gateway.set('trust proxy',Number(process.env.TRUST_PROXY)||1);
gateway.disable('x-powered-by');
gateway.use('/api/cluster-profiles/:id/api',workers.route);
gateway.use(createApp({profiles,guestConsole,onClusterAdded:workers.sync,onSessionRevoked(user,sid){closeSessionAccess(user,sid);guestConsole.revoke(user,sid);workers.revoke(user,sid)},
  operationJournalFile:path.join(directory,'docker-operation-journal.json')}));
const server=runClusterService(gateway,{port:Number(process.env.PORT||6000),host:'0.0.0.0',controllerDirectory:directory,
  onListen:port=>console.log('i-Clusters live API listening on',port),onSample:workers.sync,onStop(){guestConsole.close();workers.close()}});
server.on('upgrade',(req,socket,head)=>{
  socket.on('error',()=>socket.destroy());
  if(req.url===consoleSocketPath)return guestConsole.upgrade(req,socket,head);
  const profile=/^\/api\/cluster-profiles\/([^/]+)\/api\/proxmox\/console\/socket$/.exec(req.url);
  if(profile)return void workers.upgrade(profile[1],req,socket,head);
  rejectConsoleUpgrade(socket);
});
