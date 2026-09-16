"""Three bounded integration scenarios; no node-level admission or model calls."""
import hashlib
import json
import re
from pathlib import Path
from destinations import render_goal

WORK = Path(__file__).resolve().parent
FIXTURES = WORK / 'fixtures/rc-combined'
GOALS = {
    'rc-combined-cleaning': ('orders.csv', 'lookup.csv'),
    'rc-combined-calendar': ('sales.csv',),
    'rc-combined-export': ('wide.csv',),
}
# Node labels and input-port order belong to the independent scenario contract.
SPECS = {
    'cleaning': {
        'Orders': ('imports.text', []), 'Lookup': ('imports.text', []),
        'Names': ('transform.replace_columns', [('Orders', 0)]),
        'Filled': ('preprocessing.data_recovery', [('Names', 0)]),
        'Duplicates': ('research.duplicates', [('Filled', 0)]),
        'Enriched': ('transform.join_data', [('Filled', 0), ('Lookup', 0)]),
        'Combined': ('transform.union_data', [('Enriched', 0), ('Enriched', 0)]),
    },
    'calendar': {
        'Sales': ('imports.text', []),
        'Calculated': ('transform.calculator', [('Sales', 0)]),
        'Calendar': ('transform.date_time', [('Calculated', 0)]),
        'Positive': ('transform.filter_data', [('Calendar', 0)]),
        'Monthly': ('transform.group_data', [('Positive', 0)]),
        'Sorted': ('transform.sorting', [('Monthly', 0)]),
    },
    'export': {
        'Wide': ('imports.text', []),
        'Fields': ('transform.reform_columns', [('Wide', 0)]),
        'Long': ('transform.collapse_columns', [('Fields', 0)]),
        'Export': ('exports.text', [('Long', 0)]),
    },
}
LEAVES = {'cleaning': ['Duplicates', 'Combined'], 'calendar': ['Sorted'], 'export': ['Long']}
MANIFEST_URI = 'viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node11.2-candidate/manifest.json'
MANIFEST_SHA = 'bb2fe2207e01d594108efb591d1c25036adc12f67168ef895dfde755d391ac2a'

def validate(args):
    if (args.loginom_user != 'test-2' or args.storage_directory != '/test-2'
            or args.loginom_url != 'http://logi-test-plan.bg.local/app/?testable=true'
            or args.model_profile != 'chatgpt-sol'
            or args.manifest_uri != MANIFEST_URI or args.manifest_sha256 != MANIFEST_SHA):
        raise ValueError('RC integration requires the assigned test-2/Sol-low candidate')
    fixture_pins()

def fixture_pins():
    manifest = json.loads((FIXTURES / 'inputs.json').read_text())
    for name, pin in manifest.items():
        body = (FIXTURES / name).read_bytes()
        if len(body) != pin['bytes'] or hashlib.sha256(body).hexdigest() != pin['sha256']:
            raise ValueError('RC fixture changed: ' + name)
    return {p.relative_to(WORK).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in FIXTURES.iterdir() if p.is_file()}

def descriptors(goal, run_id, directory):
    if directory != '/test-2' or not re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}', run_id):
        raise ValueError('Invalid RC integration identity')
    manifest = json.loads((FIXTURES / 'inputs.json').read_text())
    return [dict(name='RC-' + run_id + '-' + name, **manifest[name],
                 upload=dict(directory=directory, overwrite='reject')) for name in GOALS[goal]]

def prompt(goal, template, package, directory, run_id):
    text = render_goal(template, package, directory)
    for name, artifact in zip(GOALS[goal], descriptors(goal, run_id, directory)):
        text = text.replace('__' + name.split('.')[0].upper() + '_CSV__', artifact['name'])
    return text.replace('__EXPORT_PATH__', directory + '/RC-' + run_id + '-long.csv')
