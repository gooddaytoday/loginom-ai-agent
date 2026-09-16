"""Node17 v2: source identity is required; saved import settings must stay untouched."""
import hashlib
from import_source_binding import source_with_delivery_metadata


def verify_unchanged_import_request(events, seed, request, seed_node, source_bytes):
    assert request['target']['kind'] == 'existing' and request['target']['type'] == 'imports.text', 'existing_import_required'
    assert request['target']['ref']['node_id'] == seed_node['node_id'], 'import_native_node_changed'
    assert request['inputs'] == [] and request['mappings'] == [], 'import_connections_changed'
    assert set(request['parameters']) == {'settings', 'source'}, 'import_parameter_contract'
    assert request['parameters']['settings'] == {}, 'import_settings_changed'
    expected = {'bytes': len(source_bytes), 'sha256': hashlib.sha256(source_bytes).hexdigest()}
    original = seed['parameters']['source']
    source = request['parameters']['source']
    assert set(source) <= {'artifact_id', 'upload_operation_id', 'bytes', 'sha256'}, 'unexpected_import_source_key'
    assert all(source.get(k) == original[k] for k in ('artifact_id', 'upload_operation_id')), 'import_source_identity_changed'
    for value in (original, source):
        verified = source_with_delivery_metadata(events, value)
        assert all(type(verified.get(k)) is type(v) and verified[k] == v for k, v in expected.items()), 'import_source_integrity_changed'
    return {'passed': True, 'same_native_node': True, 'same_verified_source': True, 'empty_settings_inputs_mappings': True}
