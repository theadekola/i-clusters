import {capabilities, effectiveKeys, presets, validKeys} from './permission-policy.js';

const fail = (message, status = 400) => Object.assign(Error(message), {status});
export const permissionSchema = `
  ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_keys TEXT[];
  ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_revision INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_template TEXT;
  CREATE TABLE IF NOT EXISTS permission_templates (
    name TEXT PRIMARY KEY, keys TEXT[] NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS permission_template_name ON permission_templates(lower(name));
`;
function checkTarget(req) {
  if (req.params.id !== req.user.sub && !['owner','admin'].includes(req.user.role)) throw fail('Insufficient permissions', 403);
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(req.params.id)) throw fail('Invalid account ID');
}
async function target(db, id) {
  const result = await db.query('SELECT role,cluster_roles,permission_keys,permission_revision,permission_template FROM users WHERE id=$1', [id]);
  if (!result.rowCount) throw fail('User not found', 404);
  return result.rows[0];
}
async function history(db,id,before) {
  if (before != null && !/^[0-9]{1,18}$/.test(before)) throw fail('Invalid history cursor');
  const {rows} = await db.query(`SELECT id::text,created_at AS time,user_email AS actor,action,
    details->>'template' AS template,details->'added' AS added,details->'removed' AS removed FROM audit_logs
    WHERE resource=$1 AND action IN ('user.permissions','user.cluster-access') AND status='success'
    AND ($2::bigint IS NULL OR id<$2) ORDER BY audit_logs.id DESC LIMIT 21`, [id,before ?? null]);
  return {changes:rows.slice(0,20), next:rows.length>20 ? rows[19].id : null};
}
export function accountPermissionRoutes(app,db,authorize,onChange) {
  app.get('/api/users/:id/permissions',async (req,res) => {
    checkTarget(req);
    const account = await target(db,req.params.id);
    const role = account.role;
    const profile = req.get('X-IClusters-Profile') || 'default';
    const scoped = role !== 'owner' && account.cluster_roles != null;
    const scopeRole = scoped ? account.cluster_roles[profile] : role;
    const custom = req.user.role === 'owner' ? (await db.query('SELECT name,keys FROM permission_templates ORDER BY lower(name)')).rows : [];
    res.set('Cache-Control','no-store').json({role, scopeCeiling:capabilities(scopeRole), ceiling:capabilities(role),
      keys:effectiveKeys(role,role==='owner' ? null : account.permission_keys), revision:account.permission_revision, template:account.permission_template,
      editable:req.user.role==='owner' && role!=='owner' && req.params.id!==req.user.sub,
      templateCeiling:req.user.role==='owner' ? capabilities('owner') : [],
      templates:[...presets,...custom], ...await history(db,req.params.id)});
  });
  app.get('/api/users/:id/permission-history',async (req,res) => {
    checkTarget(req);
    res.set('Cache-Control','no-store').json(await history(db,req.params.id,req.query.before));
  });
  app.post('/api/users/permission-templates',authorize('owner'),async (req,res) => {
    const {name,keys} = req.body || {};
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || trimmed.length > 64 || /[\x00-\x1f]/.test(trimmed) || !validKeys(keys,capabilities('owner'))) throw fail('Choose a role name and valid permissions.');
    if (presets.some(p=>p.name.toLowerCase()===trimmed.toLowerCase())) throw fail('That role name is already in use.',409);
    const result = await db.query('INSERT INTO permission_templates(name,keys) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING name,keys',[trimmed,keys]);
    if (!result.rowCount) throw fail('That role name is already in use.',409);
    res.status(201).json(result.rows[0]);
  });
  app.put('/api/users/:id/permissions',authorize('owner'),async (req,res) => {
    checkTarget(req);
    const account = await target(db,req.params.id);
    if (account.role==='owner' || req.params.id===req.user.sub) throw fail('Owner permissions are protected.',403);
    const {keys,revision,template=null} = req.body || {};
    const ceiling = capabilities(account.role);
    if (!validKeys(keys,ceiling) || !Number.isInteger(revision)) throw fail('Choose permissions within the assigned role.');
    if (account.permission_revision!==revision) throw fail('Permissions changed. Reset changes and try again.',409);
    if (template !== null) {
      if (typeof template !== 'string' || template.length>64) throw fail('Invalid role template.');
      const preset = presets.find(entry=>entry.name===template) ||
        (await db.query('SELECT keys FROM permission_templates WHERE name=$1',[template])).rows[0];
      const applicable = preset && effectiveKeys(account.role,preset.keys);
      if (!applicable || applicable.length!==keys.length || !keys.every(key=>applicable.includes(key))) throw fail('Invalid role template.');
    }
    const previous = effectiveKeys(account.role,account.permission_keys);
    const added = keys.filter(key=>!previous.includes(key)), removed = previous.filter(key=>!keys.includes(key));
    if (!added.length && !removed.length && account.permission_template===template) return res.json({keys,revision});
    // Persist the new policy and its history in the same statement. The version
    // check also protects against concurrent saves from a different browser.
    const result = await db.query(`WITH changed AS (
      UPDATE users SET permission_keys=$1, permission_template=$9, permission_revision=permission_revision+1
      WHERE id=$2 AND role=$3 AND permission_revision=$4 RETURNING permission_revision
    ) INSERT INTO audit_logs(user_id,user_email,action,resource,details,status)
      SELECT $5,$6,'user.permissions',$7,$8::jsonb,'success' FROM changed RETURNING id`,
      [template===null && keys.length===ceiling.length ? null : keys,req.params.id,account.role,revision,req.user.sub,req.user.email||req.user.username,
       req.params.id,JSON.stringify({added,removed,template}),template]);
    if (!result.rowCount) throw fail('Permissions changed. Reset changes and try again.',409);
    onChange(req.params.id);
    res.json({keys,revision:revision+1});
  });
}
