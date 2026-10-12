"""Bounded ABI diagnosis. Parent transport is SOURCE in both phases; actual HostPort is verbatim installed bytes."""
import argparse, hashlib, json, os, pathlib, subprocess
p=argparse.ArgumentParser();p.add_argument('--product',required=True);p.add_argument('--out',required=True);p.add_argument('--bun',required=True);p.add_argument('--node',required=True);args=p.parse_args()
kit=pathlib.Path(__file__).resolve().parent;product=pathlib.Path(args.product).resolve();out=pathlib.Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
host=kit.parents[2];bundle=(product/'resources/loginom/host/node-host.mjs').read_text()
a=bundle.index('// src/host-port.ts');b=bundle.index('\n// src/connection/cli-credentials.ts',a)
installed=bundle[a:b]+'\nexport {loginomHostPort};\n'
checks=[]
for phase in ['source','actual']:
 dest=out/phase;dest.mkdir(exist_ok=True)
 if phase=='source':
  subprocess.run([args.bun,'build',str(host/'src/host-port.ts'),'--target=node','--outfile='+str(dest/'selected-host-port.mjs')],check=True,stdout=open(dest/'compile-host.log','w'))
 else:(dest/'selected-host-port.mjs').write_text(installed)
 (dest/'child.mjs').write_bytes((kit/'hostport-child.mjs').read_bytes())
 env={**os.environ,'FPABI_CHILD':str(dest/'child.mjs'),'FPABI_NODE':args.node,'FPABI_RECEIPTS':str(dest/'receipts')}
 with open(dest/'tests.log','w') as log:r=subprocess.run([args.bun,'test',str(kit/'caller-boundary.test.ts')],env=env,stdout=log,stderr=subprocess.STDOUT)
 checks.append({'phase':phase,'exit':r.returncode,'host_port_sha256':hashlib.sha256((dest/'selected-host-port.mjs').read_bytes()).hexdigest()})
 assert r.returncode==0,phase
json.dump({'host_bundle_sha256':hashlib.sha256(bundle.encode()).hexdigest(),'installed_section_sha256':hashlib.sha256(installed.encode()).hexdigest(),'source_transport_sha256':hashlib.sha256((host/'src/transport.ts').read_bytes()).hexdigest(),'parent_transport':'SOURCE, not independently installed CLI','phases':checks,'native_inputs_verified':False,'fp_applicable':False},open(out/'composition.json','w'),indent=2)
