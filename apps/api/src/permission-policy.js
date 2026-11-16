// The built-in role and cluster assignment are upper bounds. A saved selection
// only narrows them. Missing operations have no independently assignable grant.
const levels = new Map([['viewer',1], ['auditor',2], ['operator',3], ['admin',4], ['owner',5]]);
export const groups = {
  cluster: {view: 1, create: 4, edit: 4, manage: 4},
  vm: {view: 1, create: 3, edit: 4, delete: 3, manage: 3},
  containers: {view: 1, create: 3, edit: 4, delete: 3, manage: 3},
  network: {view: 1, create: 3, edit: 4, delete: 4, manage: 4},
  backups: {view: 1, create: 4, edit: 4, delete: 4, manage: 3},
  users: {view: 4, create: 4, manage: 4},
  audit: {view: 2},
  settings: {view: 1, edit: 4}
};
export function capabilities(role) {
  return Object.entries(groups).flatMap(([area, actions]) =>
    Object.entries(actions).filter(([,level]) => level <= (levels.get(role) || 0)).map(([action]) => area + '.' + action));
}
const all = capabilities('owner');
export const presets = [
  {name: 'Backup Operator', keys: ['cluster.view','vm.view','containers.view',...all.filter(key => key.startsWith('backups.'))]},
  {name: 'Read-Only Auditor', keys: all.filter(key => key.endsWith('.view'))},
  {name: 'VM Manager', keys: ['cluster.view',...all.filter(key => key.startsWith('vm.'))]},
  {name: 'Network Reviewer', keys: ['cluster.view','network.view']}
];
export function validKeys(input, ceiling) {
  return Array.isArray(input) && input.length <= ceiling.length &&
    input.every(key => ceiling.includes(key)) && new Set(input).size === input.length &&
    input.every(key => input.includes(key.split('.')[0] + '.view'));
}
export function effectiveKeys(role, selection) {
  return capabilities(role).filter(key => selection == null || selection.includes(key));
}
const reads = [
  [/^\/proxmox\/node\/[^/]+\/details$/, 'cluster'],
  [/^\/proxmox\/vm\/[^/]+\/[^/]+\/details$|^\/proxmox\/installation-media\/[^/]+$/, 'vm'],
  [/^\/proxmox\/lxc\/[^/]+\/[^/]+\/details$|^\/proxmox\/ct-templates\/[^/]+$/, 'containers'],
  [/^\/(?:network(?:\/(?:dns|firewall\/[^/]+))?|proxmox\/network(?:\/[^/]+)?)$/, 'network'],
  [/^\/(?:backups(?:\/jobs)?|retention(?:\/preview)?|schedules|restore)$/, 'backups'],
  [/^\/proxmox\/storage(?:-options|(?:\/configuration|\/[^/]+\/[^/]+)?)$/, 'cluster'],
  [/^\/proxmox\/storage-mounts\/[^/]+$/, 'cluster'],
  [/^\/users$/, 'users'], [/^\/audit$/, 'audit'], [/^\/settings$/, 'settings']
];
const writes = [
  ['POST', /^\/proxmox\/vm$/, 'vm.create'], ['POST', /^\/(?:proxmox\/ct|docker\/container)$/, 'containers.create'],
  ['POST', /^\/proxmox\/storage$/, 'cluster.create'], ['PUT', /^\/proxmox\/storage\/[^/]+\/enabled$/, 'cluster.edit'],
  ['POST', /^\/proxmox\/node\/[^/]+\/(?:power\/[^/]+|service\/[^/]+\/[^/]+)$/, 'cluster.manage'],
  ['POST', /^\/(?:proxmox\/network\/[^/]+|network\/firewall\/[^/]+\/rules)$/, 'network.create'],
  ['PUT', /^\/(?:network\/dns\/[^/]+|network\/firewall\/[^/]+\/rules\/[^/]+|proxmox\/network\/[^/]+\/[^/]+)$/, 'network.edit'],
  ['PUT', /^\/proxmox\/network\/[^/]+$/, 'network.manage'],
  ['POST', /^\/docker\/network$/, 'network.create'], ['DELETE', /^\/docker\/network\/[^/]+$/, 'network.delete'],
  ['POST', /^\/(?:backups|schedules)$/, 'backups.create'],
  ['POST', /^\/(?:retention|schedules\/[^/]+\/toggle)$/, 'backups.edit'],
  ['DELETE', /^\/schedules\/[^/]+$/, 'backups.delete'], ['POST', /^\/retention\/run$/, 'backups.delete'],
  ['POST', /^\/(?:proxmox\/backup|backups\/[^/]+\/run)$/, 'backups.manage'],
  ['POST', /^\/users$/, 'users.create'], ['POST', /^\/users\/[^/]+\/toggle$/, 'users.manage'],
  ['PUT', /^\/settings$/, 'settings.edit']
];
// Unclassified routes, interactive shells and cross-area reports must never
// provide an alternate way around a narrowed account's permissions.
export function permits(selection, method, url, body = {}, sub) {
  if (selection == null) return true;
  const path = url.split('?')[0].replace(/\/+$/, '');
  const has = key => selection.includes(key);
  if (/^\/account\//.test(path) || path === '/auth/me') return true; // Existing routes are self-service.
  if (method === 'GET' || method === 'HEAD') {
    if (path === '/cluster-profiles' || path === '/product/preferences') return true;
    if (path === '/proxmox') return ['cluster','vm','containers'].some(group => has(group + '.view'));
    if (/^\/proxmox\/create-options\/[^/]+$/.test(path)) return has('vm.create') || has('containers.create');
    if (/^\/users\/[^/]+\/(permissions|permission-history)$/.test(path)) return path.split('/')[2] === sub || has('users.view');
    if (['/dashboard','/monitoring','/monitoring/performance','/storage/performance','/discovery','/proxmox/topology-connections','/tasks','/proxmox/tasks'].includes(path))
      return ['cluster','vm','containers','network','backups'].every(area=>has(area+'.view'));
    if (/^\/docker(?:\/(?:hosts|events|container\/[^/]+\/logs|image\/[^/]+|volume\/[^/]+|volumes\/usage|network\/[^/]+))?$/.test(path))
      return has('containers.view') && has('network.view');
    if(path === '/monitoring/temperatures')return has('cluster.view');
    if (path === '/storage/datasets/guest-layout') return has('vm.edit');
    const rule = reads.find(([pattern]) => pattern.test(path));
    return !!rule && has(rule[1] + '.view');
  }
  if(method==='PUT'&&path==='/monitoring/temperatures')return has('settings.edit');
  if (method === 'PUT' && path === '/product/preferences') return true;
  if (method === 'POST' && ['/product/visit','/product/feedback'].includes(path)) return true;
  if (method === 'POST' && (path === '/ssh/fingerprint' && body?.action === true || path === '/ssh/connect' && body?.mode === 'authorize')) {
    return typeof body.path === 'string' && !body.path.startsWith('/ssh') &&
      permits(selection, String(body.method).toUpperCase(), body.path, body.body, sub);
  }
  if (method === 'POST' && /^\/restore\/[^/]+\/run$/.test(path))
    return has('backups.manage') && has('vm.create') && has('containers.create');
  const docker = /^\/actions\/docker\/container\/[^/]+\/(start|stop|restart|pause|unpause|remove)$/.exec(path);
  if (method === 'POST' && docker) return has('containers.' + (docker[1]==='remove' ? 'delete' : 'manage'));
  const guest = /^\/actions\/proxmox\/(vm|lxc)\/[^/]+\/(start|stop|shutdown|reboot|reset|suspend|resume|snapshot|clone|delete|delete-snapshot)$/.exec(path);
  if (method === 'POST' && guest) {
    const action = ['snapshot','clone'].includes(guest[2]) ? 'create' : guest[2].startsWith('delete') ? 'delete' : 'manage';
    return has((guest[1] === 'vm' ? 'vm' : 'containers') + '.' + action);
  }
  if (method === 'PUT' && path === '/storage/datasets/guest-expand') {
    return has('vm.edit');
  }
  if (method === 'POST' && /^\/storage\/snapshots\/guest\/(?:create|delete|rollback)$/.test(path)) {
    const group = body?.kind === 'qemu' ? 'vm' : body?.kind === 'lxc' ? 'containers' : null;
    const operation = path.split('/').pop();
    return !!group && has(group + '.' + (operation === 'rollback' ? 'edit' : operation));
  }
  const rule = writes.find(([verb,pattern]) => verb === method && pattern.test(path));
  return !!rule && has(rule[2]);
}
export function permittedInventory(data, keys) {
  if (keys == null) return data;
  const visible = {refreshing: data.refreshing, resourceInventoryComplete: data.resourceInventoryComplete,
    nodes: [], vms: [], lxc: [], storage: [], services: [], errors: []};
  if (keys.includes('cluster.view')) Object.assign(visible, {nodes: data.nodes, storage: data.storage, cluster: data.cluster});
  if (keys.includes('vm.view')) visible.vms = data.vms;
  if (keys.includes('containers.view')) visible.lxc = data.lxc;
  return visible;
}
