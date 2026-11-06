#!/usr/bin/env python3
"""i-Clusters outbound connector for Proxmox nodes or standalone Docker hosts."""
import ssl
import hashlib,argparse,sys,base64,json,os,re,shlex,socket,subprocess,threading,time,urllib.request,queue,pathlib,uuid,ipaddress

# Compatibility reads keep existing paired connectors usable through the rename.
def connector_path(root,relative):
    canonical=root/relative
    legacy=root/relative.replace('iclusters','homecloud')
    return canonical if canonical.exists() or not legacy.exists() else legacy

def connector_unit(root):
    return 'iclusters-node-agent.service' if (root/'etc/iclusters-node-agent.json').exists() or not (root/'etc/homecloud-node-agent.json').exists() else 'homecloud-node-agent.service'

VERSION=10
REVISION=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
HOSTS=[]
RESCAN=threading.Event()
LOCK=threading.Lock()
PULL_PROGRESS={}
PULL_PROGRESS_LOCK=threading.Lock()
def run(args,timeout=320,input_data=None):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout,input=input_data)
 if p.returncode: raise RuntimeError((p.stderr or p.stdout or 'Command failed')[-400:])
 return p.stdout

def guest_run(identity,script,timeout=320):
 if not re.fullmatch(r'node|(?:lxc|qemu)/[0-9]+',identity):raise RuntimeError('Invalid guest identity')
 if len(script.encode())>1000000:raise RuntimeError('Guest request too large')
 if globals().get('CONFIG',{}).get('kind')=='docker' and identity!='node':raise RuntimeError('Standalone connector cannot access Proxmox guests')
 if identity=='node':return run(['/bin/sh','-c',script],timeout=timeout)
 kind,vmid=identity.split('/')
 if kind=='lxc':return run(['pct','exec',vmid,'--','/bin/sh','-c',script],timeout=timeout)
 result=json.loads(run(['qm','guest','exec',vmid,'--synchronous','1','--timeout',str(timeout-10),'--pass-stdin','1','--','/bin/sh'],input_data=script,timeout=timeout))
 if not result.get('exited') or result.get('exitcode')!=0 or result.get('out-truncated'):raise RuntimeError(result.get('err-data') or 'Guest command incomplete; verify running QEMU agent and guest curl')
 return result.get('out-data','')

def docker_request(host,path,method='GET',body='',timeout=300):
 if not re.match(r'^/(info|version|containers|images|networks|volumes|system|events|build|distribution)([/?]|$)',path) or '\n' in path:raise RuntimeError('Invalid Docker path')
 if method not in ('GET','POST','DELETE'):raise RuntimeError('Invalid Docker method')
 decoded=base64.b64decode(body,validate=True) if body else b''
 if len(decoded)>1024*1024:raise RuntimeError('Request too large')
 content='application/x-tar' if path.startswith('/build?') else 'application/json'
 command='curl --silent --show-error --max-time '+str(int(timeout))+' --unix-socket /var/run/docker.sock -X '+shlex.quote(method)+' -H '+shlex.quote('Content-Type: '+content)+' --write-out '+shlex.quote('\n__ICLUSTERS_STATUS__%{http_code}')+' '+shlex.quote('http://localhost'+path)
 if body:command="printf %s "+shlex.quote(body)+" | base64 -d | "+command+' --data-binary @-'
 # Encode binary Docker log frames before they pass through the guest-agent JSON channel.
 script='command -v curl >/dev/null || { echo "Guest curl is missing" >&2; exit 1; }; test -S /var/run/docker.sock || { echo "Docker socket unavailable; install or start Docker" >&2; exit 1; }; ('+command+') | base64'
 output=guest_run(host,script,timeout=max(11,timeout+10)).strip()
 try:
  data=base64.b64decode(output);payload,status=data.rsplit(b'\n__ICLUSTERS_STATUS__',1)
 except Exception:raise RuntimeError('Guest returned an invalid Docker response; check curl and Docker service')
 if status==b'000':raise RuntimeError('Docker socket is not responding; start Docker service')
 if len(payload)>1300000:raise RuntimeError('Response too large for node bridge')
 return {'status':int(status),'body':base64.b64encode(payload).decode()}

