import assert from 'node:assert/strict';
import test from 'node:test';
import {createNotifier,defaultNotificationPreferences,validateNotificationPreferences} from '../src/notifications.js';

function fixture(preferences={},at='2026-11-14T21:59:00Z') {
 let time=Date.parse(at);
 const deliveries=[],state={notificationPreferences:{...defaultNotificationPreferences(),...preferences}};
 const options={now:()=>time,persistence:{get:()=>state,mutate:fn=>fn(state)},
  env:{DISCORD_WEBHOOK_URL:'fixture',TELEGRAM_BOT_TOKEN:'fixture',TELEGRAM_CHAT_ID:'fixture'},
  send:async(channel,text)=>{deliveries.push({channel,text});}};
 const alert=(id,status='active')=>({id,title:id,source:'node01',severity:'warning',status,triggered:at,lastSeen:new Date(time).toISOString()});
 return {options,state,alert,deliveries,advance:minutes=>{time+=minutes*60000;}};
}

test('overnight quiet hours defer automatic deliveries, including after restart, while manual tests remain immediate',async()=>{
 const f=fixture({quietHoursEnabled:true});
 f.advance(1);
 const worker=createNotifier(f.options);
 await worker.deliver([f.alert('cpu')]);assert.equal(worker.status().pending,2);
 await worker.test('discord');assert.equal(f.deliveries.length,1);
 f.advance(539);await worker.deliver([f.alert('cpu')]);assert.equal(f.deliveries.length,1);
 f.advance(1);await createNotifier(f.options).deliver([f.alert('cpu')]);assert.equal(f.deliveries.length,3);
});

test('digest sends one message per channel at the boundary and retries only missing deliveries',async()=>{
 const f=fixture({deliveryMode:'digest',digestMinutes:15},'2026-11-14T12:14:00Z');
 const send=f.options.send;let fail=true;
 f.options.send=async(channel,text)=>{if(channel==='discord'&&fail)throw Error('offline');await send(channel,text)};
 let worker=createNotifier(f.options);
 const alerts=()=>[f.alert('cpu'),f.alert('disk')];
 await worker.deliver(alerts());assert.equal(f.deliveries.length,0);
 f.advance(1);await worker.deliver(alerts());
 assert.equal(f.deliveries.length,1);assert.equal(f.deliveries[0].channel,'telegram');
 assert.match(f.deliveries[0].text,/Notification digest[\s\S]*cpu[\s\S]*disk/);
 assert.equal(worker.status().pending,2);fail=false;worker=createNotifier(f.options);
 await worker.deliver(alerts());assert.equal(f.deliveries.length,1);
 f.advance(1);await worker.deliver(alerts());assert.equal(f.deliveries.length,2);assert.equal(worker.status().pending,0);
});

test('reminders use successful delivery time, survive restart and stop after acknowledgement',async()=>{
 const f=fixture({repeatMinutes:30});
 const worker=createNotifier(f.options);await worker.deliver([f.alert('cpu')]);
 f.advance(29);await worker.deliver([f.alert('cpu')]);assert.equal(f.deliveries.length,2);
 f.advance(1);await createNotifier(f.options).deliver([f.alert('cpu')]);assert.equal(f.deliveries.length,4);
 assert.match(f.deliveries[2].text,/Reminder/);assert.equal(worker.status().history.filter(r=>r.event==='reminder').length,2);
 await worker.deliver([f.alert('cpu')]);f.advance(60);
 await worker.deliver([f.alert('cpu','acknowledged')]);assert.equal(f.deliveries.length,4);
});

test('scheduling validates types, intervals and UTC times, preserving omitted legacy fields',()=>{
 const base=defaultNotificationPreferences();
 for(const patch of [{deliveryMode:'later'},{digestMinutes:0},{repeatMinutes:-1},{quietHoursEnabled:'yes'},{quietStart:'25:00'},{quietHoursEnabled:true,quietEnd:base.quietStart}])
  assert.throws(()=>validateNotificationPreferences({...base,...patch}),{status:400});
 const {quietHoursEnabled,quietStart,quietEnd,deliveryMode,digestMinutes,repeatMinutes,...legacy}=base;
 const saved={...base,repeatMinutes:30,quietHoursEnabled:true};
 assert.equal(({...saved,...validateNotificationPreferences(legacy,saved)}).repeatMinutes,30);
});
