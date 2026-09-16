"""Immutable input descriptors for Node 11; server candidate pin is supplied after stage."""
import re
from destinations import render_goal, storage_segments
FIXTURES = {
 'input.csv': ('0e0151318f8307267dc1ed61b396c869303331dc8f1831cac8b7b5a73d2e2e4b', 124),
 'partial-input.csv': ('e195cdcbcc187601a822f31e26fc7d55f9507c66c51cb9e9d799d785649a1123', 67),
}
VERSION='2026.09.13-node11.2-candidate'
PROPOSED_URI='viking://resources/loginom-dock/catalogs/executor-preview/releases/'+VERSION+'/manifest.json'
def validate_catalog(uri,digest,directory):
    if directory!='/test-2' or storage_segments(directory)!=['test-2']:raise ValueError('Node 11 requires explicit /test-2')
    if uri is None and digest is None:return # Source-only preflight; --run rejects absent pins.
    if uri!=PROPOSED_URI or not isinstance(digest,str) or not re.fullmatch('[a-f0-9]{64}',digest):raise ValueError('Node 11 requires its separate coordinator-verified candidate')
def descriptors(run_id,directory):
    validate_catalog(None,None,directory)
    if not re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}',run_id):raise ValueError('Invalid run identity')
    return [dict(name='Dock-node11-'+run_id+'-'+file,bytes=size,sha256=sha,upload=dict(directory=directory,overwrite='replace')) for file,(sha,size) in FIXTURES.items()]
def prompt(template,package_path,directory,run_id):
    text=render_goal(template,package_path,directory)
    for marker,item in zip(('__MAIN_CSV__','__PARTIAL_CSV__'),descriptors(run_id,directory)):text=text.replace(marker,item['name'])
    return text