def docker_pull(host,path,timeout,report):
 # Keep the potentially huge NDJSON stream inside the guest, not in QGA stdout.
 # Only a bounded tail crosses the bridge; layer snapshots go out on heartbeats.
 directory='/tmp/iclusters-pull-'+uuid.uuid4().hex
 q=shlex.quote(directory)
 command='curl --silent --show-error --no-buffer --max-time '+str(int(timeout))+' --unix-socket /var/run/docker.sock -X POST --output '+q+'/stream --write-out "%{http_code}" '+shlex.quote('http://localhost'+path)+' >'+q+'/http 2>'+q+'/error; code=$?; printf "%s" "$code" >'+q+'/exit'
 launch='set -e; command -v curl >/dev/null; test -S /var/run/docker.sock; mkdir -m 700 '+q+'; nohup /bin/sh -c '+shlex.quote(command)+' </dev/null >/dev/null 2>&1 &'
 records={};last_error=None;deadline=time.monotonic()+timeout+5
 try:
  guest_run(host,launch,timeout=20)
  while time.monotonic()<deadline:
   snapshot=guest_run(host,'(cat '+q+'/exit 2>/dev/null || printf pending); printf "\\n"; cat '+q+'/http 2>/dev/null || true; printf "\\n"; tail -c 16384 '+q+'/stream 2>/dev/null || true',timeout=20)
   state,status,body=snapshot.split('\n',2)
   changed=False
   for line in body.splitlines():
    try:event=json.loads(line)
    except (ValueError,TypeError):continue
    if not isinstance(event,dict):continue
    if event.get('error') or event.get('errorDetail'):last_error={'error':'Docker registry rejected the pull. Check registry access and disk space.'}
    identity=event.get('id');phase=event.get('status')
    if not isinstance(identity,str) or len(identity)>128 or phase not in ('Pulling fs layer','Waiting','Downloading','Download complete','Extracting','Pull complete','Already exists'):continue
    detail=event.get('progressDetail') or {};detail=detail if isinstance(detail,dict) else {}
    safe={'id':identity,'status':phase,'progressDetail':{k:v for k,v in detail.items() if k in ('current','total') and isinstance(v,(int,float)) and not isinstance(v,bool) and 0<=v<=9007199254740991}}
    if identity not in records and len(records)>=256:continue
    if records.get(identity)!=safe:records[identity]=safe;changed=True
   if changed:report(list(records.values()))
   if state!='pending':
    if state=='28':raise RuntimeError('Image pull timed out on the Docker host')
    if state!='0':raise RuntimeError('Image pull failed on the Docker host; check registry networking and disk space')
    if not re.fullmatch(r'[1-5][0-9]{2}',status):raise RuntimeError('Invalid Docker pull HTTP status')
    payload=json.dumps(last_error or {'status':'Image pull completed'})
    return {'status':int(status),'body':base64.b64encode(payload.encode()).decode()}
   time.sleep(2)
  raise RuntimeError('Image pull timed out on the Docker host')
 finally:
  # curl has its own deadline. Remove only this attempt's generated directory.
  try:guest_run(host,'rm -rf -- '+q,timeout=20)
  except Exception:pass

