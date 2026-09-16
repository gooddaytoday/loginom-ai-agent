"""Declared filter acceptance fixture, with null/empty and exact fractions."""
from destinations import storage_segments, render_goal
import re
FIXTURE='fixtures/row-filter/golden.csv'
FIXTURE_SHA='7ac857baaecd48b1e03f2cff470140ae7526a3e289016a209c7d41a706a2e0bb'
FIXTURE_BYTES=413

def descriptor(run_id,directory):
    storage_segments(directory)
    if not re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}',run_id):raise ValueError('Invalid filter run identity')
    return dict(name='Dock-filter-'+run_id+'.csv',bytes=FIXTURE_BYTES,sha256=FIXTURE_SHA,
                upload=dict(directory=directory,overwrite='replace'))

def prompt(template,package_path,directory,run_id):
    return render_goal(template,package_path,directory).replace('__UPLOAD_NAME__',descriptor(run_id,directory)['name'])
