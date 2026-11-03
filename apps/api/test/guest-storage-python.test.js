import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('guest expansion script validates layouts and stale plans before growing and reports partial failures',()=>{
 const code=String.raw`
import importlib.util, io, json, unittest, sys
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('guest_storage',sys.argv.pop())
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
class Checks(unittest.TestCase):
 def test_reject_stale_without_write(self):
  with patch.object(g,'layout',return_value={'token':'current','supported':True}),patch.object(g,'run') as run:
   with self.assertRaisesRegex(ValueError,'changed'):g.perform('expand','stale')
   run.assert_not_called()
 def test_missing_tools_without_write(self):
  with patch.object(g,'layout',return_value={'token':'current','supported':False,'missingTools':['growpart']}),patch.object(g,'run') as run:
   with self.assertRaisesRegex(ValueError,'growpart'):g.perform('expand','current')
   run.assert_not_called()
 def test_simple_lvm_full_expansion_and_verify(self):
  plan={'token':'current','supported':True,'partition':3,'disk':'/dev/sda','source':'/dev/dm-0','filesystem':'ext4','lvm':{'pv':{'pv_name':'/dev/sda3','pv_free':'100'},'lv':{'lv_path':'/dev/vg/root'}},'capacityBytes':100}
  after={**plan,'capacityBytes':200}
  with patch.object(g,'layout',side_effect=[plan,plan,plan,after]),patch.object(g,'run',return_value='') as run,patch('builtins.open',return_value=io.StringIO()),patch('fcntl.flock'):
   result=g.perform('expand','current')
   self.assertTrue(result['verified']);self.assertTrue(result['changed'])
   self.assertEqual([c.args[0] for c in run.call_args_list],[['growpart','/dev/sda','3'],['pvresize','/dev/sda3'],['lvextend','-l','+100%FREE','/dev/vg/root'],['resize2fs','/dev/dm-0']])
 def test_partial_failure_stops_before_filesystem(self):
  plan={'token':'current','supported':True,'partition':1,'disk':'/dev/sda','lvm':None,'capacityBytes':100}
  with patch.object(g,'layout',return_value=plan),patch.object(g,'run',side_effect=ValueError('disk busy')) as run,patch('builtins.open',return_value=io.StringIO()),patch('fcntl.flock'):
   with self.assertRaisesRegex(ValueError,'Earlier steps may have completed'):g.perform('expand','current')
   self.assertEqual(run.call_count,1)
 def inspect_fixture(self,kind='part',fstype='ext4',extra=False,whole_pv=False):
  root={'filesystems':[{'source':'/dev/sda1','fstype':fstype,'options':'rw,relatime'}]}
  blocks={'blockdevices':[{'name':'/dev/sda','type':'disk','size':200,'pkname':None,'uuid':None,'children':[{'name':'/dev/sda1','type':kind,'size':100,'pkname':'/dev/sda','uuid':'fs1'}]}]}
  if whole_pv:
   root['filesystems'][0]['source']='/dev/dm-0'
   blocks['blockdevices'][0]['children']=[{'name':'/dev/dm-0','type':'lvm','size':100,'pkname':'/dev/sda','uuid':'fs1'}]
  if extra:blocks['blockdevices'].append({'name':'/dev/sdb','type':'disk','size':200})
  def run(args,**kwargs):
   if args[0]=='lvs':return json.dumps({'report':[{'lv':[{'lv_path':'/dev/dm-0','lv_uuid':'lv1','vg_name':'vg','lv_size':'100','segtype':'linear'}]}]})
   if args[0]=='pvs':return json.dumps({'report':[{'pv':[{'pv_name':'/dev/sda','pv_uuid':'pv1','vg_name':'vg','pv_size':'200','pv_free':'100'}]}]})
   return json.dumps(root if args[0]=='findmnt' else blocks)
  with patch.object(g,'run',side_effect=run),patch.object(g.shutil,'which',return_value='/usr/bin/tool'),patch('builtins.open',side_effect=lambda path,*a:io.StringIO('1' if path.endswith('/partition') else '2048')):
   return g.layout()
 def test_unsupported_filesystems_layers_and_multiple_disks(self):
  for options in [{'fstype':'btrfs'},{'kind':'crypt'},{'extra':True}]:
   with self.assertRaises(ValueError):self.inspect_fixture(**options)
 def test_plan_distinguishes_capacity_from_available(self):
  result=self.inspect_fixture();self.assertEqual(result['diskBytes'],200);self.assertEqual(result['deviceBytes'],100);self.assertTrue(result['supported']);self.assertEqual(len(result['token']),64)
 def test_whole_disk_lvm_pv_is_not_mistaken_for_a_partitioned_raw_filesystem(self):
  result=self.inspect_fixture(whole_pv=True);self.assertTrue(result['supported']);self.assertIsNone(result['partition']);self.assertEqual(result['lvm']['pv']['pv_name'],'/dev/sda')
 def test_xfs_no_lvm_and_already_expanded(self):
  plan={'token':'current','supported':True,'partition':None,'lvm':None,'source':'/dev/sda','filesystem':'xfs','capacityBytes':100}
  with patch.object(g,'layout',return_value=plan),patch.object(g,'run',return_value='') as run,patch('builtins.open',return_value=io.StringIO()),patch('fcntl.flock'):
   result=g.perform('expand','current');self.assertFalse(result['changed']);self.assertEqual(run.call_args.args[0],['xfs_growfs','/'])
unittest.main()
`;
 const r=spawnSync('python3',['-c',code,fileURLToPath(new URL('../src/agent-assets/guest-storage.py',import.meta.url))],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
});
