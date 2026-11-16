import {createHash} from 'node:crypto';

export const sessionTag = sid => sid ? createHash('sha256').update(sid).digest('hex') : null;

function eventGroup(action) {
  if (action === 'auth.login') return 'signin';
  if (/^(account\.token|api\.token)/.test(action)) return 'token';
  if (/^(user\.|account\.(?!profile)|auth\.)/.test(action)) return 'security';
  if (/notification/.test(action)) return 'notification';
  if (/backup|retention|restore|schedule/.test(action)) return 'backup';
  if (/^account\.profile/.test(action)) return 'profile';
  return 'infrastructure';
}

export async function accountActivity(db, cluster, id, actor) {
  if (typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
    throw Object.assign(Error('Invalid account ID'), {status:400});
  }
  const result = await db.query(`
    WITH recent AS (
      SELECT id::text,created_at AS time,action,resource,status,ip,
             details->>'device' AS device
      FROM audit_logs WHERE cluster_id=$1 AND user_id=$2
      ORDER BY created_at DESC,audit_logs.id DESC LIMIT 501
    ), weeks AS (
      SELECT action,count(*) FILTER (WHERE created_at >= now()-interval '7 days')::int AS current,
             count(*) FILTER (WHERE created_at < now()-interval '7 days')::int AS previous
      FROM audit_logs WHERE cluster_id=$1 AND user_id=$2 AND created_at >= now()-interval '14 days'
      GROUP BY action
    ), logins AS (
      SELECT id::text,created_at AS time,ip,details->>'device' AS device,
             details->>'sessionTag' AS tag
      FROM audit_logs WHERE cluster_id=$1 AND user_id=$2 AND action='auth.login' AND status='success'
      ORDER BY created_at DESC,audit_logs.id DESC LIMIT 8
    ), devices AS (
      SELECT id,created_at AS time,device,last_seen_at AS seen FROM auth_sessions
      WHERE $3::boolean AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()
      ORDER BY COALESCE(last_seen_at,created_at) DESC LIMIT 8
    )
    SELECT COALESCE((SELECT json_agg(recent) FROM recent),'[]') AS recent,
           COALESCE((SELECT json_agg(weeks) FROM weeks),'[]') AS weeks,
           COALESCE((SELECT json_agg(logins) FROM logins),'[]') AS logins,
           COALESCE((SELECT json_agg(devices) FROM devices),'[]') AS devices`,
    [cluster,id,actor.sub===id]);
  const {recent,weeks,logins,devices} = result.rows[0];
  const summary = Object.fromEntries(['total','signin','security','infrastructure'].map(k=>[k,{current:0,previous:0}]));
  for (const {action,current,previous} of weeks) {
    const group = eventGroup(action);
    const bucket = group === 'token' ? 'security' : group === 'backup' ? 'infrastructure' : group;
    summary.total.current += current;
    summary.total.previous += previous;
    if (summary[bucket]) {
      summary[bucket].current += current;
      summary[bucket].previous += previous;
    }
  }
  const byTag=new Map(logins.filter(row=>row.tag).map(row=>[row.tag,row]));
  for(const device of devices){
    const tag=sessionTag(device.id),record=byTag.get(tag);
    if(record){record.seen=device.seen;record.active=true;record.current=device.id===actor.sid}
    else logins.push({id:tag,time:device.time,device:device.device,seen:device.seen,active:true,current:device.id===actor.sid});
  }
  const loginRows=logins.sort((a,b)=>Date.parse(b.seen||b.time)-Date.parse(a.seen||a.time)).slice(0,8)
    .map(({tag,...record})=>record);
  return {summary,logins:loginRows,truncated:recent.length>500,logs:recent.slice(0,500).map(row=>({...row,group:eventGroup(row.action)}))};
}
