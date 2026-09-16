"""Two separately admitted CSV inputs for the autonomous Join goal."""
import re
from pathlib import Path
from destinations import storage_segments,render_goal
FIXTURES={'left.csv':('93555e5639d5cc4c6fb1d96b710c3e1c13db23107911d52012e0e9af049db5fe',77),'right.csv':('2897691ec46dc8a9849ef43c3d07cc8276ac0b824936a84b2d85108042b06295',72)}
MANIFEST_URI='viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.11-parallel-pilot.1-candidate/manifest.json'
MANIFEST_SHA='4ac827fc9e0cefa609bf2cb8fd7d3d79318dd3fe92999decc7e385fae51fc6e2'
def validate_catalog(uri,digest,directory):
    if uri!=MANIFEST_URI or digest!=MANIFEST_SHA:raise ValueError('Join acceptance requires the pinned test-account catalog')
    if storage_segments(directory)[0] not in ('test-1','test-2','test-3'):raise ValueError('Join destination is outside the pinned catalog roots')
def descriptors(run_id,directory):
    storage_segments(directory)
    if not re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}',run_id):raise ValueError('Invalid Join run identity')
    return [dict(name='Dock-join-'+run_id+'-'+file,bytes=size,sha256=sha,upload=dict(directory=directory,overwrite='replace')) for file,(sha,size) in FIXTURES.items()]
def prompt(template,package_path,directory,run_id):
    left,right=descriptors(run_id,directory)
    return render_goal(template,package_path,directory).replace('__LEFT_CSV__',left['name']).replace('__RIGHT_CSV__',right['name'])
