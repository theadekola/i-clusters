import {createHash, randomBytes} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {accountIdentity} from './username.js';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const invalidLink = 'Open the current setup link from the controller console.';
const digest = token => createHash('sha256').update(token).digest('hex');

export async function setupStatus(db) {
 const result=await db.query('SELECT EXISTS(SELECT 1 FROM users) AS registered');
 const needsOwner=!result.rows[0].registered;
 return {registrationOpen:needsOwner,needsOwner};
}

async function whileUnclaimed(db, operation) {
 const client = await db.connect();
 try {
  await client.query('BEGIN');
  await client.query('LOCK TABLE users IN EXCLUSIVE MODE');
  if (!(await setupStatus(client)).needsOwner) {
   fail('Registration is closed. Sign in or ask an administrator for an account.', 409);
  }
  const result = await operation(client);
  await client.query('COMMIT');
  return result;
 } catch (error) {
  await client.query('ROLLBACK');
  throw error;
 } finally {
  client.release();
 }
}

// Only the host console can issue or replace a link. Issuance and claims take the same lock.
export function issueOwnerSetupToken(db) {
 return whileUnclaimed(db, async client => {
  const token = randomBytes(32).toString('hex');
  await client.query(`INSERT INTO owner_setup_link (singleton, token_digest, expires_at)
    VALUES (true, $1, clock_timestamp() + interval '30 minutes')
    ON CONFLICT (singleton) DO UPDATE SET token_digest = EXCLUDED.token_digest, expires_at = EXCLUDED.expires_at`, [digest(token)]);
  return token;
 });
}

async function insertOwner(client, input) {
 const name=String(input.name||'').trim(),{email,username}=accountIdentity(input),password=input.password;
 if(!name||name.length>100)fail('Name is required (maximum 100 characters).');
 if(typeof password!=='string'||password.length<12||password.length>72||Buffer.byteLength(password)>72)fail('Password must be at least 12 characters and at most 72 bytes.');
 const hash = await bcrypt.hash(password, 12);
 const result = await client.query("INSERT INTO users(email,name,password_hash,role,status,username) VALUES($1,$2,$3,'owner','active',$4) RETURNING id,email,username,name,role,status", [email,name,hash,username]);
 return result.rows[0];
}

export function registerOwner(db, input = {}) {
 const token = input?.setupToken;
 if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail(invalidLink, 403);
 return whileUnclaimed(db, async client => {
  const consumed = await client.query(
   'DELETE FROM owner_setup_link WHERE token_digest = $1 AND expires_at > clock_timestamp()', [digest(token)]);
  if (consumed.rowCount !== 1) fail(invalidLink, 403);
  return insertOwner(client, input);
 });
}

export function claimOwnerFromConsole(db, input) {
 return whileUnclaimed(db, async client => {
  await client.query('DELETE FROM owner_setup_link');
  return insertOwner(client, input);
 });
}