def docker_stats(host,body,timeout=15):
 # One QEMU/pct round trip for up to sixteen independent, bounded local reads.
 ids=json.loads(base64.b64decode(body,validate=True))
 if not isinstance(ids,list) or not 1<=len(ids)<=16 or any(not isinstance(i,str) or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}',i) for i in ids):raise RuntimeError('Invalid container statistics request')
 ids=list(dict.fromkeys(ids));seconds=max(1,min(8,timeout-2));quoted=' '.join(shlex.quote(i) for i in ids)
 script='command -v curl >/dev/null && test -S /var/run/docker.sock || { echo "Docker socket or guest curl unavailable" >&2; exit 1; }; umask 077; work=$(mktemp -d) || exit 1; trap \'rm -rf "$work"\' EXIT HUP INT TERM; '
 script+='for id in '+quoted+'; do (code=$(curl --silent --show-error --max-time '+str(seconds)+' --max-filesize 32768 --unix-socket /var/run/docker.sock -o "$work/$id.body" -w "%{http_code}" "http://localhost/containers/$id/stats?stream=false&one-shot=true" 2>/dev/null) || code=000; printf "%s" "$code" > "$work/$id.code") & done; wait; '
 script+='for id in '+quoted+'; do printf "%s " "$id"; cat "$work/$id.code"; printf " "; base64 < "$work/$id.body" 2>/dev/null | tr -d "\n"; printf "\n"; done'
 output=guest_run(host,script,timeout=max(11,timeout+10))
 if len(output.encode())>1300000:raise RuntimeError('Statistics response exceeds bridge size limit')
 result={i:{'error':'Container statistics not reported'} for i in ids}
 for line in output.splitlines():
  fields=line.split(' ',2)
  if len(fields)!=3 or fields[0] not in result:continue
  identity,status,payload=fields
  if status!='200':result[identity]={'error':'Container statistics request timed out or Docker socket unavailable' if status=='000' else 'Docker HTTP '+status};continue
  try:
   data=json.loads(base64.b64decode(payload,validate=True))
   if not isinstance(data,dict) or not isinstance(data.get('cpu_stats'),dict) or not isinstance(data.get('memory_stats'),dict):raise ValueError('Invalid statistics')
   result[identity]={'stats':data}
  except (ValueError,TypeError):result[identity]={'error':'Docker returned invalid container statistics'}
 return {'status':200,'body':base64.b64encode(json.dumps(result,separators=(',',':')).encode()).decode()}

def setup_guest(identity):
 if not re.fullmatch(r'(?:lxc|qemu)/[0-9]+',identity):raise RuntimeError('Setup is allowed only inside guests')
 os_id=guest_run(identity,'. /etc/os-release; printf "%s" "$ID"',timeout=30).strip()
 if os_id not in ('debian','ubuntu'):raise RuntimeError('Automatic setup supports Debian and Ubuntu guests only')
 if identity.startswith('lxc/'):
  vmid=identity.split('/')[1];config=run(['pct','config',vmid],30)
  features=next((line.split(':',1)[1].strip() for line in config.splitlines() if line.startswith('features:')),'')
  parts=[part for part in features.split(',') if part and not part.startswith('nesting=')];parts.append('nesting=1')
  run(['pct','set',vmid,'--features',','.join(parts)],30)
 script=post(CONFIG,'setup-script',{})['script']
 try:guest_run(identity,script,timeout=900)
 except Exception as e:
  message=str(e)
  if identity.startswith('lxc/'):message+='; CT nesting was enabled. If Docker cannot start, restart this CT in Proxmox and retry.'
  raise RuntimeError(message)
 finally:RESCAN.set()
 return {'status':200,'body':base64.b64encode(json.dumps({'message':'Docker installed, started and verified. Discovery is refreshing.'}).encode()).decode()}

def scan():
 global HOSTS
 while True:
  failed_kinds=set()
  candidates=[('node',socket.gethostname())]
  for tool,kind in ([] if globals().get('CONFIG',{}).get('kind')=='docker' else [('qm','qemu'),('pct','lxc')]):
   try:
    for line in run([tool,'list'],30).splitlines()[1:]:
     fields=line.split()
     if len(fields)>2 and fields[0].isdigit():
      # qm: VMID NAME STATUS; pct: VMID STATUS LOCK NAME
      running=fields[2]=='running' if tool=='qm' else fields[1]=='running'
      if running:candidates.append((kind+'/'+fields[0],fields[1] if tool=='qm' else fields[-1]))
   except Exception as e:
    failed_kinds.add(kind);print('Guest list unavailable: '+str(e),flush=True)
  identities={identity for identity,name in candidates}
  with LOCK:
   reports={h['id']:dict(h) for h in HOSTS if h['id'] in identities or h['id'].split('/')[0] in failed_kinds}
   for identity,row in reports.items():
    if identity.split('/')[0] in failed_kinds:row.update(online=False,setup=False,status='guest_access_required',error='Proxmox guest list unavailable; check the paired node')
   HOSTS=list(reports.values())
  for identity,name in candidates:
   try:
    r=docker_request(identity,'/info',timeout=8)
    if r['status']!=200:raise RuntimeError('Docker Engine returned HTTP '+str(r['status']))
    info=json.loads(base64.b64decode(r['body']))
    if r['status']!=200 or not info.get('ServerVersion'):raise RuntimeError('Docker Engine not available')
    reports[identity]={'id':identity,'name':name,'online':True,'status':'connected','setup':False}
   except Exception as e:
    error=str(e)[:400];supported=False
    if identity!='node':
     try:supported=guest_run(identity,'. /etc/os-release; printf "%s" "$ID"',timeout=30).strip() in ('debian','ubuntu')
     except Exception:pass
    reports[identity]={'id':identity,'name':name,'online':False,'error':error,'setup':supported,'status':'setup_available' if supported else 'guest_access_required'}
   with LOCK:HOSTS=list(reports.values())
  RESCAN.wait(60);RESCAN.clear()

