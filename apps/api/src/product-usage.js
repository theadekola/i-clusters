import {buildInfo} from './build-info.js';
import {Router} from 'express';

const {version}=buildInfo;
const origin='https://www.i-clusters.com';
const features=new Set(['dashboard','proxmox','docker','storage','network','backups','restore','schedules','retention','monitoring','alerts','ai','users','settings','tools']);
const actions=new Map([['proxmox.restore','restore'],['proxmox.snapshot.create','snapshot']]);
const month="date_trunc('month',now() at time zone 'UTC')::date";
const enabled=()=>process.env.ICLUSTERS_USAGE_REPORTING!=='off';
export const usageSchema=`
 ALTER TABLE users ADD COLUMN IF NOT EXISTS usage_reporting boolean NOT NULL DEFAULT true;
 CREATE TABLE IF NOT EXISTS product_usage_month(period date PRIMARY KEY,report_key uuid UNIQUE NOT NULL DEFAULT gen_random_uuid());
 CREATE TABLE IF NOT EXISTS product_usage_counts(period date REFERENCES product_usage_month ON DELETE CASCADE,metric text,total bigint NOT NULL,PRIMARY KEY(period,metric));
 CREATE TABLE IF NOT EXISTS product_usage_accounts(period date REFERENCES product_usage_month ON DELETE CASCADE,account uuid,PRIMARY KEY(period,account));`;

async function count(db,user,metric){
 if(!enabled())return;
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  const pref=await client.query('SELECT usage_reporting FROM users WHERE id=$1 FOR SHARE',[user]);
  if(pref.rows[0]?.usage_reporting){
   await client.query(`INSERT INTO product_usage_month(period) VALUES(${month}) ON CONFLICT DO NOTHING`);
   await client.query(`INSERT INTO product_usage_accounts VALUES(${month},$1) ON CONFLICT DO NOTHING`,[user]);
   await client.query(`INSERT INTO product_usage_counts VALUES(${month},$1,1) ON CONFLICT(period,metric) DO UPDATE SET total=product_usage_counts.total+1`,[metric]);
  }
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
export function countAction(db,user,label,outcome){
 const action=actions.get(label);
 if(action)void count(db,user,action+'.'+outcome).catch(()=>{});
}
async function deliver(path,payload){
 const response=await fetch(origin+'/api/product/'+path,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
 if(!response.ok||(await response.json()).accepted!==true)throw Error('Delivery failed');
}
export function productRouter(db){
 const router=Router();
 router.get('/preferences',async(req,res)=>{
  const {rows}=await db.query('SELECT usage_reporting FROM users WHERE id=$1',[req.user.sub]);
  res.set('Cache-Control','no-store').json({enabled:enabled()&&rows[0]?.usage_reporting===true,available:enabled(),version});
 });
 router.put('/preferences',async(req,res)=>{
  if(typeof req.body.enabled!=='boolean')return res.sendStatus(400);
  await db.query('UPDATE users SET usage_reporting=$1 WHERE id=$2',[req.body.enabled,req.user.sub]);res.sendStatus(204);
 });
 router.post('/visit',async(req,res)=>{
  if(!features.has(req.body.feature))return res.sendStatus(400);
  await count(db,req.user.sub,'view.'+req.body.feature);res.sendStatus(204);
 });
 router.post('/feedback',async(req,res)=>{
  const {category,message,email='',page,id}=req.body;
  if(!['problem','idea','general'].includes(category)||typeof message!=='string'||!message.trim()||message.length>3000||typeof email!=='string'||email.length>254||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||!features.has(page)||typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))return res.sendStatus(400);
  try{await deliver('feedback',{id,category,message:message.trim(),email,page,version});res.json({sent:true})}
  catch{res.status(503).json({error:'Feedback delivery failed. Please retry.'})}
 });
 return router;
}
export function startUsageReports(db){
 let running=false;
 async function report(){
  if(running)return;
  running=true;
  try{
   await db.query(`DELETE FROM product_usage_month WHERE period<${month}-interval '1 month'`);
   if(!enabled())return;
   const {rows}=await db.query(`SELECT m.report_key AS id,to_char(m.period,'YYYY-MM') AS period,
    (SELECT count(*)::int FROM product_usage_accounts a WHERE a.period=m.period) AS accounts,
    (SELECT jsonb_object_agg(metric,total) FROM product_usage_counts c WHERE c.period=m.period) AS counts
    FROM product_usage_month m ORDER BY m.period`);
   for(const row of rows)if(row.counts)await deliver('usage',{...row,version});
  }catch{console.warn('Product usage summary unavailable. Will retry on the next reporting cycle.')}finally{running=false}
 }
 void report();
 const timer=setInterval(report,3600000);timer.unref();
 return timer;
}
