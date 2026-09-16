"""Require real package reopening before admitting unchanged import without a wizard."""
from node_apply_save_chain import verify_save_chain
from node_apply_reopen_binding import verify_reopen_binding
from existing_import_evidence import _verify_existing_import_output
from import_source_binding import source_ordered_settings
from full_read_evidence import verify_full_read
from identity_import_evidence import verify_identity_import_mapping, verify_identity_autosync


def verify_persisted_schema(events, request, expected_columns):
    try:
        matches=[e["result"] for e in events if e.get("phase")=="node_checkpoint" and e.get("operation_id")==request["operation_id"]]
        if len(matches)!=1:raise ValueError("unique_checkpoint")
        ports=matches[0]["output"]["ports"]
        if len(ports)!=1:raise ValueError("unique_port")
        schema=ports[0]["schema"];keys=("name","label","type","data_kind")
        expected=[{k:c[k] for k in keys} for c in expected_columns if c["used"]]
        if [{k:c[k] for k in keys} for c in schema]!=expected:raise ValueError("independent_import_schema")
        return dict(passed=True,scope="persisted_import_schema_only")
    except (KeyError,TypeError,ValueError) as error:
        return dict(passed=False,failures=[str(error)])


def verify_persisted_import(evidence, seed, request, source_bytes, path, revisions, *, expected_rows, expected_graphs, stages):
    checks={}
    checks['save_chain']=verify_save_chain(evidence['events'],seed,path,revisions,expected_graphs=expected_graphs,stages=stages)
    if checks['save_chain']['passed']:
        checks['reopen_binding']=verify_reopen_binding(evidence,seed,request,checks['save_chain']['save_operation_ids'][-1],path)
    if len(checks)==2 and all(c['passed'] for c in checks.values()):
        # The caller need not request a wizard or repeat settings. Existing
        # native opening/configure evidence must still prove every parameter;
        # an output-only observation cannot establish saved import settings.
        if request.get('mappings') != [] or request.get('inputs') != [] or request.get('parameters', {}).get('settings') != {}:
            return dict(passed=False,checks=checks,failures=['persisted_import_must_remain_unchanged'])
        checks['seed_identity_mapping'] = verify_identity_import_mapping(evidence['events'], seed, source_bytes)
        if not checks['seed_identity_mapping']['passed']:
            return dict(passed=False,checks=checks,failures=['persisted_import_seed_mapping'])
        expected=source_ordered_settings(seed['parameters']['settings'],source_bytes)['columns']
        checks['schema']=verify_persisted_schema(evidence['events'],request,expected)
        checks['full_read']=verify_full_read(evidence['events'],request,expected_rows)
        checks['native_output']=_verify_existing_import_output(evidence['events'],seed,request,source_bytes,
            reopened_package=True)
        checks['identity_autosync'] = verify_identity_autosync(evidence['events'], request) if seed['mappings'] else dict(passed=True, scope='unmapped_import')
    passed=len(checks)==7 and all(c['passed'] for c in checks.values())
    return dict(passed=passed,checks=checks,package_persistence_verified=passed,
                scope='verified_reopening_native_unchanged_import',hermes_acceptance_verified=False)
