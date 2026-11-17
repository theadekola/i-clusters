import Redis from 'ioredis';
import {createHmac} from 'node:crypto';
import {freshMeasurement, maximumMeasurementAge} from './assistant-inventory.js';

let client;
function connection() {
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {enableOfflineQueue:false, connectTimeout:1000,
      commandTimeout:500, maxRetriesPerRequest:0, retryStrategy:()=>5000});
    client.on('ready', () => client.connector.stream?.unref?.());
    client.on('error', () => {}); // Monitoring remains available during cache outages.
  }
  return client.status === 'ready' ? client : null;
}

function sampleKey(snapshot) {
  if (!process.env.REDIS_URL || !process.env.JWT_SECRET || snapshot.refreshing || !freshMeasurement(snapshot.sampledAt)) return null;
  const scope = [process.env.ICLUSTERS_CLUSTER_PROFILE || 'default', process.env.DATA_DIR,
    snapshot.proxmox?.guestAlertScope, snapshot.sampledAt];
  return 'iclusters:assistant:v2:' + createHmac('sha256', process.env.JWT_SECRET).update(JSON.stringify(scope)).digest('hex');
}

// Bind the serialized inventory to its profile and sample, including its shape.
// Truncated, edited, old-format or accidentally copied values fall back to monitoring.
function tag(key, body) {
  return createHmac('sha256', process.env.JWT_SECRET).update(key).update(body).digest('hex');
}

export async function cacheMeasurements(snapshot, build) {
  const key = sampleKey(snapshot);
  if (!key) return;
  try {
    const redis = connection();
    if (!redis) return;
    const body = JSON.stringify(build(snapshot));
    const remaining = maximumMeasurementAge - (Date.now() - Date.parse(snapshot.sampledAt));
    if (remaining > 0) await redis.set(key, JSON.stringify({body, tag:tag(key, body)}), 'PX', remaining);
  } catch {} // A failed write must not interrupt monitoring.
}

export async function readMeasurements(snapshot, build) {
  const key = sampleKey(snapshot);
  if (key) {
    try {
      const raw = await connection()?.get(key);
      if (raw) {
        const entry = JSON.parse(raw);
        if (typeof entry?.body === 'string' && entry.tag === tag(key, entry.body)) {
          const cached = JSON.parse(entry.body);
          if (cached?.sampledAt === snapshot.sampledAt && freshMeasurement(cached.sampledAt)) return cached;
        }
      }
    } catch {} // Misses and invalid entries use the same monitor sample.
  }
  return build(snapshot);
}

export function closeMeasurementCache() {
  client?.disconnect();
  client = undefined;
}
