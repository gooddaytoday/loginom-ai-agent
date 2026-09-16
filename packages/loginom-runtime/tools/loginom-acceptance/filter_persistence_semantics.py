"""Compare verified filter settings across Loginom's save/load representations.

Call only after independent raw configuration checks for both operations.
Input bindings are named identities; their native picker indexes can change on
load. Output positions are contractual and remain strictly ordered.
"""
from copy import deepcopy
from row_filter_configuration_evidence import normalize_groups


def filter_settings(result):
    rb = deepcopy(result['configuration']['readback'])
    for key in ('node', 'receipt_ids'):
        rb.pop(key, None)
    rb['groups'] = normalize_groups(rb['groups'])
    fields = rb['input_mapping']['fields']
    names = [f['name'] for f in fields]
    if len(names) != len(set(names)):
        raise ValueError('duplicate_filter_input_identity')
    rb['input_mapping']['fields'] = sorted(
        ({k: v for k, v in f.items() if k != 'index'} for f in fields),
        key=lambda f: f['name'])
    return rb
