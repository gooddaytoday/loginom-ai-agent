"""Declared grouping acceptance fixture, with null/empty and exact fractions."""
from destinations import storage_segments, render_goal
import re
FIXTURE='fixtures/grouping/grouping.csv'
FIXTURE_SHA='579c1df3f406bc4b6839ea9d587736d120092128404ba68f2619b2e9a720e27c'
FIXTURE_BYTES=150

def descriptor(run_id,directory):
    storage_segments(directory)
    if not re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}',run_id):raise ValueError('Invalid grouping run identity')
    return dict(name='Dock-grouping-'+run_id+'.csv',bytes=FIXTURE_BYTES,sha256=FIXTURE_SHA,
                upload=dict(directory=directory,overwrite='replace'))

def prompt(template,package_path,directory,run_id):
    return render_goal(template,package_path,directory).replace('__UPLOAD_NAME__',descriptor(run_id,directory)['name'])