# Local read-only network collection is separate from guest Docker discovery.
NETWORK=None
NETWORK_SESSION=str(uuid.uuid4())
def collect_network(root='/sys/class/net',boot_path='/proc/sys/kernel/random/boot_id'):
 boot=NETWORK_SESSION
 try:boot=pathlib.Path(boot_path).read_text().strip()
 except OSError:pass
 entries=json.loads(run(['ip','-j','address','show'],timeout=3))
 if not isinstance(entries,list) or len(entries)>512:raise RuntimeError('Invalid interface inventory')
 rows=[]
 for entry in entries:
  name=entry.get('ifname','')
  if name in ('.','..') or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,15}',name):continue
  base=pathlib.Path(root)/name
  def read_int(path):
   try:return int((base/path).read_text().strip())
   except (OSError,ValueError):return None
  addresses=[]
  for address in entry.get('addr_info',[]):
   try:
    ip=ipaddress.ip_address(address['local']);prefix=address['prefixlen']
    if isinstance(prefix,int) and 0<=prefix<=(32 if ip.version==4 else 128):addresses.append(str(ip)+'/'+str(prefix))
   except (KeyError,ValueError,TypeError):pass
  speed=None;reason='unavailable'
  if not (base/'device').exists():reason='virtual'
  else:
   speed=read_int('speed')
   if speed is None or speed<=0:
    speed=None;reason='link-down' if entry.get('operstate') in ('DOWN','LOWERLAYERDOWN') else 'unsupported'
  rx=read_int('statistics/rx_bytes');tx=read_int('statistics/tx_bytes')
  rows.append({'name':name,'ifindex':entry.get('ifindex'),'mac':entry.get('address'),'addresses':addresses[:64],'speed':speed,'speedReason':reason,'rxBytes':str(rx) if rx is not None and rx>=0 else None,'txBytes':str(tx) if tx is not None and tx>=0 else None})
 return {'status':'ok','bootId':boot,'uptime':time.monotonic(),'interfaces':rows}
DISK=None
def collect_disk(diskstats='/proc/diskstats',sys_root='/sys/class/block',boot_path='/proc/sys/kernel/random/boot_id'):
 devices=[]
 for line in pathlib.Path(diskstats).read_text().splitlines():
  fields=line.split()
  if len(fields)<14:continue
  name=fields[2];base=pathlib.Path(sys_root)/name
  # Only leaf whole devices backed by hardware, exclude partitions and stacks.
  if (base/'partition').exists() or not (base/'device').exists():continue
  if (base/'slaves').exists() and any((base/'slaves').iterdir()):continue
  if not fields[5].isdigit() or not fields[9].isdigit():continue
  devices.append({'id':fields[0]+':'+fields[1],'read':fields[5],'write':fields[9]})
 return {'status':'ok','bootId':pathlib.Path(boot_path).read_text().strip(),'uptime':time.monotonic(),'devices':devices[:512]}
def network_scan():
 global NETWORK,DISK
 while True:
  try:report=collect_network()
  except Exception:report={'status':'error'}
  try:disk=collect_disk()
  except Exception:disk={'status':'error'}
  with LOCK:NETWORK=report;DISK=disk
  time.sleep(5)

