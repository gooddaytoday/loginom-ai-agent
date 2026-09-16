"""Declared reform acceptance fixture, with null/empty and exact fractions."""
from destinations import storage_segments, render_goal
import re
FIXTURE='fixtures/field-parameters/cleanup.csv'
FIXTURE_SHA='c1204e8bb03a0a686ec291de1fa5d532f19830589d4040e695f2f17e186f2a2e'
FIXTURE_BYTES=248

def descriptor(run_id,directory):
    storage_segments(directory)
    if not re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}',run_id):raise ValueError('Invalid reform run identity')
    return dict(name='Dock-reform-'+run_id+'.csv',bytes=FIXTURE_BYTES,sha256=FIXTURE_SHA,
                upload=dict(directory=directory,overwrite='replace'))

def prompt(template,package_path,directory,run_id):
    return render_goal(template,package_path,directory).replace('__UPLOAD_NAME__',descriptor(run_id,directory)['name'])
