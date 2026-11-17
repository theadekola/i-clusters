// The monitor may retain an older service reading during a new collection.
export const maximumMeasurementAge = 120_000;

export function freshMeasurement(time, now = Date.now()) {
  const age = now - Date.parse(time);
  return Number.isFinite(age) && age >= 0 && age < maximumMeasurementAge;
}

const guestKinds = /^(?:(running|stopped|paused|suspended|unknown) )?(vms?|virtual machines?|cts?|lxc containers?|lxcs?|proxmox containers?|containers?)(?: (.*))?$/;
const countStart = /^(?:how many|what is the (?:number|count) of) /;
const countTail = /^(?:|are there|are in (?:the |my )?cluster|in (?:the |my )?cluster|(?:does|do|did) (?:the |my )?clusters? have)$/;
const unknownPower = 'unknown';

function countRequest(question) {
  if (!countStart.test(question)) return null;
  const match = guestKinds.exec(question.replace(countStart, ''));
  if (!match) return null;
  let [, state, kind, rest = ''] = match;
  let node;
  const scope = /(?:^| )(?:on|in) (?:the )?(?:node )?([a-z0-9_.-]+)$/.exec(rest);
  if (scope && scope[1] !== 'cluster') {
    node = scope[1];
    rest = rest.slice(0, scope.index).trim();
  }
  const stateMatch = /^(?:are |are currently |currently )?(running|stopped|paused|suspended|unknown)$/.exec(rest);
  if (stateMatch && !state) {
    state = stateMatch[1];
    rest = '';
  }
  if (!countTail.test(rest)) return null;
  return {state, node, vm: /^(?:vm|virtual)/.test(kind), ambiguous: /^containers?$/.test(kind)};
}

function guestCount(p, request) {
  const {state, node, vm} = request;
  const group = vm ? p.vms : p.containers;
  const name = vm ? 'virtual machine' : 'LXC container';
  if (!p.complete || !group || group.items.length !== group.total)
    return 'The Proxmox inventory is incomplete. I cannot verify the requested count.';
  const selected = node && p.nodes?.items.find(row => row.name?.toLowerCase() === node);
  if (node && !selected) return 'The requested node was not reported in this cluster.';
  const rows = group.items.filter(row => !node || row.node?.toLowerCase() === node);
  const guests = rows.filter(row => !row.template);
  const power = row => row.nodeAvailable === false ? unknownPower : row.powerStatus || row.status || unknownPower;
  const count = state ? guests.filter(row => power(row) === state).length : guests.length;
  const scope = selected ? selected.name : 'The cluster';
  const fragments = [`${scope} has ${count} ${state ? state + ' ' : ''}${name}${count === 1 ? '' : 's'}.`];
  const unknown = guests.filter(row => power(row) === unknownPower).length;
  if (state && state !== unknownPower && unknown) fragments.push(`Power state unknown for ${unknown} more.`);
  const templates = rows.length - guests.length;
  if (templates) fragments.push(`Templates excluded: ${templates}.`);
  return fragments.join(' ');
}