OPERATIONS=None
def command_json(args,timeout=5):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 return json.loads(p.stdout)
def collect_operations():
 report={'sampledAt':time.time(),'disks':[],'ups':[],'errors':[]}
 try:
  devices=command_json(['smartctl','--scan','--json']).get('devices',[])[:16]
  for device in devices:
   name=device.get('name','')
   if not re.fullmatch(r'/dev/[A-Za-z0-9_./-]{1,100}',name):continue
   try:
    data=command_json(['smartctl','-H','-n','standby','--json',name],3)
    report['disks'].append({'name':name,'healthy':data.get('smart_status',{}).get('passed')})
   except Exception:report['disks'].append({'name':name,'healthy':None})
 except Exception:report['errors'].append('Disk health unavailable. Install smartmontools and check device support/permissions.')
 try:
  names=run(['upsc','-l','localhost'],timeout=3).splitlines()[:8]
  for name in names:
   if not re.fullmatch(r'[A-Za-z0-9_.-]{1,64}',name):continue
   try:
    values=dict(line.split(': ',1) for line in run(['upsc',name+'@localhost'],timeout=3).splitlines() if ': ' in line)
    report['ups'].append({'name':name,'status':values.get('ups.status',''),'charge':values.get('battery.charge'),'runtime':values.get('battery.runtime')})
   except Exception:report['errors'].append('UPS reading unavailable: '+name)
 except Exception:report['errors'].append('UPS unavailable. Configure a local Network UPS Tools server and upsc client.')
 return report
def operations_scan():
 global OPERATIONS
 while True:
  try:report=collect_operations()
  except Exception:report={'errors':['Operational measurements unavailable.']}
  with LOCK:OPERATIONS=report
  time.sleep(60)
def operations_job(job):
 if job.get('host')!='node':raise RuntimeError('Operational actions only run on the paired host')
 body=json.loads(base64.b64decode(job.get('body','') or 'e30='))
 operation=body.get('action')
 if operation=='network-check':
  checks=[]
  for host in ['ghcr.io','lscr.io','registry-1.docker.io']:
   started=time.monotonic()
   try:
    # Fixed HTTPS registry destinations; no arbitrary URL/port probing.
    output=run(['curl','--head','--silent','--output','/dev/null','--write-out','%{http_code} %{time_namelookup} %{time_connect} %{time_appconnect}','--connect-timeout','3','--max-time','5','https://'+host+'/v2/'],timeout=6)
    parts=output.strip().split();code=parts[0]
    checks.append({'name':host,'status':'reachable' if code in ('200','401','405') else 'failed','httpStatus':code,'dnsMilliseconds':round(float(parts[1])*1000),'connectMilliseconds':round(float(parts[2])*1000),'tlsMilliseconds':round(float(parts[3])*1000),'milliseconds':round((time.monotonic()-started)*1000)})
   except Exception:checks.append({'name':host,'status':'failed','message':'Check host DNS, outbound HTTPS, certificate trust and registry access.'})
  result={'checks':checks,'sampledAt':time.time()}
 elif operation=='install-tools':
  run(['apt-get','update'],timeout=120);run(['apt-get','install','-y','smartmontools','nut-client'],timeout=180)
  result={'message':'Monitoring tools installed. UPS readings require an existing local NUT server; no UPS shutdown policy was changed.'}
 else:raise RuntimeError('Unsupported operational action')
 RESCAN.set()
 return {'status':200,'body':base64.b64encode(json.dumps(result).encode()).decode()}

def post(config,path,body):
 request=urllib.request.Request(config['url']+'/api/node-agent/'+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+config.get('token','')})
 with urllib.request.urlopen(request,timeout=30,**({'context':ssl.create_default_context(cadata=config['ca'])} if config.get('ca') else {})) as response:return json.load(response)

def read_job(job):
 # Mutations, installations and streaming event reads keep their own serial lane.
 return job.get('operation','docker') in ('docker','stats') and job.get('method')=='GET' and job.get('path','').split('?')[0]!='/events'

def execute_job(job):
 if job.get('expiresAt',time.time()*1000+1)<=time.time()*1000:return {'id':job['id'],'error':'Request expired before execution'}
 try:
  if job.get('operation')=='operations':result=operations_job(job)
  elif job.get('operation')=='setup':result=setup_guest(job['host'])
  else:
   remaining=max(1,min(900 if job.get('progress') else 300,int((job.get('expiresAt',time.time()*1000+300000)-time.time()*1000)/1000)))
   if job.get('progress') and job.get('method')=='POST' and re.fullmatch(r'/images/create\?fromImage=[A-Za-z0-9%._~:-]+',job.get('path','')):
    def report(events):
     with PULL_PROGRESS_LOCK:PULL_PROGRESS[job['id']]={'id':job['id'],'events':events}
    result=docker_pull(job['host'],job['path'],remaining,report)
   else:result=docker_stats(job['host'],job['body'],timeout=remaining) if job.get('operation')=='stats' else docker_request(job['host'],job['path'],job['method'],job['body'],timeout=remaining)
 except Exception as e:result={'error':str(e)[:400]}
 return {'id':job['id'],**result}

