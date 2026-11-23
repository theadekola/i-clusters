import {readFileSync} from 'node:fs';
const script = readFileSync(new URL('./guest-package-update.sh',import.meta.url),'utf8');
export const guestUpdateCommand = 'sh -c '+"'"+script.replaceAll("'","'\\''")+"'";

export function assertGuestUpdateSession(session, loginId) {
 if (!session || session.sessionId !== loginId || session.mode !== 'shell' || session.closed || session.updateChannel ||
     !/^(vm|lxc):[A-Za-z0-9_.-]+:\d+$/.test(session.target || ''))
   throw Object.assign(new Error('Open a connected VM or CT shell to check guest updates.'), {status:403});
}

export function completedGuestUpdate(code, tail){
 if(code!==0)return null;
 const match=/(?:^|\n)ICLUSTERS_UPDATE_RESULT=([01])\|([^\x00-\x1f\x7f|]{1,200})\r?\n?$/.exec(tail);
 return match?{osVersion:match[2],rebootRequired:match[1]==='1'}:null;
}
