"""Node17 fixed fixtures and immutable catalog selection; no model calls."""
import hashlib,json,re
from pathlib import Path
from destinations import storage_segments,render_goal
WORK=Path(__file__).resolve().parent
CONTRACT=json.loads((WORK/'fixtures/text-export/contract.json').read_text())
FIXTURES={name:(v['sha256'],v['bytes']) for name,v in CONTRACT['inputs'].items()}
MANIFEST_URI='viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node11.2-candidate/manifest.json'
MANIFEST_SHA='bb2fe2207e01d594108efb591d1c25036adc12f67168ef895dfde755d391ac2a'
def validate_catalog(uri,digest,directory):
    if uri!=MANIFEST_URI or digest!=MANIFEST_SHA or directory!='/test-2':raise ValueError('Node17 exact immutable candidate/test-2 required')
def descriptors(run_id,directory):
    storage_segments(directory)
    if directory!='/test-2' or not re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}',run_id):raise ValueError('Invalid Text export run identity')
    return [dict(name='Dock-export-'+run_id+'-input-'+name,bytes=size,sha256=digest,upload=dict(directory=directory,overwrite='reject')) for name,(digest,size) in FIXTURES.items()]
def prompt(template,package_path,directory,run_id):
    artifacts=descriptors(run_id,directory);text=render_goal(template,package_path,directory)
    for token,a in zip(('__MAIN_CSV__','__TYPED_CSV__','__WIDE_CSV__'),artifacts):text=text.replace(token,a['name'])
    return text.replace('__EXPORT_PREFIX__',directory+'/Dock-export-'+run_id)
def verify_expected():
    for case in CONTRACT['cases']:
        data=(WORK/'fixtures/text-export'/case['expected_path']).read_bytes()
        if len(data)!=case['bytes'] or hashlib.sha256(data).hexdigest()!=case['sha256']:raise ValueError('Frozen expected bytes changed')