def start_workers():
 reads,writes,completed,ready=queue.Queue(maxsize=32),queue.Queue(maxsize=16),queue.Queue(),threading.Event()
 def worker(pending):
  while True:
   job=pending.get()
   try:completed.put(execute_job(job));ready.set()
   finally:pending.task_done()
 for pending in [reads]*4+[writes]:threading.Thread(target=worker,args=(pending,),daemon=True).start()
 return reads,writes,completed,ready

# Automatic updates are fixed local file replacement, never arbitrary jobs/shell.
AUTO_UPDATE_ERROR=False
AUTO_UPDATE_STATE=connector_path(pathlib.Path('/'),'var/lib/iclusters-connector-update')
ROLLBACK_SOURCE=r'''import hashlib,json,os,pathlib,subprocess,sys,tempfile

# Compatibility reads keep existing paired connectors usable through the rename.
def connector_path(root,relative):
    canonical=root/relative
    legacy=root/relative.replace('iclusters','homecloud')
    return canonical if canonical.exists() or not legacy.exists() else legacy

def connector_unit(root):
    return 'iclusters-node-agent.service' if (root/'etc/iclusters-node-agent.json').exists() or not (root/'etc/homecloud-node-agent.json').exists() else 'homecloud-node-agent.service'

root=connector_path(pathlib.Path('/'),'var/lib/iclusters-connector-update')
try:
 state=json.loads((root/'pending.json').read_text())
 if state.get('nonce')!=sys.argv[1] or state.get('verified'):sys.exit(0)
 config=connector_path(pathlib.Path('/'),'etc/iclusters-node-agent.json')
 if hashlib.sha256(config.read_bytes()).hexdigest()!=state['configHash']:sys.exit(1)
 target=connector_path(pathlib.Path('/'),'usr/local/sbin/iclusters-node-agent.py');backup=root/'previous.py'
 source=backup.read_bytes()
 if hashlib.sha256(source).hexdigest()!=state['previousRevision'] or target.is_symlink():sys.exit(1)
 fd,name=tempfile.mkstemp(dir=target.parent,prefix='.iclusters-rollback-')
 with os.fdopen(fd,'wb') as file:file.write(source);file.flush();os.fsync(file.fileno())
 os.chmod(name,0o600);os.replace(name,target)
 descriptor=os.open(target.parent,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(descriptor)
 finally:os.close(descriptor)
 state['rolledBack']=True;(root/'pending.json').write_text(json.dumps(state))
 subprocess.run(['systemctl','restart',connector_unit(pathlib.Path('/'))],timeout=30,check=True)
except Exception:sys.exit(1)
'''

def atomic_connector_file(target,content):
 import tempfile
 fd,name=tempfile.mkstemp(dir=target.parent,prefix='.iclusters-update-')
 try:
  with os.fdopen(fd,'wb') as file:file.write(content);file.flush();os.fsync(file.fileno())
  os.chmod(name,0o600);os.replace(name,target)
  descriptor=os.open(target.parent,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(descriptor)
  finally:os.close(descriptor)
 finally:
  if os.path.exists(name):os.unlink(name)

def validate_connector_update(config,payload,nonce):
 import ast,hmac
 if not config.get('url','').startswith('https://') or payload.get('id')!=config.get('id') or payload.get('nonce')!=nonce:raise RuntimeError('Update identity mismatch')
 version=payload.get('version');expiry=payload.get('expiresAt')
 if type(version)!=int or version<VERSION or type(expiry)!=int or not time.time()*1000<expiry<=time.time()*1000+60000:raise RuntimeError('Invalid update version or expiry')
 if not re.fullmatch('[a-f0-9]{32}',nonce) or not re.fullmatch('[a-f0-9]{64}',payload.get('revision','')):raise RuntimeError('Invalid update manifest')
 message=json.dumps([payload['id'],version,payload['revision'],expiry,nonce],separators=(',',':')).encode()
 signature=hmac.new(hashlib.sha256(config['token'].encode()).digest(),message,hashlib.sha256).hexdigest()
 if not hmac.compare_digest(signature,payload.get('signature','')):raise RuntimeError('Update authentication failed')
 if len(payload.get('source',''))>1500000:raise RuntimeError('Update too large')
 source=base64.b64decode(payload['source'],validate=True)
 if hashlib.sha256(source).hexdigest()!=payload['revision']:raise RuntimeError('Update checksum mismatch')
 tree=ast.parse(source);compile(tree,'connector-update','exec')
 if not any(isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='VERSION' for t in n.targets) and isinstance(n.value,ast.Constant) and n.value.value==version for n in tree.body):raise RuntimeError('Update version mismatch')
 return source

