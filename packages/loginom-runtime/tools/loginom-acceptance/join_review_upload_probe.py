"""Wide CSV inputs for live-confirmed Join review acceptance."""
import re
from pathlib import Path
from destinations import storage_segments,render_goal
FIXTURES={'left.csv': ('99135bced8efe2d24ed8dea7b2ae75df33c732b47eb16ace7562e70bc0898968', 312), 'right.csv': ('6b7995a9f446b18860b314f37eab33e700df86df9d30a6c3e77c90757e7cee6b', 312)}
MANIFEST_URI='viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.11-parallel-pilot.1-candidate/manifest.json'
MANIFEST_SHA='4ac827fc9e0cefa609bf2cb8fd7d3d79318dd3fe92999decc7e385fae51fc6e2'
def validate_catalog(uri,digest,directory):
    if uri!=MANIFEST_URI or digest!=MANIFEST_SHA:raise ValueError('Join acceptance requires the pinned test-account catalog')
    if storage_segments(directory)[0] not in ('test-1','test-2','test-3'):raise ValueError('Join destination is outside the pinned catalog roots')
def descriptors(run_id,directory):
    storage_segments(directory)
    if not re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}',run_id):raise ValueError('Invalid Join run identity')
    return [dict(name='Dock-join-review-'+run_id+'-'+file,bytes=size,sha256=sha,upload=dict(directory=directory,overwrite='replace')) for file,(sha,size) in FIXTURES.items()]
def prompt(template,package_path,directory,run_id):
    left,right=descriptors(run_id,directory)
    return render_goal(template,package_path,directory).replace('__LEFT_CSV__',left['name']).replace('__RIGHT_CSV__',right['name'])
