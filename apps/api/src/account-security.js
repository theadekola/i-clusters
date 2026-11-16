import {createInventoryToken,forgetDevice,rememberVerifiedDevice} from './account-access.js';
import {accountIdentity} from './username.js';
import {PNG} from 'pngjs';
import {Router} from 'express';
import {sessionResponse,clearSessionCookie,browserSession} from './browser-sessions.js';
import {issueTokens} from './security.js';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {base32,seal,unseal,matchingStep,requirePassword,consumeFactor,recoveryCodes,digest} from './mfa.js';
const error=(message,status=400)=>Object.assign(Error(message),{status});
export async function revokeAll(db,id){const version=await db.query('UPDATE users SET token_version=token_version+1 WHERE id=$1 RETURNING token_version',[id]);await db.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[id]);await db.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[id]);return version.rows[0]?.token_version;}
export async function renewAccountSession(db,id,version,options,issue=issueTokens){
 const r=await db.query('SELECT * FROM users WHERE id=$1 AND status=$2',[id,'active']);
 if(!r.rowCount||r.rows[0].token_version!==version)throw error('Account credentials changed. Sign in again.',401);
 return issue(r.rows[0],options);
}
export function accountSecurityRouter({db,audit,limiter,onSessionRevoked=()=>{}}){
 const router=Router();router.use((req,res,next)=>{res.set('Cache-Control','no-store');next()});
 const wrap=fn=>async(req,res)=>{try{browserSession(req);await fn(req,res)}catch(e){res.status(e.status||503).json({error:e.status?e.message:'Account security is temporarily unavailable. Try again shortly.'})}};
 const transaction=async fn=>{const c=await db.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}};
 const invalidate=async(c,id)=>{const version=await revokeAll(c,id);onSessionRevoked(id);return version};
 const renewed=(req,version)=>renewAccountSession(db,req.user.sub,version,{remember:req.user.remember,sessionExp:req.user.sessionExp,device:req.get('User-Agent')});
 const verified=async(req,c=db)=>{const user=await requirePassword(c,req.user.sub,req.body.password);if(user.two_factor_enabled)await consumeFactor(c,user,req.body.code);return user};
 router.get('/security',wrap(async(req,res)=>{const r=await db.query('SELECT two_factor_enabled,new_device_mfa FROM users WHERE id=$1',[req.user.sub]),count=await db.query('SELECT count(*)::int AS count FROM mfa_recovery_codes WHERE user_id=$1',[req.user.sub]);res.json({remember:req.user.remember===true,newDeviceMfa:!!r.rows[0]?.new_device_mfa,mfaEnabled:!!r.rows[0]?.two_factor_enabled,recoveryCodesRemaining:count.rows[0]?.count||0})}));
 router.get('/sessions',wrap(async(req,res)=>{const r=await db.query('SELECT id,device,created_at,expires_at FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>NOW() ORDER BY created_at DESC LIMIT 100',[req.user.sub]);res.json({sessions:r.rows.map(s=>({...s,current:s.id===req.user.sid}))})}));
 router.get('/tokens',wrap(async(req,res)=>{
  const result=await db.query('SELECT t.id,t.name,t.expires_at FROM account_api_tokens t JOIN users u ON u.id=t.user_id WHERE t.user_id=$1 AND t.version=u.token_version AND t.expires_at>NOW() ORDER BY t.created_at DESC',[req.user.sub]);
  res.json({tokens:result.rows});
 }));
 router.get('/profile-picture/:id',wrap(async(req,res)=>{
  if(req.params.id!==req.user.sub && (!['admin','owner'].includes(req.user.role) ||
     (req.user.permissionKeys && !req.user.permissionKeys.includes('users.view')))) throw error('Insufficient permissions',403);
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(req.params.id))throw error('Invalid account ID');
  const result=await db.query('SELECT profile_picture FROM users WHERE id=$1',[req.params.id]);
  const picture=result.rows[0]?.profile_picture;
  if(!picture)throw error('Profile picture unavailable.',404);
  res.json({image:'data:image/png;base64,'+picture.toString('base64')});
 }));
 router.use(limiter);
 const withAccount=async(req,change)=>transaction(async c=>{
  await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.sub]);
  const user=await verified(req,c);return change(c,user);
 });
 router.post('/tokens',wrap(async(req,res)=>{
  const name=typeof req.body.name==='string'?req.body.name.trim():'',days=req.body.days;
  if(!name||name.length>80||![7,30,90].includes(days))throw error('Choose a token name and expiry.');
  const token=await withAccount(req,(c,user)=>createInventoryToken(c,user,name,days));
  await audit(req,'account.token.create',token.id,{},'success');res.status(201).json(token);
 }));
 router.post('/tokens/revoke',wrap(async(req,res)=>{
  if(!/^[a-f0-9-]{36}$/i.test(String(req.body.id)))throw error('Choose a token.');
  await withAccount(req,(c,user)=>c.query('DELETE FROM account_api_tokens WHERE id=$1 AND user_id=$2',[req.body.id,user.id]));
  await audit(req,'account.token.revoke',req.body.id,{},'success');res.json({ok:true});
 }));
 router.post('/device-policy',wrap(async(req,res)=>{
  if(typeof req.body.enabled!=='boolean')throw error('Choose a device verification policy.');
  await withAccount(req,async(c,user)=>{
   if(!user.two_factor_enabled)throw error('Enable MFA first.');
   await c.query('UPDATE users SET new_device_mfa=$1 WHERE id=$2',[req.body.enabled,user.id]);
   await c.query('DELETE FROM account_devices WHERE user_id=$1',[user.id]);
  });
  await audit(req,'account.device-policy.change',req.user.sub,{},'success');res.json({ok:true});
 }));
 router.post('/remember',wrap(async(req,res)=>{
  if(typeof req.body.enabled!=='boolean'||!req.user.sid)throw error('Sign in again to change this session.');
  const tokens=await withAccount(req,async(c,user)=>{
   const revoked=await c.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>NOW() RETURNING id',[req.user.sid,user.id]);
   if(!revoked.rowCount)throw error('Session expired. Sign in again.',401);
   if(req.body.enabled)await rememberVerifiedDevice(c,req,res,user);else await forgetDevice(c,req,res,user.id);
   return issueTokens(user,{remember:req.body.enabled,device:req.get('User-Agent')},c.query.bind(c));
  });
  onSessionRevoked(req.user.sub,req.user.sid);
  await audit(req,'account.remember.change',req.user.sub,{},'success');sessionResponse(req,res,tokens);
 }));
 router.put('/profile',wrap(async(req,res)=>{
  const {name,contactEmail,bio,timeZone}=req.body;
  if(typeof name!=='string'||!name.trim()||name.trim().length>200)throw error('Enter a valid full name.');
  if(typeof bio!=='string'||bio.length>300||typeof contactEmail!=='string'||contactEmail.length>254||(contactEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)))throw error('Check the contact email and bio.');
  if(typeof timeZone!=='string'||timeZone.length>100)throw error('Choose a valid time zone.');
  try{new Intl.DateTimeFormat('en',{timeZone})}catch{throw error('Choose a valid time zone.')}
  const username=Object.hasOwn(req.body,'username') ? accountIdentity({username:req.body.username}).username : null;
  const profile={contactEmail,bio,timeZone,revision:crypto.randomUUID()};
  let picture=null;
  if(Object.hasOwn(req.body,'picturePixels')){
   // Accept only the exact RGBA thumbnail. The database image is encoded here from pixels.
   const raw=req.body.picturePixels,bytes=128*128*4;
   if(typeof raw!=='string'||raw.length!==4*Math.ceil(bytes/3))throw error('Invalid profile picture.');
   const pixels=Buffer.from(raw,'base64');
   if(pixels.length!==bytes||pixels.toString('base64')!==raw)throw error('Invalid profile picture.');
   picture=PNG.sync.write({width:128,height:128,data:pixels});
   profile.pictureVersion=profile.revision;
  }
  const expected=req.body.revision??null;
  if(expected!==null && (typeof expected!=='string'||expected.length>36))throw error('Invalid profile revision.');
  let result;
  try{
   result=await db.query(`UPDATE users SET name=$1,profile=profile || $2::jsonb,
    username=COALESCE($4,username),profile_picture=COALESCE($5::bytea,profile_picture)
    WHERE id=$3 AND ($6::text IS NULL OR COALESCE(profile->>'revision','')=$6)
    RETURNING name,username,profile`,[name.trim(),profile,req.user.sub,username,picture,expected]);
  }catch(e){if(e.code==='23505')throw error('That username is already in use.',409);throw e}
  if(!result.rowCount)throw error('This profile changed. Reopen it before saving.',409);
  await audit(req,'account.profile.update',req.user.sub,{},'success');
  res.json(result.rows[0]);
 }));
 router.post('/mfa/setup',wrap(async(req,res)=>{const user=await requirePassword(db,req.user.sub,req.body.password);if(user.two_factor_enabled)throw error('MFA is already enabled.');const secret=base32(crypto.randomBytes(20));await db.query("UPDATE users SET mfa_pending_secret=$1,mfa_pending_expires=NOW()+INTERVAL '10 minutes' WHERE id=$2 AND two_factor_enabled=FALSE",[seal(secret),req.user.sub]);res.json({secret,uri:`otpauth://totp/${encodeURIComponent('i-Clusters:'+user.username)}?secret=${secret}&issuer=i-Clusters&algorithm=SHA1&digits=6&period=30`,message:'Add this setup key to your authenticator app, then enter its six-digit code. MFA is not enabled until verified.'})}));
 router.post('/mfa/enable',wrap(async(req,res)=>{await requirePassword(db,req.user.sub,req.body.password);const codes=recoveryCodes();const version=await transaction(async c=>{const r=await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[req.user.sub]),u=r.rows[0];await requirePassword(c,req.user.sub,req.body.password);if(u.two_factor_enabled||!u.mfa_pending_secret||Date.parse(u.mfa_pending_expires)<=Date.now())throw error('Authenticator setup expired. Start again.');const step=matchingStep(unseal(u.mfa_pending_secret),req.body.code);if(step===null)throw error('Enter a valid authenticator code.',401);await c.query('UPDATE users SET two_factor_enabled=TRUE,totp_secret=mfa_pending_secret,mfa_pending_secret=NULL,mfa_pending_expires=NULL,totp_last_step=$1 WHERE id=$2',[step,u.id]);await c.query('DELETE FROM mfa_recovery_codes WHERE user_id=$1',[u.id]);for(const code of codes)await c.query('INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)',[u.id,digest(code.replace(/-/g,''))]);return invalidate(c,u.id)});await audit(req,'account.mfa.enable',req.user.sub,{},'success');sessionResponse(req,res,{ok:true,...await renewed(req,version),recoveryCodes:codes,message:'MFA enabled. Save these recovery codes securely. Other devices have been signed out.'})}));
 router.post('/mfa/recovery',wrap(async(req,res)=>{const codes=recoveryCodes();const version=await transaction(async c=>{await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.sub]);const u=await verified(req,c);if(!u.two_factor_enabled)throw error('Enable MFA first.');await c.query('DELETE FROM mfa_recovery_codes WHERE user_id=$1',[u.id]);for(const code of codes)await c.query('INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)',[u.id,digest(code.replace(/-/g,''))]);return invalidate(c,u.id)});await audit(req,'account.mfa.recovery.rotate',req.user.sub,{},'success');sessionResponse(req,res,{ok:true,...await renewed(req,version),recoveryCodes:codes,message:'New recovery codes created. Previous codes are invalid. Other devices have been signed out.'})}));
 router.post('/mfa/disable',wrap(async(req,res)=>{await transaction(async c=>{await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.sub]);const u=await verified(req,c);if(!u.two_factor_enabled)throw error('MFA is not enabled.');await c.query('UPDATE users SET two_factor_enabled=FALSE,new_device_mfa=FALSE,totp_secret=NULL,mfa_pending_secret=NULL,mfa_pending_expires=NULL,totp_last_step=-1 WHERE id=$1',[u.id]);await c.query('DELETE FROM mfa_recovery_codes WHERE user_id=$1',[u.id]);await invalidate(c,u.id)});await audit(req,'account.mfa.disable',req.user.sub,{},'success');res.json({ok:true,signInRequired:true})}));
 router.post('/password',wrap(async(req,res)=>{const password=req.body.newPassword;if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>72)throw error('Use at least 12 characters and no more than 72 UTF-8 bytes.');const hash=await bcrypt.hash(password,12);await transaction(async c=>{await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.sub]);await verified(req,c);await c.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,req.user.sub]);await invalidate(c,req.user.sub)});await audit(req,'account.password.change',req.user.sub,{},'success');res.json({ok:true,signInRequired:true})}));
 router.post('/sessions/revoke',wrap(async(req,res)=>{await transaction(async c=>{await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.sub]);await verified(req,c);if(req.body.all===true)await invalidate(c,req.user.sub);else {if(typeof req.body.id!=='string'||!/^[a-f0-9-]{36}$/i.test(req.body.id))throw error('Choose a session.');await c.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2',[req.body.id,req.user.sub]);onSessionRevoked(req.user.sub,req.body.id)}});await audit(req,'account.sessions.revoke',req.user.sub,{},'success');res.json({ok:true,signInRequired:req.body.all===true||req.body.id===req.user.sid})}));
 router.post('/logout',wrap(async(req,res)=>{if(req.user.sid)await db.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2',[req.user.sid,req.user.sub]);else await invalidate(db,req.user.sub);onSessionRevoked(req.user.sub,req.user.sid);clearSessionCookie(res);res.json({ok:true})}));
 return router;
}