def install_connector_update(config,payload,nonce,root=pathlib.Path('/'),exec_process=os.execv,run_process=subprocess.run):
 import fcntl
 source=validate_connector_update(config,payload,nonce)
 target=connector_path(root,'usr/local/sbin/iclusters-node-agent.py');config_path=connector_path(root,'etc/iclusters-node-agent.json')
 if os.geteuid()!=0 or pathlib.Path(__file__).resolve()!=target or target.is_symlink() or config_path.is_symlink():raise RuntimeError('Standard root connector installation required')
 original_config=config_path.read_bytes()
 if json.loads(original_config)!=config:raise RuntimeError('Pairing changed')
 root=connector_path(root,'var/lib/iclusters-connector-update')
 if root.is_symlink():raise RuntimeError('Invalid update directory')
 root.mkdir(mode=0o700,parents=True,exist_ok=True);root.chmod(0o700)
 with open(root.parents[2]/'run/iclusters-connector-update.lock','a') as lock:
  os.chmod(lock.name,0o600);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  previous=target.read_bytes()
  atomic_connector_file(root/'previous.py',previous)
  with LOCK:resume_hosts=list(HOSTS)
  state={'createdAt':time.time(),'hosts':resume_hosts,'nonce':nonce,'revision':payload['revision'],'configHash':hashlib.sha256(original_config).hexdigest(),'previousRevision':hashlib.sha256(previous).hexdigest(),'verified':False}
  atomic_connector_file(root/'pending.json',json.dumps(state).encode());atomic_connector_file(root/'rollback.py',ROLLBACK_SOURCE.encode())
  # Independent systemd timer survives a failed replacement process.
  try:
   run_process(['systemd-run','--quiet','--collect','--timer-property=AccuracySec=1s','--unit=iclusters-connector-rollback-'+nonce,'--on-active=60s','/usr/bin/python3',str(root/'rollback.py'),nonce],check=True,capture_output=True,timeout=10)
   if config_path.read_bytes()!=original_config:raise RuntimeError('Pairing changed')
   atomic_connector_file(target,source)
   exec_process(sys.executable,[sys.executable,str(target),'--config',str(config_path)])
  except Exception:
   atomic_connector_file(target,previous);state['verified']=True;atomic_connector_file(root/'pending.json',json.dumps(state).encode());raise

def verify_connector_update(config,nonce,config_path=connector_path(pathlib.Path('/'),'etc/iclusters-node-agent.json')):
 if not nonce or not (AUTO_UPDATE_STATE/'pending.json').exists():return
 state=json.loads((AUTO_UPDATE_STATE/'pending.json').read_text())
 if state.get('nonce')==nonce and state.get('revision')==REVISION and state.get('configHash')==hashlib.sha256(config_path.read_bytes()).hexdigest():
  state['verified']=True;atomic_connector_file(AUTO_UPDATE_STATE/'pending.json',json.dumps(state).encode())

def connector_update_receipt():
 try:
  state=json.loads((AUTO_UPDATE_STATE/'pending.json').read_text())
  if state.get('revision')==REVISION and not state.get('rolledBack'):
   return (False,state['nonce']) if state.get('verified') else (True,'')
 except Exception:pass
 return False,''

