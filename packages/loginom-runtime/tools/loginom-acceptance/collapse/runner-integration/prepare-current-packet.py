"""Bounded source packet for coordinator staging. No upload/build/model execution."""
import argparse,io,json,sys,tarfile
from pathlib import Path
W=Path(__file__).resolve().parents[2];sys.path.insert(0,str(W))
import collapse_acceptance as a
from preflight import runtime_pin
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);args=p.parse_args()
args.output.mkdir(parents=True,exist_ok=False)
runtime=runtime_pin(a.ROOT)
if runtime['client_revision']!=a.RUNTIME:raise ValueError('source runtime differs')
old=json.loads((a.KIT/'source-packet.json').read_text())
paths={f['path'] for f in old['files']}|set(runtime['inputs'])|{'executor/capability-abi.json'}
files=[]
for name in sorted(paths):
 path=a.ROOT/name
 if not path.resolve().is_relative_to(a.ROOT) or path.is_symlink() or any(x in path.parts for x in ['.dock','node_modules','__pycache__']):raise ValueError('unsafe packet path')
 files.append(dict(path=name,sha256=a.sha(path),bytes=path.stat().st_size))
manifest=dict(source_sha=a.SOURCE,runtime=a.RUNTIME,files=files,total_bytes=sum(f['bytes'] for f in files),scope='previous reviewed minimal candidate allowlist plus current runtime inputs; acceptance harness stays local',harness_manifest_sha256=a.sha(Path(__file__).resolve().parent/'harness-pins.json'),model_started=False,published=False)
(args.output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
with tarfile.open(args.output/'source.tar','x') as tar:
 for item in files:
  data=(a.ROOT/item['path']).read_bytes();info=tarfile.TarInfo(item['path']);info.size=len(data);info.mode=0o755 if (a.ROOT/item['path']).stat().st_mode & 0o111 else 0o644;info.mtime=0;tar.addfile(info,io.BytesIO(data))
print(json.dumps(dict(files=len(files),bytes=manifest['total_bytes'],manifest_sha256=a.sha(args.output/'manifest.json'),tar_sha256=a.sha(args.output/'source.tar'),output=str(args.output))))
