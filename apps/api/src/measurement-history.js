import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const day=86400000;
const periods={hour:3600000,day,week:7*day,month:30*day,year:365*day};
let connection;
let nextCleanup=0;

// Each cluster worker owns a separate runtime directory. Store only measured
// temperatures and throughput, never raw device counters or full SMART reports.
function database(){
  if(connection)return connection;
  const directory=process.env.DATA_DIR||fileURLToPath(new URL('../runtime',import.meta.url));
  mkdirSync(directory,{recursive:true});
  connection=new DatabaseSync(path.join(directory,'measurements.sqlite'));
  connection.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS samples(
      agent TEXT NOT NULL, kind TEXT NOT NULL, sensor TEXT NOT NULL, time INTEGER NOT NULL,
      label TEXT NOT NULL, value REAL, secondary REAL,
      PRIMARY KEY(agent,kind,sensor,time)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS samples_time ON samples(time);`);
  return connection;
}

export function recordMeasurements(agent,rows,time=Date.now()){
  if(!rows.length)return;
  const db=database();
  const write=db.prepare('INSERT OR REPLACE INTO samples VALUES(?,?,?,?,?,?,?)');
  db.exec('BEGIN');
  try{
    for(const {kind,id,label,value,secondary=null} of rows){
      const resolution=kind==='io'?30000:60000;
      write.run(agent,kind,id,Math.floor(time/resolution)*resolution,label,value,secondary);
    }
    if(time>=nextCleanup)db.prepare('DELETE FROM samples WHERE time<?').run(time-30*day);
    db.exec('COMMIT');
    if(time>=nextCleanup)nextCleanup=time+3600000;
  }catch(error){db.exec('ROLLBACK');throw error;}
}

export function diskHistory(agent,period,now){
  const duration=Math.min(periods[period]||day,30*day);
  const interval=duration>day?Math.ceil(duration/720):30000;
  return database().prepare(`SELECT min(time) AS time,avg(value) AS diskRead,avg(secondary) AS diskWrite
    FROM samples WHERE agent=? AND kind='io' AND time BETWEEN ? AND ?
    GROUP BY CAST(time / ? AS INTEGER) ORDER BY time`).all(agent,now-duration,now,interval);
}

export function temperatureReport(agents,query,enabled,now=Date.now()){
  const period=query.period||'day';
  if(!['day','week','month'].includes(period))throw Object.assign(Error('Invalid temperature report period'),{status:400});
  const hosts=agents.map(({id,name,online,version})=>({id,name,online,version}));
  const host=hosts.find(h=>h.id===query.host)||(query.host?null:hosts[0]);
  if(query.host&&!host)throw Object.assign(Error('Connector not found'),{status:404});
  const result={enabled,hosts,host:host?.id||null,sensors:[],series:[],period,generatedAt:new Date(now).toISOString()};
  if(!host)return result;
  const from=now-periods[period],db=database();
  result.sensors=db.prepare(`SELECT kind,sensor AS id,label,min(value) AS minimum,max(value) AS maximum,
     max(time) AS lastSeen FROM samples WHERE agent=? AND kind IN ('system','drive') AND time BETWEEN ? AND ?
     GROUP BY kind,sensor ORDER BY kind,label,sensor`).all(host.id,from,now);
  const interval=period==='day'?60000:period==='week'?900000:3600000;
  for(const kind of ['system','drive']){
    const sensor=result.sensors.find(s=>s.kind===kind&&s.id===query[kind])||result.sensors.find(s=>s.kind===kind);
    if(!sensor)continue;
    const points=db.prepare(`SELECT CAST(time / ? AS INTEGER)*? AS time,avg(value) AS value,
      min(value) AS minimum,max(value) AS maximum FROM samples
      WHERE agent=? AND kind=? AND sensor=? AND time BETWEEN ? AND ?
      GROUP BY CAST(time / ? AS INTEGER) ORDER BY time`).all(interval,interval,host.id,kind,sensor.id,from,now,interval);
    const latest=db.prepare('SELECT value FROM samples WHERE agent=? AND kind=? AND sensor=? AND time=?').get(host.id,kind,sensor.id,sensor.lastSeen);
    const bins=new Map(points.map(p=>[p.time,p]));
    const series=[];
    for(let time=Math.floor(from/interval)*interval;time<=now;time+=interval)series.push(bins.get(time)||{time,value:null,minimum:null,maximum:null});
    result.series.push({...sensor,latest:latest?.value??null,points:series});
  }
  return result;
}
