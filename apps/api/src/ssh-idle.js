export const SHELL_IDLE_MS=20*60*1000;
export const SHELL_SESSION_MS=48*60*60*1000;
export const SFTP_SESSION_MS=24*60*60*1000;

export function shellDeadline(mode, now=Date.now()){
 return now+(mode==='sftp'?SFTP_SESSION_MS:SHELL_SESSION_MS);
}
export function shellExpired(session,now=Date.now()){
 if(now>=session.expiresAt)return true;
 if(session.credentialsExpireAt != null && now >= session.credentialsExpireAt)return true;
 if(session.mode==='sftp')return now-session.touched>60000;
 return session.hiddenAt==null&&now-session.touched>=SHELL_IDLE_MS;
}
export function updateShellPresence(session,presence,now=Date.now()){
 if(presence==='hidden'){
  if(session.hiddenAt==null)session.hiddenAt=now;
 }else if(presence==='visible'){
  if(session.hiddenAt!=null){session.touched+=Math.max(0,now-session.hiddenAt);delete session.hiddenAt;}
 }else if(presence==='active'){
  delete session.hiddenAt;session.touched=now;
 }
}