def poll_once(config,reads,writes,completed,ready):
 global AUTO_UPDATE_ERROR
 started=time.monotonic();ready.clear();results=[]
 # Drain BEFORE sending. Completed results wake the next poll instead of waiting
 # through an extra heartbeat. Restore results on transport failure.
 while len(results)<20:
  try:results.append(completed.get_nowait())
  except queue.Empty:break
 with LOCK:hosts=list(HOSTS);network=NETWORK;operations=OPERATIONS;disk=DISK
 with PULL_PROGRESS_LOCK:progress=list(PULL_PROGRESS.values())[:20];PULL_PROGRESS.clear()
 pending_update,receipt=connector_update_receipt()
 nonce=uuid.uuid4().hex
 idle=reads.unfinished_tasks==0 and writes.unfinished_tasks==0
 try:response=post(config,'poll',{'connectorUpdatePending':pending_update,'connectorUpdateReceipt':receipt,'updateReady':idle,'updateNonce':nonce,'connectorUpdateError':AUTO_UPDATE_ERROR,'progress':progress,'version':VERSION,'revision':REVISION,'hosts':hosts,'results':results,'operations':operations,'disk':disk,**({'network':network} if network else {})})
 except Exception:
  for result in results:completed.put(result)
  with PULL_PROGRESS_LOCK:
   for item in progress:PULL_PROGRESS.setdefault(item['id'],item)
  ready.set();raise
 if response.get('connectorUpdateVerified'):
  try:verify_connector_update(config,response['connectorUpdateVerified'])
  except Exception:AUTO_UPDATE_ERROR=True
 if response.get('connectorUpdate') and idle and not response['jobs']:
  try:install_connector_update(config,response['connectorUpdate'],nonce)
  except Exception:AUTO_UPDATE_ERROR=True
 for job in response['jobs']:
  try:(reads if read_job(job) else writes).put_nowait(job)
  except queue.Full:completed.put({'id':job['id'],'error':'Connector is busy; retry after pending operations finish'});ready.set()
 # At most 100 polls/minute, within the server's authenticated agent budget.
 time.sleep(max(0,.6-(time.monotonic()-started)))
 if not completed.empty():return
 ready.wait(max(0,2-(time.monotonic()-started)))

def main():
 global CONFIG,HOSTS
 parser=argparse.ArgumentParser();parser.add_argument('--pair');parser.add_argument('--pair-stdin',action='store_true');parser.add_argument('--kind',choices=['proxmox','docker'],default='proxmox');parser.add_argument('--url');parser.add_argument('--config',default=str(connector_path(pathlib.Path('/'),'etc/iclusters-node-agent.json')));args=parser.parse_args()
 if args.pair_stdin:
  args.pair=sys.stdin.readline().strip()
  if not args.pair:raise SystemExit('Pairing code is required')
 if args.pair:
  if os.path.exists(args.config):raise SystemExit('Connector already configured. Revoke and remove the old connector before pairing again.')
  if not args.url or not args.url.startswith('https://'):raise SystemExit('i-Clusters HTTPS URL is required')
  config={'url':args.url.rstrip('/')};config.update(post(config,'pair',{'code':args.pair,'name':socket.gethostname(),'kind':args.kind}))
  fd=os.open(args.config,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,'w') as f:json.dump(config,f)
  os.chmod(args.config,0o600);return
 with open(args.config) as f:config=json.load(f)
 CONFIG=config
 try:
  pending=json.loads((AUTO_UPDATE_STATE/'pending.json').read_text())
  if pending.get('revision')==REVISION and not pending.get('rolledBack') and 0<=time.time()-pending.get('createdAt',0)<120 and pending.get('configHash')==hashlib.sha256(pathlib.Path(args.config).read_bytes()).hexdigest():HOSTS=pending.get('hosts',[])[:500]
 except Exception:pass
 threading.Thread(target=scan,daemon=True).start();threading.Thread(target=network_scan,daemon=True).start();threading.Thread(target=operations_scan,daemon=True).start()
 reads,writes,completed,ready=start_workers()
 while True:
  try:poll_once(config,reads,writes,completed,ready)
  except Exception as e:print('Node agent connection unavailable: '+str(e),flush=True);time.sleep(2)
if __name__=='__main__':main()
