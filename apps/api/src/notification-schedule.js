// Quiet hours and digest boundaries use UTC, including across midnight and restarts.
export const scheduleDefaults = {
 quietHoursEnabled: false, quietStart: '22:00', quietEnd: '07:00',
 deliveryMode: 'immediate', digestMinutes: 60, repeatMinutes: 0
};
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function validateSchedule(input, existing) {
 const patch = Object.fromEntries(Object.keys(scheduleDefaults).filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]));
 const p = {...scheduleDefaults, ...existing, ...patch};
 if (typeof p.quietHoursEnabled !== 'boolean' || ![p.quietStart,p.quietEnd].every(t => typeof t === 'string' && clock.test(t)) ||
     (p.quietHoursEnabled && p.quietStart === p.quietEnd) || !['immediate','digest'].includes(p.deliveryMode) ||
     ![15,30,60,240,1440].includes(p.digestMinutes) || ![0,30,60,240,1440].includes(p.repeatMinutes))
  throw Object.assign(Error('Choose a valid delivery schedule and different quiet-hour start and end times.'), {status:400});
 return patch;
}
export function quietNow(p, time) {
 if (!p.quietHoursEnabled) return false;
 const clockTime = new Date(time).toISOString().slice(11,16);
 return p.quietStart < p.quietEnd ? clockTime >= p.quietStart && clockTime < p.quietEnd : clockTime >= p.quietStart || clockTime < p.quietEnd;
}
export function digestDue(row, p, time) {
 if (p.deliveryMode !== 'digest') return true;
 const interval = p.digestMinutes * 60000;
 const created = Date.parse(row.createdAt);
 return !Number.isFinite(created) || Math.floor(created/interval) < Math.floor(time/interval);
}
