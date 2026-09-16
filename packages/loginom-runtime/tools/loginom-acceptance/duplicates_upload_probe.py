"""Explicitly admitted, run-specific input files for the Duplicates goal."""
import re
from destinations import storage_segments, render_goal
from duplicates_test_fixtures import duplicates_fixtures
FIXTURES={f['name']:(f['sha256'],f['bytes']) for f in duplicates_fixtures().values()}


def validate_catalog(uri,digest,directory):
    storage_segments(directory)
    if not isinstance(uri,str) or not re.fullmatch(r'viking://resources/loginom-dock/catalogs/executor-preview/releases/[0-9A-Za-z.+-]+/manifest\.json',uri):
        raise ValueError('Duplicates requires an explicit candidate manifest URI')
    if not isinstance(digest,str) or not re.fullmatch(r'[a-f0-9]{64}',digest):
        raise ValueError('Duplicates requires an explicit candidate SHA')


def descriptors(run_id,directory):
    storage_segments(directory)
    if not re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}',run_id):raise ValueError('Invalid Duplicates run identity')
    return [dict(name='Dock-duplicates-'+run_id+'-'+name,bytes=size,sha256=sha,upload=dict(directory=directory,overwrite='replace')) for name,(sha,size) in FIXTURES.items()]


def prompt(template,package_path,directory,run_id):
    text=render_goal(template,package_path,directory)
    for key,a in zip(('__MAIN_CSV__','__NULL_CSV__','__EMPTY_CSV__'),descriptors(run_id,directory)):
        text=text.replace(key,a['name'])
    return text
