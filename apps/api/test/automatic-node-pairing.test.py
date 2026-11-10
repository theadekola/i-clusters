import importlib.util,pathlib,tempfile,json,hashlib,zlib,base64,types,stat
path=pathlib.Path(__file__).resolve().parents[1]/'src/agent-assets/pair-node-ssh.py'
spec=importlib.util.spec_from_file_location('pairing_bootstrap',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
module.os.geteuid=lambda:0
source=b'VERSION=9\nprint("fixture")\n'
payload={'mode':'install','node':'node01','url':'https://controller.test:6002','ca':'','id':'node-id','token':'secret-node-token','kind':'proxmox','source':base64.b64encode(zlib.compress(source)).decode(),'revision':hashlib.sha256(source).hexdigest()}
def test(root,body=payload,fail=False):
 calls=[]
 def run(command,**kwargs):
  calls.append(command);return types.SimpleNamespace(returncode=1 if fail and command[1:]==['enable','--now','iclusters-node-agent.service'] else 0)
 def check(url,context): assert context.check_hostname and context.verify_mode==2
 return module.execute(body,root=root,run=run,hostname=lambda:'node01',which=lambda c:'/usr/bin/'+c,check_url=check),calls
with tempfile.TemporaryDirectory() as temp:
 root=pathlib.Path(temp)
 try: test(root,{**payload,'node':'wrong'})
 except RuntimeError as e: assert str(e)=='wrong-node'
 else: raise AssertionError('wrong node accepted')
 assert not (root/'etc').exists()
 result,calls=test(root,{**payload,'mode':'probe'});assert result['ready'] and not (root/'etc').exists()
 result,calls=test(root);assert result['installed'];config=root/'etc/iclusters-node-agent.json';assert json.loads(config.read_text())['token']=='secret-node-token';assert stat.S_IMODE(config.stat().st_mode)==0o600;assert (root/'usr/local/sbin/iclusters-node-agent.py').read_bytes()==source
 assert all(c[0]=='systemctl' for c in calls)
 try: test(root)
 except RuntimeError as e: assert str(e)=='already-installed'
 else: raise AssertionError('overwrote existing connector')
with tempfile.TemporaryDirectory() as temp:
 root=pathlib.Path(temp)
 try: test(root,fail=True)
 except RuntimeError as e: assert str(e)=='service-failed'
 else: raise AssertionError('failed service accepted')
 assert not (root/'etc/iclusters-node-agent.json').exists();assert not (root/'usr/local/sbin/iclusters-node-agent.py').exists()
print('Remote bootstrap fixture passed')
with tempfile.TemporaryDirectory() as temp:
 root=pathlib.Path(temp);dmi=root/'sys/class/dmi/id';dmi.mkdir(parents=True);(dmi/'product_uuid').write_text('guest-uuid')
 docker={**payload,'kind':'docker','node':'node01:qemu/100','identity':{'uuid':'guest-uuid'}}
 result,calls=test(root,docker);assert result['installed'];assert any(c[0]=='docker' for c in calls);assert json.loads((root/'etc/iclusters-node-agent.json').read_text())['kind']=='docker'
with tempfile.TemporaryDirectory() as temp:
 try:test(pathlib.Path(temp),{**payload,'kind':'docker','identity':{'uuid':'wrong'}})
 except RuntimeError as e:assert str(e)=='wrong-guest'
 else:raise AssertionError('Wrong Docker guest accepted')

import io
for prefix in ['', 'sudo-password\n']:
    assert module.read_payload(io.StringIO(prefix+'ICLUSTERS_PAIRING_V1\n'+json.dumps({'mode':'probe'})))=={'mode':'probe'}
try: module.read_payload(io.StringIO('bad\nnot-a-marker\n{}'))
except RuntimeError as e: assert str(e)=='invalid-payload'
else: raise AssertionError('Invalid framing accepted')

with tempfile.TemporaryDirectory() as temp:
 root=pathlib.Path(temp)
 dmi=root/'sys/class/dmi/id';dmi.mkdir(parents=True);(dmi/'product_uuid').write_text('guest-uuid')
 guest={**payload,'mode':'probe','kind':'docker','identity':{'uuid':'guest-uuid'}}
 def timeout(*args,**kwargs): raise module.subprocess.TimeoutExpired('docker info',20)
 for expected,available,run in [
     ('docker-missing',False,lambda *args,**kwargs: (_ for _ in ()).throw(AssertionError('ran a missing CLI'))),
     ('docker-unavailable',True,lambda *args,**kwargs: types.SimpleNamespace(returncode=1)),
     ('docker-unavailable',True,timeout)]:
  try: module.execute(guest,root=root,which=lambda _:available,run=run)
  except RuntimeError as error: assert str(error)==expected
  else: raise AssertionError('Ineligible guest passed Docker preflight')
  assert not (root/'etc').exists()

with tempfile.TemporaryDirectory() as temp:
 root=pathlib.Path(temp)
 (root/'etc').mkdir()
 (root/'etc/os-release').write_text('ID=ubuntu\n')
 calls=[]
 def run(command,**kwargs):
  calls.append(command)
  return types.SimpleNamespace(returncode=0)
 external={**payload,'node':'standalone:lab.example','kind':'docker','identity':{'standalone':True},'installDocker':True}
 options=dict(root=root,run=run,which=lambda name:name!='docker',check_url=lambda *_:None,hostname=lambda:'lab')
 assert module.execute({**external,'mode':'probe'},**options)['ready'] and not calls
 assert module.execute(external,**options)['installed']
 assert ['apt-get','install','--no-remove','-y','docker.io'] in calls
 assert calls.index(['systemctl','start','docker'])<calls.index(['docker','info'])
