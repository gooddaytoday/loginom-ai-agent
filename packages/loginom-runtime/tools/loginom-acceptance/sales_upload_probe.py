"""Immutable ten-row sales input for the two-branch sorting acceptance."""
from destinations import storage_segments, render_goal
import re
FIXTURE='fixtures/sales-sorting-v1/sales.csv'
FIXTURE_SHA='44880a6c4a442226889c06d9703f8ba77316b42b35bd82da14a43dc25c039a6b'
FIXTURE_BYTES=250

def descriptor(run_id,directory):
    storage_segments(directory)
    if not re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}',run_id):raise ValueError('Invalid sales run identity')
    return dict(name='Dock-sales-'+run_id+'.csv',bytes=FIXTURE_BYTES,sha256=FIXTURE_SHA,
                upload=dict(directory=directory,overwrite='replace'))

def prompt(template,package_path,directory,run_id):
    return render_goal(template,package_path,directory).replace('__UPLOAD_NAME__',descriptor(run_id,directory)['name'])
