"""Three independently admitted append-all fixtures for autonomous Union acceptance."""
import re
from destinations import storage_segments,render_goal
from join_upload_probe import MANIFEST_URI,MANIFEST_SHA,validate_catalog
FIXTURES={'main.csv': ('3ee49d5ef8d061d149cc9b040167bc4519a542e39ff5947a28664a25ef582943', 51), 'second.csv': ('283537adf032ae4bcd0fe8d8b314be8a5246c00bd00733b30cee6b0e6067fc33', 35), 'third.csv': ('b77641ddfe84a4e7ad5860870435a7ae0a2b77cb9d76660ee4424c2b6095bbcf', 55)}
def descriptors(run_id,directory):
    storage_segments(directory)
    if not re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}',run_id):raise ValueError('Invalid Union run identity')
    return [dict(name='Dock-union-'+run_id+'-'+file,bytes=size,sha256=sha,upload=dict(directory=directory,overwrite='replace')) for file,(sha,size) in FIXTURES.items()]
def prompt(template,package_path,directory,run_id):
    artifacts=descriptors(run_id,directory);text=render_goal(template,package_path,directory)
    for key,a in zip(('__MAIN_CSV__','__SECOND_CSV__','__THIRD_CSV__'),artifacts):text=text.replace(key,a['name'])
    return text
