// CI supplies a disposable PostgreSQL database. Each run creates its own schema.
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import {migrate} from '../src/db.js';
import {claimOwnerFromConsole, issueOwnerSetupToken, registerOwner} from '../src/setup.js';

const connectionString = process.env.OWNER_SETUP_TEST_DATABASE_URL;
const account = {name:'Setup Test', username:'setup_test', password:'Disposable owner password'};
const denied = status => error => error.status === status;

test('first-owner claims, replacement and recovery across database connections', {skip:!connectionString}, async () => {
 const admin = new pg.Pool({connectionString});
 const schema = 'setup_' + randomUUID().replaceAll('-', '');
 const options = {connectionString, options:'-c search_path=' + schema};
 let db = new pg.Pool(options);
 try {
  await admin.query('CREATE SCHEMA ' + schema);
  await migrate(db);
  await assert.rejects(registerOwner(db, {...account,setupToken:'a'.repeat(64)}),denied(403));

  const old = await issueOwnerSetupToken(db);
  const active = await issueOwnerSetupToken(db);
  const stored = await db.query('SELECT token_digest, expires_at > now() AS fresh FROM owner_setup_link');
  assert.deepEqual(stored.rows,[{token_digest:createHash('sha256').update(active).digest('hex'), fresh:true}]);
  await assert.rejects(registerOwner(db,{...account,setupToken:old}),denied(403));
  await db.query("UPDATE owner_setup_link SET expires_at = now() - interval '1 second'");
  await assert.rejects(registerOwner(db,{...account,setupToken:active}),denied(403));

  const setupToken = await issueOwnerSetupToken(db);
  await db.end();
  db = new pg.Pool(options);
  await migrate(db);
  await assert.rejects(registerOwner(db,{...account,setupToken,password:'too short'}),denied(400));
  const outcomes = await Promise.allSettled([
   registerOwner(db,{...account,setupToken}),
   registerOwner(db,{...account,username:'second_owner',setupToken})
  ]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(outcomes.find(r=>r.status==='rejected').reason.status,409);
  assert.equal((await db.query('SELECT id FROM users')).rowCount,1);
  assert.equal((await db.query('SELECT singleton FROM owner_setup_link')).rowCount,0);

  // Even an inactive, non-owner account must keep setup closed after an upgrade.
  await db.query("UPDATE users SET role='viewer', status='inactive'");
  await db.query("INSERT INTO settings(key,value) VALUES ('connection-fixture',$1)",[{host:'fixture.invalid'}]);
  const snapshot = async () => ({
   users:(await db.query('SELECT * FROM users')).rows,
   settings:(await db.query('SELECT * FROM settings')).rows
  });
  const existing = await snapshot();
  await migrate(db);
  for (const attempt of [()=>issueOwnerSetupToken(db),()=>registerOwner(db,{...account,setupToken}),()=>claimOwnerFromConsole(db,account)]) {
   await assert.rejects(attempt(),denied(409));
  }
  assert.deepEqual(await snapshot(),existing);
 } finally {
  await db.end();
  try {await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');}
  finally {await admin.end();}
 }
});
