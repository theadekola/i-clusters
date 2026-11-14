// A snapshot ID pins page boundaries while new audit records arrive.
export async function searchAudit(db,cluster,query){
 const values=[cluster],bind=value=>{values.push(value);return '$'+values.length};
 const limit=Math.min(100,Math.max(1,Number(query.size)||10)),page=Math.max(0,Number(query.page)||0);
 if(!Number.isSafeInteger(page)||!Number.isInteger(limit)||page>10000000)throw Object.assign(Error('Invalid audit page'),{status:400});
 const snapshot=/^\d{1,19}$/.test(query.snapshot||'')?BigInt(query.snapshot):null;
 if(snapshot!==null&&snapshot>9223372036854775807n)throw Object.assign(Error('Invalid snapshot'),{status:400});
 const bound=snapshot===null?'(SELECT COALESCE(MAX(id),0) FROM audit_logs WHERE cluster_id=$1)':bind(String(snapshot))+'::bigint';
 const dates=[],filters=[];
 for(const [field,op] of [['from','>='],['to','<=']]){
  if(!query[field])continue;
  const time=Date.parse(query[field]);if(!Number.isFinite(time))throw Object.assign(Error('Invalid audit date'),{status:400});
  dates.push('created_at '+op+' '+bind(new Date(time).toISOString())+'::timestamptz');
 }
 if(['1','7','30'].includes(query.period))dates.push("created_at>=NOW()-"+bind(query.period)+"::int * interval '1 day'");
 for(const [field,column] of [['action','action'],['resource','resource'],['user','username'],['status','status']]){
  if(!query[field]||query[field]==='all')continue;
  filters.push(field==='status'&&query.status==='failure'?"status IN ('failed','error')":column+'='+bind(String(query[field])));
 }
 if(query.search)filters.push("strpos(lower(concat_ws(' ',username,action,resource,ip,details::text,id::text)),lower("+bind(String(query.search))+"))>0");
 const order=query.order==='asc'?'ASC':'DESC';
 const sql=`WITH boundary AS (SELECT ${bound} AS cap),
 scoped AS (SELECT id,created_at,COALESCE(user_email,'system') AS username,action,resource,details,status,COALESCE(ip,'-') AS ip
 FROM audit_logs,boundary WHERE cluster_id=$1 AND id<=cap ${dates.length?'AND '+dates.join(' AND '):''}),
 matched AS (SELECT * FROM scoped ${filters.length?'WHERE '+filters.join(' AND '):''}),
 items AS (SELECT id::text,created_at AS time,username AS "user",action,resource,details,status,ip FROM matched
 ORDER BY created_at ${order},matched.id ${order} LIMIT ${bind(limit)} OFFSET ${bind(page*limit)})
 SELECT (SELECT cap::text FROM boundary) AS snapshot,COALESCE((SELECT json_agg(items) FROM items),'[]') AS logs,
 (SELECT count(*)::int FROM matched) AS total,
 (SELECT json_build_object('total',count(*),'success',count(*) FILTER(WHERE status='success'),'failed',count(*) FILTER(WHERE status IN ('error','failed')),
 'recent',count(*) FILTER(WHERE created_at BETWEEN now()-interval '1 day' AND now()),'people',count(DISTINCT username) FILTER(WHERE username<>'system')) FROM scoped) AS stats,
 (SELECT json_build_object('action',array_agg(DISTINCT action),'resource',array_agg(DISTINCT resource),'user',array_agg(DISTINCT username),'status',array_agg(DISTINCT status)) FROM scoped) AS facets,
 (SELECT json_build_object('firstEvent',min(created_at),'lastEvent',max(created_at),'events',count(*)) FROM matched) AS period,
 ${[['status','byStatus'],['action','byAction'],['username','byUser']].map(([column,key])=>`(SELECT COALESCE(json_object_agg(label,n),'{}') FROM (SELECT ${column} AS label,count(*) AS n FROM matched GROUP BY ${column}) counts) AS "${key}"`).join(', ')}`;
 return (await db.query(sql,values)).rows[0];
}