function addressRequest(question) {
  // Use the entire subject. A guest name, unknown node or second requested node
  // must never silently turn into a reply about whichever name matched first.
  const match = /^(?:(?:what|which) (?:is |are )?(?:the )?|show (?:me )?(?:the )?)?(?:ip(?: addresses| address|s)? (?:is |of |for )?(.+)|(.+?)(?:'s)? ip(?: address(?:es)?)?)$/.exec(question);
  if (!match) return null;
  const raw = match[1] || match[2];
  const kind = /^(nodes?|vms?|guests?|cts?|lxc) /.exec(raw)?.[1];
  const subject = kind ? raw.slice(kind.length + 1) : raw;
  if (!/^[\w.-]+(?:(?:\s+and\s+|,\s*)[\w.-]+)*$/.test(subject)) return null;
  return {kind, names:subject.split(/\s+and\s+|,\s*/)};
}

function matchingGuests(p, name, kind) {
  const vms = /^(?:cts?|lxc)$/.test(kind) ? [] : p.vms?.items || [];
  const cts = /^vms?$/.test(kind) ? [] : p.containers?.items || [];
  return [...vms, ...cts].filter(row => row.name?.toLowerCase() === name || String(row.id ?? row.vmid) === name);
}

function addressAnswer(p, name, kind) {
  const node = !kind || /^nodes?$/.test(kind) ? p.nodes?.items.find(row => row.name?.toLowerCase() === name) : null;
  const guests = /^nodes?$/.test(kind) ? [] : matchingGuests(p, name, kind);
  if (guests.length + Number(Boolean(node)) > 1) return 'More than one resource matches. Specify a node name or a guest VMID.';
  if (node) return node.ip ? `${node.name} has IP address ${node.ip}.` : `Proxmox has not reported an IP address for ${node.name}.`;
  const guest = guests[0];
  if (!guest) return `No matching resource was reported for ${name}.`;
  if (guest.addressStatus !== 'reported' || !freshMeasurement(guest.addressSampledAt) || !guest.addresses?.length)
    return `No current guest IP address was reported for ${guest.name}.`;
  return `${guest.name}: ${guest.addresses.join(', ')} (address reading ${guest.addressSampledAt}).`;
}

export function inventoryAnswer(inventory, message) {
  const question = message.toLowerCase().trim().replace(/[?!.]+$/, '').trim().replace(/\s+/g, ' ');
  const count = countRequest(question);
  if (count?.ambiguous) return 'Do you mean Proxmox LXC containers or Docker containers?';
  const addresses = addressRequest(question);
  const guestState = /^is (?:(vm|ct|lxc|guest) )?([\w.-]+) (running|stopped|suspended|paused)$/.exec(question);
  const health = /^(?:check|summarize|review|show)(?: my| the)? cluster health$/.test(question);
  if (!count && !addresses && !guestState && !health) return null;
  const p = inventory.proxmox;
  if (!p || !freshMeasurement(p.measuredAt)) return 'Current Proxmox measurements are unavailable. Check the Proxmox connection and sample time.';
  const dated = text => `${text} Measured ${p.measuredAt}.`;
  if (count) return dated(guestCount(p, count));
  if (addresses) return dated(addresses.names.map(name => addressAnswer(p, name, addresses.kind)).join(' '));
  if (guestState) {
    const matches = matchingGuests(p, guestState[2], guestState[1]);
    if (matches.length !== 1) return dated('A unique guest could not be identified. Check its VMID and selected cluster.');
    const guest = matches[0];
    const power = guest.nodeAvailable === false ? unknownPower : guest.powerStatus || guest.status || unknownPower;
    return dated(`${guest.name} on ${guest.node} has power state: ${power}.`);
  }
  if (!p.complete || !p.nodes?.total || p.nodes.total !== p.nodes.items.length)
    return dated('The Proxmox node inventory is incomplete. Current cluster health could not be verified.');
  const online = p.nodes.items.filter(n => n.status === 'online').length;
  const alerts = inventory.alerts?.items || [];
  const priority = ['critical', 'warning', 'info'].map(level => alerts.find(a => a.severity === level)).find(Boolean);
  return dated([`${online} of ${p.nodes.total} Proxmox nodes are online.`,
    inventory.alerts && `Open alerts: ${inventory.alerts.total}.`, priority && `${priority.severity}: ${priority.title}${priority.source ? ' (' + priority.source + ')' : ''}.`
  ].filter(Boolean).join(' '));
}

export function recentActivityAnswer(message, activities) {
  if (!/^(?:(?:show|list|summarize)(?: me)?(?: the)? |what (?:are|were) (?:the )?)?(?:most )?recent (?:shared )?activit(?:y|ies)[?.!]*$|^what (?:shared )?activities happened (?:most )?recently[?.!]*$/i.test(message.trim())) return null;
  if (!activities.length) return 'No shared activities have been recorded for this cluster.';
  return activities.map(row => `${row.time} · ${row.title} (${row.status})`).join('\n');
}
