import path from 'node:path';
import {createClusterStore} from './cluster-config.js';

export const SSH_CREDENTIAL_LIFETIME = 48 * 60 * 60 * 1000;
const vault = mode => createClusterStore(path.join(process.env.DATA_DIR || 'runtime', mode === 'sftp' ? 'sftp-connections.json' : 'ssh-connections.json'), undefined, value => value);

export function purgeSavedSSH(mode = 'shell', now = Date.now()) {
  const store = vault(mode), saved = store.read() || {};
  let changed = false;
  for (const [key, value] of Object.entries(saved)) {
    const timed = mode === 'sftp' || Object.hasOwn(value ?? {}, 'expiresAt');
    if (!Number.isFinite(value?.savedAt) || value.savedAt > now || (timed &&
      (!Number.isFinite(value.expiresAt) || value.expiresAt <= now || value.expiresAt > value.savedAt + SSH_CREDENTIAL_LIFETIME))) {
      delete saved[key]; changed = true;
    }
  }
  // Legacy credentials have no reliable creation time and require a fresh login.
  if (changed) store.save(saved);
  return saved;
}
export function savedSSH(user, target, mode = 'shell') {
  return purgeSavedSSH(mode)[`${user}:${target}`] || null;
}
export function publicSavedSSH(user, mode = 'shell') {
  return Object.fromEntries(Object.entries(purgeSavedSSH(mode)).filter(([key]) => key.startsWith(user + ':')).map(([key, value]) => [key.slice(user.length + 1), {
    host: value.host, port: value.port, username: value.username, fingerprint: value.fingerprint,
    hasPassword: true, savedAt: value.savedAt, expiresAt: value.expiresAt
  }]));
}
export function deleteSavedSSH(user, target, mode = 'shell') {
  const saved = purgeSavedSSH(mode);
  delete saved[`${user}:${target}`]; vault(mode).save(saved);
}
export function saveSSH(user, target, mode, connection, previous) {
  const saved = purgeSavedSSH(mode), now = Date.now();
  const value = {...connection, savedAt: previous?.savedAt ?? now};
  if (mode === 'sftp') {
    value.expiresAt = previous?.expiresAt ?? now + SSH_CREDENTIAL_LIFETIME;
    if (value.expiresAt <= now) throw Object.assign(Error('Saved credentials expired. Enter the SSH password again.'), {status: 401});
  }
  saved[`${user}:${target}`] = value; vault(mode).save(saved);
  return value;
}
