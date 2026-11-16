import {randomBytes,createHash} from 'node:crypto';
import {browserSession} from './browser-sessions.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const deviceCookie='__Host-iclusters-device';
export const accountAccessSchema=`
 ALTER TABLE users ADD COLUMN IF NOT EXISTS new_device_mfa BOOLEAN NOT NULL DEFAULT FALSE;
 CREATE TABLE IF NOT EXISTS account_devices (
   digest TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   version INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL
 );
 CREATE INDEX IF NOT EXISTS account_devices_owner ON account_devices(user_id);
 CREATE TABLE IF NOT EXISTS account_api_tokens (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(), digest TEXT NOT NULL UNIQUE,
   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, version INTEGER NOT NULL,
   name TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE INDEX IF NOT EXISTS account_api_tokens_owner ON account_api_tokens(user_id);
`;
function deviceProof(req){
 const cookie=String(req.headers.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(deviceCookie+'='));
 const value=cookie?.slice(deviceCookie.length+1);
 return value&&/^[a-f0-9]{64}$/.test(value)?hash(value):null;
}
export async function forgetDevice(db,req,res,id){
 if(!browserSession(req))return;
 const proof=deviceProof(req);
 if(proof)await db.query('DELETE FROM account_devices WHERE user_id=$1 AND digest=$2',[id,proof]);
 res.clearCookie(deviceCookie,{httpOnly:true,secure:true,sameSite:'strict',path:'/'});
}
export async function knownDevice(db,req,user){
 if(!user.two_factor_enabled||!user.new_device_mfa||!browserSession(req))return false;
 const proof=deviceProof(req);
 if(!proof)return false;
 const result=await db.query('SELECT 1 FROM account_devices WHERE digest=$1 AND user_id=$2 AND version=$3 AND expires_at>NOW()',[proof,user.id,user.token_version]);
 return result.rowCount===1;
}
export async function rememberVerifiedDevice(db,req,res,user){
 if(!user.new_device_mfa||!user.two_factor_enabled||!browserSession(req))return;
 const value=randomBytes(32).toString('hex');
 await db.query("DELETE FROM account_devices WHERE user_id=$1 AND (expires_at<=NOW() OR version<>$2)",[user.id,user.token_version]);
 await db.query("INSERT INTO account_devices(digest,user_id,version,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '10 days')",[hash(value),user.id,user.token_version]);
 res.cookie(deviceCookie,value,{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:864000000});
}
export async function createInventoryToken(db,user,name,days){
 const secret='icl_'+randomBytes(32).toString('hex');
 const result=await db.query("INSERT INTO account_api_tokens(digest,user_id,version,name,expires_at) VALUES($1,$2,$3,$4,NOW()+$5::int*INTERVAL '1 day') RETURNING id,name,expires_at",[hash(secret),user.id,user.token_version,name,days]);
 return {...result.rows[0],secret};
}
export async function inventoryIdentity(query,raw,method,path){
 if(method!=='GET'||!['/api/proxmox','/api/monitoring'].includes(path.split('?')[0]))return null;
 if(!/^icl_[0-9a-f]{64}$/.test(raw))return null;
 const result=await query("SELECT u.id,u.username,u.name,u.email,u.role,u.cluster_roles,u.permission_keys FROM account_api_tokens t JOIN users u ON u.id=t.user_id WHERE t.digest=$1 AND t.expires_at>NOW() AND t.version=u.token_version AND u.status='active'",[hash(raw)]);
 const u=result.rows[0];
 if(!u||!['viewer','auditor','operator','admin','owner'].includes(u.role))return null;
 const scope=process.env.ICLUSTERS_CLUSTER_PROFILE||'default';
 if(u.role!=='owner'&&u.cluster_roles!=null&&!['viewer','auditor','operator','admin'].includes(u.cluster_roles[scope]))return null;
 return {sub:u.id,email:u.email||u.username,username:u.username,name:u.name,role:'viewer',...(u.role!=='owner'&&u.permission_keys!=null?{permissionKeys:u.permission_keys}:{})};
}
