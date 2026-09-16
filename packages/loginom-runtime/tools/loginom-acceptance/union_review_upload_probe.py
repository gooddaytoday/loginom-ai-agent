"""Two independently admitted review fixtures for autonomous Union acceptance."""
import re
from destinations import storage_segments,render_goal
from join_upload_probe import MANIFEST_URI,MANIFEST_SHA,validate_catalog
FIXTURES={'main.csv': ('e7b1d0ed04a6b42e10e31e22c8fa40bc0a85e14c96eb7b9f57e4b58b8fac784a', 12), 'wide.csv': ('f745faa48d8d0bd76482d5fbc77ffa25a9a81429076396019c3259accf5d6b83', 320)}
def descriptors(run_id,directory):
    storage_segments(directory)
    if not re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}',run_id):raise ValueError('Invalid Union run identity')
    return [dict(name='Dock-union-review-'+run_id+'-'+file,bytes=size,sha256=sha,upload=dict(directory=directory,overwrite='replace')) for file,(sha,size) in FIXTURES.items()]
def prompt(template,package_path,directory,run_id):
    artifacts=descriptors(run_id,directory);text=render_goal(template,package_path,directory)
    for key,a in zip(('__MAIN_CSV__','__WIDE_CSV__'),artifacts):text=text.replace(key,a['name'])
    return text
