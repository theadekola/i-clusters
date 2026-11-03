"""Fixed guest-agent operation: inspect/grow a single-disk Linux root filesystem.
No shell, formatting, shrinking, deletion, package installation or supplied commands.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys


def run(args, allow_nochange=False):
    executable = shutil.which(args[0])
    if not executable:
        raise ValueError('Missing guest tool: ' + args[0])
    result = subprocess.run([executable] + args[1:], capture_output=True, text=True, timeout=90, env={**os.environ, 'LC_ALL': 'C'})
    if result.returncode and not (allow_nochange and result.returncode == 1 and 'NOCHANGE:' in result.stdout):
        raise ValueError(args[0] + ' failed: ' + (result.stderr or result.stdout)[-1500:])
    return result.stdout


def rows(command, section):
    try:
        report = json.loads(run(command))
    except json.JSONDecodeError as error:
        raise ValueError(command[0] + ' returned an invalid JSON storage report') from error
    reports = report.get('report') if isinstance(report, dict) else None
    if not isinstance(reports, list):
        raise ValueError(command[0] + ' did not return the expected ' + section + ' storage report')
    matches = [entry[section] for entry in reports if isinstance(entry, dict) and section in entry]
    if len(matches) != 1 or not isinstance(matches[0], list) or any(not isinstance(row, dict) for row in matches[0]):
        raise ValueError(command[0] + ' did not return the expected ' + section + ' storage report; no allocation was attempted by this inspection')
    return matches[0]


def layout():
    root = json.loads(run(['findmnt', '-J', '-o', 'SOURCE,FSTYPE,OPTIONS', '/']))['filesystems'][0]
    if root['fstype'] not in ('ext4', 'xfs') or 'rw' not in root['options'].split(','):
        raise ValueError('Automatic expansion requires a writable ext4 or XFS root filesystem')
    source = os.path.realpath(root['source'])
    blocks = json.loads(run(['lsblk', '-J', '-b', '-p', '-o', 'NAME,TYPE,SIZE,PKNAME,UUID']))['blockdevices']
    flat = {}
    def visit(items):
        for item in items:
            flat[os.path.realpath(item['name'])] = item
            visit(item.get('children', []))
    visit(blocks)
    disks = [b for b in flat.values() if b['type'] == 'disk']
    if len(disks) != 1:
        raise ValueError('Automatic expansion requires exactly one guest disk; use a reviewed guest-specific workflow for multiple disks')
    disk = disks[0]
    device = flat.get(source)
    if not device:
        raise ValueError('Cannot identify the root block device')
    if not device.get('uuid'):
        raise ValueError('Root filesystem UUID is required to bind the checked layout')
    lvm = None
    if device['type'] == 'lvm':
        lvs = rows(['lvs', '--reportformat', 'json', '--units', 'b', '--nosuffix', '-o', 'lv_path,lv_uuid,vg_name,lv_size,segtype', '--segments'], 'seg')
        matches = [lv for lv in lvs if os.path.realpath(lv['lv_path']) == source]
        if not matches or any(lv['segtype'] != 'linear' for lv in matches) or len(set(lv['lv_uuid'] for lv in matches)) != 1:
            raise ValueError('Only a single linear root logical volume is supported')
        lv = matches[0]
        if len(set(v['lv_uuid'] for v in lvs if v['vg_name'] == lv['vg_name'])) != 1:
            raise ValueError('Volume groups with multiple logical volumes need an explicit allocation plan')
        pvs = rows(['pvs', '--reportformat', 'json', '--units', 'b', '--nosuffix', '-o', 'pv_name,pv_uuid,vg_name,pv_size,pv_free'], 'pv')
        matches = [p for p in pvs if p['vg_name'] == lv['vg_name']]
        if len(matches) != 1:
            raise ValueError('Only a single physical volume in the root volume group is supported')
        pv = matches[0]
        device = flat.get(os.path.realpath(pv['pv_name']))
        if not device:
            raise ValueError('Cannot identify the LVM physical volume')
        lvm = {'lv': lv, 'pv': pv}
    if device['type'] not in ('part', 'disk'):
        raise ValueError('Encrypted, RAID, thin and other layered layouts require a guest-specific workflow')
    partition = None
    if device['type'] == 'part':
        if os.path.realpath(device.get('pkname') or '') != os.path.realpath(disk['name']):
            raise ValueError('Root partition is not on the single guest disk')
        kname = os.path.basename(os.path.realpath(device['name']))
        with open('/sys/class/block/' + kname + '/partition') as f:
            partition = int(f.read())
        with open('/sys/class/block/' + kname + '/start') as f:
            start = int(f.read())
        for other in flat.values():
            if other['type'] == 'part' and other['name'] != device['name']:
                with open('/sys/class/block/' + os.path.basename(os.path.realpath(other['name'])) + '/start') as f:
                    if int(f.read()) > start:
                        raise ValueError('The root partition must be the last partition on the disk')
    elif any(child['type'] == 'part' for child in device.get('children', [])):
        raise ValueError('A whole-disk root filesystem cannot have child partitions')
    elif os.path.realpath(device['name']) != os.path.realpath(disk['name']):
        raise ValueError('Root device does not match the guest disk')
    tools = (['growpart'] if partition else []) + (['pvresize', 'lvextend'] if lvm else []) + (['resize2fs'] if root['fstype'] == 'ext4' else ['xfs_growfs'])
    missing = [tool for tool in tools if not shutil.which(tool)]
    plan = {'source': source, 'filesystem': root['fstype'], 'uuid': flat[source].get('uuid'), 'disk': disk['name'], 'diskBytes': int(disk['size']), 'device': device['name'], 'deviceBytes': int(device['size']), 'partition': partition, 'lvm': lvm, 'missingTools': missing}
    plan['token'] = hashlib.sha256(json.dumps(plan, sort_keys=True).encode()).hexdigest()
    stats = os.statvfs('/')
    plan.update(capacityBytes=stats.f_blocks * stats.f_frsize, availableBytes=stats.f_bavail * stats.f_frsize, supported=not missing)
    return plan


def perform(mode, token=None):
    before = layout()
    if mode == 'inspect':
        return before
    if mode != 'expand' or token != before['token']:
        raise ValueError('Guest storage changed. Check usable space again before expanding')
    if not before['supported']:
        raise ValueError('Install the missing tools inside the guest first: ' + ', '.join(before['missingTools']))
    # An OS lock prevents duplicate expansions from separate browser sessions.
    import fcntl
    with open('/run/iclusters-root-expansion.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if layout()['token'] != token:
            raise ValueError('Guest storage changed. Check usable space again')
        stage = 'partition'
        try:
            if before['partition']:
                run(['growpart', before['disk'], str(before['partition'])], allow_nochange=True)
            if before['lvm']:
                stage = 'physical volume'
                run(['pvresize', before['lvm']['pv']['pv_name']])
                stage = 'logical volume'
                current = layout()
                if float(current['lvm']['pv']['pv_free']) > 0:
                    run(['lvextend', '-l', '+100%FREE', before['lvm']['lv']['lv_path']])
            stage = 'filesystem'
            run(['resize2fs', before['source']] if before['filesystem'] == 'ext4' else ['xfs_growfs', '/'])
            after = layout()
            if after['capacityBytes'] < before['capacityBytes']:
                raise ValueError('Filesystem capacity verification failed')
            return {'verified': True, 'changed': after['capacityBytes'] > before['capacityBytes'], 'before': before, 'after': after}
        except Exception as error:
            raise ValueError('Expansion stopped at ' + stage + '. Earlier steps may have completed. Recheck before retrying. ' + str(error)) from error


if __name__ == '__main__':
    try:
        result = perform(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    except Exception as error:
        result = {'supported': False, 'error': str(error)}
    print(json.dumps(result))
