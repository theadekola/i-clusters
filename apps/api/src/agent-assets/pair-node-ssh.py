"""Fixed SSH bootstrap, scoped to one verified Proxmox node. Input is never shell text."""
import urllib.error
import ast,base64,fcntl,hashlib,json,os,pathlib,shutil,socket,ssl,subprocess,sys,tempfile,urllib.request,urllib.parse,zlib

def execute(payload,root=pathlib.Path('/'),run=subprocess.run,hostname=socket.gethostname,which=shutil.which,check_url=None):
    if os.geteuid()!=0: raise RuntimeError('root-required')
    docker=payload.get('kind')=='docker'
    actual=hostname().split('.')[0]
    if docker:
        identity=payload.get('identity',{})
        uuid=(root/'sys/class/dmi/id/product_uuid').read_text().strip().lower() if (root/'sys/class/dmi/id/product_uuid').exists() else ''
        macs=[p.read_text().strip().lower() for p in (root/'sys/class/net').glob('*/address')]
        if identity.get('uuid'):
            if uuid!=identity['uuid'].lower(): raise RuntimeError('wrong-guest')
        elif identity.get('standalone') is True and payload['node'].startswith('standalone:'):
            pass  # Both phases share the same authenticated, pinned SSH session.
        elif not set(identity.get('macs',[])).intersection(macs): raise RuntimeError('wrong-guest')
    elif actual!=payload['node']: raise RuntimeError('wrong-node')
    docker_commands=[]
    if docker:
        allow_setup=payload.get('installDocker') is True
        if not which('docker'):
            if not allow_setup: raise RuntimeError('docker-missing')
            release=root/'etc/os-release'
            system=dict(line.split('=',1) for line in release.read_text().splitlines() if '=' in line) if release.exists() else {}
            if system.get('ID','').strip('"') not in ('debian','ubuntu') or not which('apt-get'): raise RuntimeError('docker-missing')
            docker_commands=[['apt-get','update'],['apt-get','install','--no-remove','-y','docker.io'],['systemctl','start','docker']]
        else:
            try:
                engine=run(['docker','info','--format','{{json .}}'],capture_output=True,timeout=20)
            except (OSError,subprocess.TimeoutExpired) as error:
                raise RuntimeError('docker-unavailable') from error
            if engine.returncode:
                if not allow_setup: raise RuntimeError('docker-unavailable')
                docker_commands=[['systemctl','start','docker']]
    if not all(which(command) for command in (['python3','systemctl'] if docker else ['qm','pct','python3','systemctl'])): raise RuntimeError('not-proxmox')
    url=urllib.parse.urlsplit(payload['url'])
    if url.scheme!='https' or not url.hostname or url.username or url.password or url.path not in ('','/') or url.query or url.fragment: raise RuntimeError('invalid-url')
    context=ssl.create_default_context(cadata=payload.get('ca') or None)
    if check_url: check_url(payload['url'],context)
    else:
        with urllib.request.urlopen(payload['url']+'/api/health',context=context,timeout=15) as response:
            if response.status!=200: raise RuntimeError('controller-unreachable')
    config=root/'etc/iclusters-node-agent.json';agent=root/'usr/local/sbin/iclusters-node-agent.py';unit=root/'etc/systemd/system/iclusters-node-agent.service'
    if any(p.exists() or p.is_symlink() for p in [config,agent,unit,root/'etc/homecloud-node-agent.json',root/'etc/systemd/system/homecloud-node-agent.service']): raise RuntimeError('already-installed')
    if payload['mode']=='probe': return {'ready':True,'hostname':actual}
    source=zlib.decompress(base64.b64decode(payload['source'],validate=True))
    if hashlib.sha256(source).hexdigest()!=payload['revision']: raise RuntimeError('source-mismatch')
    compile(ast.parse(source),str(agent),'exec')
    if not payload.get('id') or not payload.get('token'): raise RuntimeError('missing-pairing')
    text='''[Unit]
Description=i-Clusters Proxmox Docker bridge
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=/usr/bin/python3 /usr/local/sbin/iclusters-node-agent.py
Restart=always
RestartSec=10
UMask=0077
[Install]
WantedBy=multi-user.target
'''
    lock=root/'run/iclusters-pairing.lock';lock.parent.mkdir(parents=True,exist_ok=True)
    with open(lock,'a') as handle:
        os.chmod(lock,0o600);fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
        created=[]
        try:
            if docker_commands:
                for command in docker_commands:
                    if run(command,capture_output=True,timeout=180,env={**os.environ,'DEBIAN_FRONTEND':'noninteractive'}).returncode:
                        raise RuntimeError('docker-unavailable')
                if run(['docker','info'],capture_output=True,timeout=20).returncode: raise RuntimeError('docker-unavailable')
            for path,content,mode in [(agent,source,0o600),(config,json.dumps({k:payload[k] for k in ['url','id','token','kind','ca'] if k in payload}).encode(),0o600),(unit,text.encode(),0o644)]:
                path.parent.mkdir(parents=True,exist_ok=True)
                fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode);created.append(path)
                with os.fdopen(fd,'wb') as file: file.write(content);file.flush();os.fsync(file.fileno())
                os.chmod(path,mode)
            for command in [['systemctl','daemon-reload'],['systemctl','enable','--now','iclusters-node-agent.service']]:
                if run(command,capture_output=True,timeout=30).returncode: raise RuntimeError('service-failed')
            return {'installed':True}
        except Exception:
            if unit in created:
                try: run(['systemctl','disable','--now','iclusters-node-agent.service'],capture_output=True,timeout=30)
                except Exception: pass
            for path in reversed(created): path.unlink(missing_ok=True)
            try: run(['systemctl','daemon-reload'],capture_output=True,timeout=30)
            except Exception: pass
            raise

def read_payload(stream):
    # sudo may consume the password line, or leave it when NOPASSWD applies.
    # The fixed marker makes both cases unambiguous without treating input as code.
    line=stream.readline().rstrip('\r\n')
    if line!='ICLUSTERS_PAIRING_V1': line=stream.readline().rstrip('\r\n')
    if line!='ICLUSTERS_PAIRING_V1': raise RuntimeError('invalid-payload')
    return json.load(stream)

if __name__=='__main__':
    try: print(json.dumps(execute(read_payload(sys.stdin))))
    except Exception as error:
        reason=str(error)
        if isinstance(error,ssl.SSLError) or isinstance(getattr(error,'reason',None),ssl.SSLError): reason='controller-tls'
        elif isinstance(error,(urllib.error.URLError,TimeoutError,ConnectionError)): reason='controller-network'
        allowed=['controller-tls','controller-network','invalid-payload','wrong-guest','docker-missing','docker-unavailable','root-required','wrong-node','not-proxmox','invalid-url','already-installed','source-mismatch','missing-pairing','service-failed','controller-unreachable']
        print(json.dumps({'error':reason if reason in allowed else 'bootstrap-failed'}));sys.exit(1)
