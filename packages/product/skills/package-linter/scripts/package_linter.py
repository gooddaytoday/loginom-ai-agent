#!/usr/bin/env python3
"""Read-only, source-bound evidence and report transport. No scenario execution."""
import argparse
import copy
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, ROUND_FLOOR, ROUND_HALF_UP, localcontext
import hashlib
import html
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile

from lxml import etree
import scoring

WEIGHTS = {'structure': 40, 'notes': 25, 'node_labels': 17.5, 'variables': 17.5}
LABELS = dict(zip(WEIGHTS, ['Структура', 'Заметки', 'Наименования узлов', 'Наименования переменных']))
MAX_TOTAL = 128 * 1024 * 1024
MAX_MEMBER = 32 * 1024 * 1024
MAX_ENTRIES = 4096
XSI = '{http://www.w3.org/2001/XMLSchema-instance}type'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def safe_path(path):
    path = Path(os.path.abspath(path))
    for current in [path, *path.parents]:
        if current.is_symlink() or (current.exists() and getattr(current.lstat(), 'st_file_attributes', 0) & 0x400):
            raise ValueError('Symbolic links/reparse points are not supported: ' + str(current))
    return path


def load(source):
    source = safe_path(source)
    require(source.is_file(), 'Source must be a regular package file')
    require(source.stat().st_size <= MAX_TOTAL, 'Source exceeds byte limit')
    payload = source.read_bytes()
    require(len(payload) <= MAX_TOTAL, 'Source exceeds byte limit')
    roots = {}
    variable_roots = {}
    metadata_roots = {}
    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            entries = archive.infolist()
            require(len(entries) <= MAX_ENTRIES, 'ZIP entry limit exceeded')
            require(sum(i.file_size for i in entries) <= MAX_TOTAL, 'ZIP expanded byte limit exceeded')
            names = set()
            for item in entries:
                name = item.filename
                parts = PurePosixPath(name).parts
                require(name and '\\' not in name and not name.startswith('/') and ':' not in name
                        and all(p not in ('.', '..', '') for p in name.rstrip('/').split('/')), 'Unsafe ZIP path')
                require(name.casefold() not in names, 'Duplicate ZIP entry')
                names.add(name.casefold())
                require(not item.flag_bits & 1, 'Encrypted ZIP entry')
                require(not stat.S_ISLNK(item.external_attr >> 16), 'ZIP symbolic link')
                require(item.file_size <= MAX_MEMBER, 'ZIP member byte limit exceeded')
                require(item.file_size <= max(1024 * 1024, item.compress_size * 500), 'ZIP compression ratio limit exceeded')
                if item.is_dir() or not name.lower().endswith('.xml'):
                    continue
                data = archive.read(item)
                parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False)
                root = etree.fromstring(data, parser)
                require(not root.getroottree().docinfo.doctype and not any(isinstance(e, etree._Entity) for e in root.iter()), 'DTD/entities are forbidden')
                if parts[-1].casefold() == 'unit.xml':
                    require(root.tag == 'Unit', 'Unit.xml must contain native Unit XML')
                    roots[name] = root
                elif parts[-1].casefold() == 'variables.xml':
                    variable_roots[name] = root
                elif parts[-1].casefold() in ('info.xml', 'packageinfo.xml', 'references.xml'):
                    metadata_roots[name] = root
    except (zipfile.BadZipFile, etree.XMLSyntaxError, RuntimeError, OSError, NotImplementedError) as exc:
        raise ValueError('Cannot safely read package: ' + str(exc)) from exc
    require(roots, 'No own Unit.xml modules found')
    return source, payload, dict(sorted(roots.items())), dict(sorted(variable_roots.items())), metadata_roots


def inspect(source):
    source, payload, roots, variable_roots, metadata_roots = load(source)
    result = {'schema_version': 1, 'source': {'path': str(source), 'sha256': hashlib.sha256(payload).hexdigest(), 'bytes': len(payload)},
              'modules': [], 'scopes': [], 'nodes': [], 'notes': [], 'variables': [], 'links': [],
              'relations': [], 'groups': [], 'locators': [], 'coverage': [], 'package': {}, 'declared_references': [],
              'limits': ['Static own XML only; native opening, execution and business correctness unverified.',
                         'Opaque code, inherited deltas and external packages may hide relationships or variables.',
                         'Unknown demand or terminal purpose never proves obsolescence.']}
    known = set()
    elements = {}
    scope_elements = {}
    scopes = {}
    node_elements = {}
    globals_index = defaultdict(list)
    module_aliases = defaultdict(list)
    vendor_defs = defaultdict(list)
    builtin_types = json.loads((Path(__file__).resolve().parents[1] / 'resources' / 'vendor-types.json').read_text(encoding='utf-8'))['types']

    def loc(member, element):
        value = member + '#' + element.getroottree().getpath(element)
        known.add(value)
        return value

    def provenance(element):
        return {k: element.get(k) for k in ('__baseGuid', '__derived', '__deleted', 'GlobalNodeID', 'VendorGuid',
                                           'BasePackageGuid', 'BaseModuleGuid', 'BaseNodeGuid') if element.get(k) is not None}

    def delta(element):
        return any(any(key in p.attrib for key in ('__baseGuid', '__derived', '__deleted'))
                   for p in [element, *element.iterancestors()])

    def deleted(element):
        return any(p.get('__deleted', '').lower() in ('true', '1') for p in [element, *element.iterancestors()])

    metadata_by_name = {name.casefold(): (name, root) for name, root in metadata_roots.items()}
    if 'packageinfo.xml' in metadata_by_name:
        member, metadata = metadata_by_name['packageinfo.xml']
        if metadata.tag == 'PackageInfo':
            result['package'] = {'name': metadata.get('Name'), 'guid': metadata.get('Guid'),
                                 'application_version': metadata.get('ApplicationVersion'), 'locator': loc(member, metadata)}
        else:
            result['coverage'].append({'locator': loc(member, metadata), 'reason': 'unsupported PackageInfo.xml root'})
    if 'references.xml' in metadata_by_name:
        member, references = metadata_by_name['references.xml']
        if references.tag != 'References':
            result['coverage'].append({'locator': loc(member, references), 'reason': 'unsupported References.xml root'})
        else:
            for item in references.findall('Item'):
                # A basename is sufficient context; never expose URL credentials/query or open a hint.
                hint = item.get('HintPath', '').replace('\\', '/').split('?', 1)[0].split('#', 1)[0].rsplit('/', 1)[-1]
                if any(c in hint for c in ':@') or not hint.lower().endswith('.lgp'):
                    hint = None
                result['declared_references'].append({'package_guid': item.get('PackageGuid') or item.get('Guid'),
                                                       'hint_basename': hint, 'locator': loc(member, item),
                                                       'status': 'declared_opaque', 'usage': 'unknown'})

    def origin(element):
        package = next((p.get('BasePackageGuid') for p in [element, *element.iterancestors()] if p.get('BasePackageGuid')), None)
        own = result['package'].get('guid')
        return 'external_or_unknown_package' if package and (not own or package.casefold() != own.casefold()) else 'own_package'

    for member, root in variable_roots.items():
        owner = loc(member, root)
        if member.casefold() != 'variables.xml' or root.tag != 'Variables' or len(root.findall('Elements')) != 1:
            result['coverage'].append({'locator': owner, 'reason': 'unsupported package variable document shape/ownership'})
            continue
        if any(child.tag != 'Elements' for child in root) or any(child.tag != 'Item' for child in root.find('Elements')):
            result['coverage'].append({'locator': owner, 'reason': 'unsupported package variable declaration content'})
        for variable in root.findall('Elements/Item'):
            result['variables'].append({'locator': loc(member, variable), 'scope': owner, 'ownership': 'package',
                                       'node': None, 'port': None, 'direction': 'package',
                                       'name': variable.get('Name'), 'label': variable.get('DisplayName'),
                                       'type': variable.get('DataType'), 'usage': 'explicit_package_declaration',
                                       'provenance': provenance(variable)})
            if delta(variable):
                result['coverage'].append({'locator': loc(member, variable), 'reason': 'inherited/delta package variable: active content not fully established'})

    for member, root in roots.items():
        module = loc(member, root)
        info_name = str(PurePosixPath(member).with_name('Info.xml'))
        sidecar = metadata_by_name.get(info_name.casefold())
        info = sidecar[1] if sidecar is not None and sidecar[1].tag == 'Info' else None
        if sidecar is not None and info is None:
            result['coverage'].append({'locator': loc(*sidecar), 'reason': 'unsupported module Info.xml root'})
        module_record = {'id': module, 'member': member,
                         'name': (info.get('DisplayName') or info.get('Name') if info is not None else None) or root.get('DisplayName') or root.get('Name') or str(PurePosixPath(member).parent),
                         'guid': (info.get('Guid') if info is not None else None) or root.get('Guid'),
                         'service_name': (info.get('Name') if info is not None else None) or root.get('Name'),
                         'info_locator': loc(sidecar[0], info) if info is not None else None,
                         'provenance': provenance(info) if info is not None else {}, 'locator': module}
        result['modules'].append(module_record)
        own_types = {}
        for declaration in root.findall('.//Vendors/Item/Vendor'):
            if origin(declaration) == 'own_package' and declaration.get('DerivedComponentVendorGuid'):
                item = declaration.getparent()
                label = declaration.get('DisplayName') or item.get('DisplayName') or declaration.get('Name') or item.get('Name') or declaration.get('Caption')
                if label:
                    own_types[declaration.get('DerivedComponentVendorGuid').casefold()] = label
        aliases = {member, str(PurePosixPath(member).parent), root.get('Guid'), root.get('ModuleGuid'), root.get('ModuleID')}
        if info is not None and origin(info) == 'own_package':
            aliases.update({info.get('Guid'), info.get('Name')})
        for alias in aliases - {None, ''}:
            module_aliases[alias.casefold()].append(module)
        for unit in root.iter():
            if unit.tag not in ('Unit', 'ModelUnit'):
                continue
            flow = unit.find('WorkFlow')
            if flow is None:
                continue
            scope = loc(member, flow)
            kind = 'catalog_definition' if any(p.tag == 'Vendors' for p in unit.iterancestors()) else 'workflow'
            row = {'id': scope, 'module': module, 'kind': kind, 'locator': scope, 'parent_scope': None,
                   'owner': None, 'node_count': 0, 'note_count': 0, 'variable_visibility': 'none_observed',
                   'explicitly_deleted': deleted(flow),
                   'provenance': provenance(unit)}
            scopes[flow] = row
            scope_elements[scope] = (member, unit, flow)
            result['scopes'].append(row)
            for container in ('Nodes', 'ServiceNodes', 'Visualizers'):
                ids = set()
                for node in flow.findall(container + '/Item'):
                    guid = node.get('Guid')
                    is_delta = delta(node) or any(delta(e) for e in node.iterdescendants())
                    require(guid or is_delta, 'Missing node GUID within scope/container')
                    if guid and not is_delta:
                        require(guid.casefold() not in ids, 'Duplicate node GUID within scope/container')
                        ids.add(guid.casefold())
                    identity = loc(member, node)
                    engine = node.find('Component/Engine')
                    engine_type = engine.get(XSI, '') if engine is not None else ''
                    component = node.find('Component')
                    vendor_key = node.get('VendorGuid') or (component.get('ReferencedVendorGuid') if component is not None else '') or ''
                    record = {'id': identity, 'locator': identity, 'module': module, 'scope': scope, 'guid': guid,
                              'active_state': 'unknown_delta' if is_delta else 'observed_materialized',
                              'explicitly_deleted': deleted(node),
                              'kind': 'service' if container == 'ServiceNodes' else 'viewer' if container == 'Visualizers' else 'node',
                              'label': node.get('DisplayName'), 'service_name': node.get('Name'),
                              'engine_type': engine_type, 'provenance': provenance(node),
                              'vendor_name': builtin_types.get(vendor_key.casefold()) or own_types.get(vendor_key.casefold()),
                              'generated_title': node.get('GenerateNodeTitle'),
                              'demand': 'unknown', 'terminal_role': 'unknown', 'inputs': [], 'outputs': [], 'fields': []}
                    if not record['vendor_name'] and node.find('Component/Engine/ModelUnit/WorkFlow') is not None:
                        record['vendor_name'] = 'Подмодель'
                    if not record['vendor_name'] and 'Reference' in engine_type:
                        record['vendor_name'] = 'Узел-ссылка'
                    node_elements[node] = record
                    elements[identity] = node
                    result['nodes'].append(record)
                    row['node_count'] += 1
                    if is_delta:
                        row['variable_visibility'] = 'unknown'
                        result['coverage'].append({'locator': identity, 'reason': 'inherited/delta node: active identity and content not fully established'})
                    global_id = node.get('GlobalNodeID')
                    if not is_delta and kind != 'catalog_definition' and (global_id or (unit is root and container == 'Nodes')):
                        globals_index[(global_id or guid).casefold()].append(identity)
                    for direction in ('Input', 'Output'):
                        sockets = node.findall('Component/' + direction + 'Sockets/Item')
                        ports = node.findall(direction + 'Ports/Item')
                        if not sockets:
                            child_flow = node.find('Component/Engine/ModelUnit/WorkFlow')
                            if child_flow is not None:
                                sockets = child_flow.findall('ServiceNodes/Item/Component/' + ('Output' if direction == 'Input' else 'Input') + 'Sockets/Item')
                                sockets = [s for s in sockets if s.get('Guid') in {p.get('Guid') for p in ports}]
                        by_guid = {s.get('Guid'): s for s in sockets}
                        for port in ports or sockets:
                            socket = by_guid.get(port.get('Guid'))
                            socket = socket if socket is not None else port
                            socket_types = [e.get(XSI, '') for e in socket.iter()]
                            variable = any('Variable' in t for t in socket_types) or socket.find('.//Variables') is not None
                            record['inputs' if direction == 'Input' else 'outputs'].append({'guid': port.get('Guid'), 'kind': 'variables' if variable else 'data_or_unknown'})
                        for socket in sockets:
                            for field in socket.findall('.//ColumnDefs/Item'):
                                record['fields'].append({'locator': loc(member, field), 'port': socket.get('Guid'),
                                                         'direction': direction.lower(), 'name': field.get('Name'), 'type': field.get('DataType')})
                            variables = socket.findall('.//Variables/Elements/Item')
                            for variable in variables:
                                result['variables'].append({'locator': loc(member, variable), 'scope': scope, 'node': identity,
                                                           'port': socket.get('Guid'), 'direction': direction.lower(),
                                                           'name': variable.get('Name'), 'label': variable.get('DisplayName'),
                                                           'type': variable.get('DataType'), 'usage': 'explicit_socket_declaration',
                                                           'provenance': provenance(variable)})
                    if engine is not None and ('Script' in engine_type or 'Python' in engine_type or 'JavaScript' in engine_type
                                               or any(e.tag in ('Script', 'Code', 'Expression', 'Expressions')
                                                      or any(k.rsplit('}', 1)[-1] == 'Expression' for k in e.attrib) for e in engine.iter())):
                        row['variable_visibility'] = 'unknown'
                        result['coverage'].append({'locator': identity, 'reason': 'opaque code may contain additional variable uses'})
            for note in flow.findall('Annotations/Item'):
                result['notes'].append({'locator': loc(member, note), 'scope': scope,
                                        'explicitly_deleted': deleted(note),
                                        'text': ''.join(note.find('Text').itertext()) if note.find('Text') is not None else note.get('Text', ''),
                                        'provenance': provenance(note)})
                row['note_count'] += 1
                if any(note.get(k) is not None for k in ('__baseGuid', '__derived', '__deleted')):
                    result['coverage'].append({'locator': loc(member, note), 'reason': 'inherited/delta annotation: active content not fully established'})
            for variable in unit.findall('Variables/Elements/Item'):
                result['variables'].append({'locator': loc(member, variable), 'scope': scope, 'node': None, 'port': None,
                                           'direction': 'scope', 'name': variable.get('Name'), 'label': variable.get('DisplayName'),
                                           'type': variable.get('DataType'), 'usage': 'explicit_scope_declaration',
                                           'provenance': provenance(variable)})

    for flow, row in scopes.items():
        owner = next((p for p in flow.iterancestors() if p in node_elements), None)
        parent = next((p for p in flow.iterancestors() if p in scopes), None)
        row['owner'] = node_elements[owner]['id'] if owner is not None else None
        row['parent_scope'] = scopes[parent]['id'] if parent is not None else None
        if delta(flow):
            result['coverage'].append({'locator': row['locator'], 'reason': 'inherited/delta XML: active content not fully established'})
            row['variable_visibility'] = 'unknown'
        if row['variable_visibility'] != 'unknown' and any(v['scope'] == row['id'] for v in result['variables']):
            row['variable_visibility'] = 'explicit_only'

    def relation(kind, consumer, targets, locator, **extra):
        targets = sorted(set(targets))
        result['relations'].append({'kind': kind, 'consumer': consumer, 'targets': targets,
                                    'status': 'resolved' if len(targets) == 1 else 'ambiguous' if targets else 'unresolved',
                                    'locator': locator, **extra})

    for member, root in roots.items():
        module = loc(member, root)
        for unit in (u for u in root.iter() if u.tag in ('Unit', 'ModelUnit')):
            for declaration in unit.findall('Vendors/Item/Vendor'):
                alias = declaration.get('DerivedComponentVendorGuid')
                if not alias:
                    continue
                declaration_loc = loc(member, declaration)
                targets = []
                own = declaration.find('.//ModelUnit/WorkFlow')
                if own is not None and own in scopes and not delta(own):
                    targets = [scopes[own]['id']]
                elif declaration.get('BaseNodeGuid'):
                    hint = declaration.get('BaseModuleGuid') or declaration.get('BaseModuleID')
                    target_modules = module_aliases.get(hint.casefold(), []) if hint else [module]
                    for target_module in target_modules:
                        target_root = roots[next(m['member'] for m in result['modules'] if m['id'] == target_module)]
                        target_unit = target_root if hint else unit
                        target_flow = target_unit.find('WorkFlow')
                        if target_flow is not None:
                            targets.extend(node_elements[n]['id'] for n in target_flow.findall('Nodes/Item')
                                           if n in node_elements and node_elements[n]['active_state'] == 'observed_materialized'
                                           and n.get('Guid', '').casefold() == declaration.get('BaseNodeGuid').casefold())
                if delta(declaration) or origin(declaration) != 'own_package':
                    targets = []
                vendor_defs[alias.casefold()].append({'module': module, 'unit': unit, 'targets': targets, 'locator': declaration_loc})
                relation('vendor_definition', declaration_loc, targets, declaration_loc, provenance=provenance(declaration), origin=origin(declaration))

    for node, record in node_elements.items():
        if record['active_state'] == 'unknown_delta':
            continue
        member = record['module'].split('#', 1)[0]
        engine = node.find('Component/Engine')
        if engine is not None and 'Reference' in engine.get(XSI, ''):
            targets = globals_index.get(engine.get('GlobalNodeID', '').casefold(), []) if origin(engine) == 'own_package' else []
            relation('node_reference', record['id'], targets, loc(member, engine), origin=origin(engine), provenance=provenance(engine))
        component = node.find('Component')
        alias = component.get('ReferencedVendorGuid') if component is not None else None
        alias = alias or (node.get('VendorGuid') if node.get('VendorGuid', '').casefold() in vendor_defs else None)
        if alias:
            owner_unit = next(p for p in node.iterancestors() if p.tag in ('Unit', 'ModelUnit'))
            definitions = vendor_defs.get(alias.casefold(), [])
            local = [d for d in definitions if d['unit'] is owner_unit]
            definitions = local or definitions
            targets = [t for d in definitions for t in d['targets']] if origin(component if component is not None else node) == 'own_package' else []
            relation('vendor_instance', record['id'], targets, loc(member, component if component is not None else node),
                     declarations=[d['locator'] for d in definitions])
            if len(definitions) > 1:
                result['relations'][-1]['status'] = 'ambiguous'

    for scope, (member, unit, flow) in scope_elements.items():
        node_by_guid = defaultdict(list)
        for node in [n for n in result['nodes'] if n['scope'] == scope and n['active_state'] == 'observed_materialized']:
            node_by_guid[node['guid'].casefold()].append(node)
        for container in ('Links', 'ServiceLinks'):
            for link in flow.findall(container + '/Item'):
                start, end = link.find('SourcePort'), link.find('TargetPort')
                if start is None or end is None:
                    result['coverage'].append({'locator': loc(member, link), 'reason': 'unrecognized link endpoints'})
                    continue
                sources = node_by_guid.get(start.get('NodeGuid', '').casefold(), [])
                targets = node_by_guid.get(end.get('NodeGuid', '').casefold(), [])
                kind = 'service_unknown' if container == 'ServiceLinks' else 'data'
                if container == 'ServiceLinks':
                    source_names = [p.get('Name', '') for n in sources for p in elements[n['id']].findall('ServiceOutputPorts/Item') if p.get('Guid') == start.get('PortGuid')]
                    target_names = [p.get('Name', '') for n in targets for p in elements[n['id']].findall('ServiceInputPorts/Item') if p.get('Guid') == end.get('PortGuid')]
                    if any('Synchronization' in name for name in source_names + target_names):
                        kind = 'control'
                    elif 'NodeReference' in target_names:
                        kind = 'component_reference'
                if any(p['guid'] == start.get('PortGuid') and p['kind'] == 'variables' for n in sources for p in n['outputs']):
                    kind = 'variables'
                result['links'].append({'locator': loc(member, link), 'scope': scope, 'kind': kind,
                                        'sources': [n['id'] for n in sources], 'targets': [n['id'] for n in targets],
                                        'source_port': start.get('PortGuid'), 'target_port': end.get('PortGuid'),
                                        'status': 'resolved' if len(sources) == len(targets) == 1 else 'unresolved_or_ambiguous'})
                if result['links'][-1]['status'] != 'resolved' or delta(link):
                    if delta(link):
                        result['links'][-1].update(status='unknown_delta', sources=[], targets=[])
                    result['coverage'].append({'locator': loc(member, link), 'reason': 'link endpoints unresolved/ambiguous or inherited/delta'})
        # Connected groups are observations only; isolated/outputless groups retain unknown purpose.
        remaining = {n['id'] for n in result['nodes'] if n['scope'] == scope and n['active_state'] == 'observed_materialized'}
        adjacent = defaultdict(set)
        for edge in result['links']:
            if edge['scope'] == scope:
                for first in edge['sources']:
                    for second in edge['targets']:
                        adjacent[first].add(second)
                        adjacent[second].add(first)
        while remaining:
            pending = [min(remaining)]
            group = set()
            while pending:
                current = pending.pop()
                if current in group:
                    continue
                group.add(current)
                pending.extend(adjacent[current] - group)
            remaining -= group
            result['groups'].append({'scope': scope, 'members': sorted(group), 'demand': 'unknown', 'terminal_role': 'unknown'})
    # Derived graph observations describe topology, never demand or business intent.
    for node in result['nodes']:
        node['incoming'] = [e['locator'] for e in result['links'] if node['id'] in e['targets']]
        node['outgoing'] = [e['locator'] for e in result['links'] if node['id'] in e['sources']]
        node['callers'] = [r['consumer'] for r in result['relations'] if r['kind'] in ('node_reference', 'vendor_instance') and node['id'] in r['targets']]
        node['topology'] = 'unknown' if node['active_state'] == 'unknown_delta' else 'isolated' if not node['incoming'] and not node['outgoing'] else 'source' if not node['incoming'] else 'terminal' if not node['outgoing'] else 'intermediate'
    for scope in result['scopes']:
        scope['callers'] = [r['consumer'] for r in result['relations'] if r['kind'] in ('node_reference', 'vendor_instance') and scope['id'] in r['targets']]
    result['locators'] = sorted(known)
    result['calculated'] = scoring.json_facts(result)
    return result


def check_assessment(assessment, evidence):
    require(isinstance(assessment, dict), 'Assessment must be an object')
    require(type(assessment.get('format_version')) is int and assessment['format_version'] == 3,
            'Use decision format_version 3 with explicit recommendation scope and targets; format 2 cannot be migrated automatically; ready numeric scores are not accepted')
    require(not any(key in assessment for key in ('score', 'algorithm', 'agent_score')), 'Ready scoring fields are forbidden')
    require(assessment.get('source_sha256') == evidence['source']['sha256'], 'Stale/mismatched source SHA256')
    if 'analysis_at' in assessment:
        require(isinstance(assessment['analysis_at'], str), 'analysis_at must be a timezone-aware ISO timestamp')
        try:
            timestamp = datetime.fromisoformat(assessment['analysis_at'].replace('Z', '+00:00'))
        except ValueError as exc:
            raise ValueError('analysis_at must be a timezone-aware ISO timestamp') from exc
        require(timestamp.utcoffset() is not None, 'analysis_at must include a timezone')
    known = set(evidence['locators'])

    def text_field(obj, key):
        require(isinstance(obj.get(key), str) and bool(obj[key].strip()), 'Required text: ' + key)

    def citations(obj):
        require(isinstance(obj.get('evidence'), list) and obj['evidence'] and all(isinstance(v, str) and v in known for v in obj['evidence']), 'Missing/fabricated evidence locator')

    def rows(owner, key, required=False):
        require(isinstance(owner.get(key), list) and (not required or owner[key]), 'Required section: ' + key)
        for row in owner[key]:
            require(isinstance(row, dict), 'Section rows must be objects')
            text_field(row, 'text')
            citations(row)

    objects = subject_objects(evidence)

    def recommendations(owner, module=None):
        rows(owner, 'recommendations')
        for row in owner['recommendations']:
            require({'text', 'evidence', 'scope', 'targets'} <= set(row) <= {'text', 'evidence', 'scope', 'targets', 'steps'},
                    'Recommendation requires text/evidence/scope/targets and optional steps only')
            if 'steps' in row:
                require(isinstance(row['steps'], list) and bool(row['steps']) and
                        all(isinstance(step, str) and bool(step.strip()) for step in row['steps']),
                        'Recommendation steps must be a nonempty list of nonempty strings')
            require(row['scope'] in ('general', 'specific'), 'Recommendation scope must be general or specific')
            targets = row['targets']
            require(isinstance(targets, list) and all(isinstance(t, str) and t in objects for t in targets),
                    'Recommendation targets must be exact resolved subject-object locators')
            require(len(targets) == len(set(targets)), 'Duplicate recommendation targets')
            require(bool(targets) == (row['scope'] == 'specific'),
                    'General recommendation requires targets=[]; specific recommendation requires targets')
            if module is not None:
                require(all(objects[t]['module'] == module for t in targets), 'Recommendation targets must belong to own module')

    def criteria(owner, calculated):
        values = owner.get('criteria')
        require(isinstance(values, list) and len(values) == len(WEIGHTS), 'Exactly four criteria required')
        require(all(isinstance(v, dict) for v in values), 'Criterion must be an object')
        require(all(isinstance(v.get('id'), str) for v in values), 'Criterion id must be text')
        require({v.get('id') for v in values} == set(WEIGHTS), 'Unknown/duplicate/missing criterion')
        for row in values:
            require(set(row) == {'id', 'status', 'rationale', 'evidence', 'decisions'}, 'Criterion requires decisions, never score/algorithm/agent_score')
            status = row.get('status')
            require(status in ('assessed', 'partial', 'unavailable'), 'Invalid criterion status')
            text_field(row, 'rationale')
            citations(row)
            decisions = row['decisions']
            expected = set(scoring.DECISIONS[row['id']])
            require(isinstance(decisions, list) and len(decisions) == len(expected) and all(isinstance(d, dict) for d in decisions), 'Complete fixed decision set required')
            require(all(isinstance(d.get('id'), str) for d in decisions), 'Decision id must be text')
            require({d.get('id') for d in decisions} == expected, 'Missing/duplicate/unknown decision')
            fact = calculated[row['id']]
            unknown = fact['algorithm'] is None
            for decision in decisions:
                require(set(decision) == {'id', 'value', 'rationale', 'evidence'}, 'Decision requires value/rationale/evidence only')
                value = decision['value']
                valid = isinstance(value, str) and value in scoring.CATEGORIES if row['id'] == 'node_labels' else type(value) is bool
                require(value is None or valid, 'Decision must be binary or a fixed naming category')
                text_field(decision, 'rationale')
                citations(decision)
                unknown = unknown or value is None
                if decision['id'] in fact['forced']:
                    require(value == fact['forced'][decision['id']], 'Decision contradicts calculated source rule: ' + decision['id'])
            require((status == 'unavailable') == unknown, 'Unavailable requires missing algorithm or semantic decision; fixed 50:50 cannot be reweighted')
            if status == 'assessed':
                require(not fact['limitations'], 'Observable limitations require partial coverage')

    text_field(assessment, 'summary')
    rows(assessment, 'structure', required=True)
    rows(assessment, 'strengths')
    recommendations(assessment)
    rows(assessment, 'findings')
    for finding in assessment['findings']:
        require(finding.get('priority') in ('P1', 'P2', 'P3'), 'Invalid priority')
        require(finding.get('confidence') in ('confirmed', 'inference'), 'Invalid finding confidence')
        text_field(finding, 'action')
    calculated = evidence['calculated']
    criteria(assessment, calculated['package'])
    modules = assessment.get('modules')
    require(isinstance(modules, list) and len(modules) == len(evidence['modules']), 'Every own module needs diagnostics')
    require(all(isinstance(m, dict) for m in modules), 'Module diagnostics must be objects')
    require(all(isinstance(m.get('id'), str) for m in modules), 'Module id must be text')
    require({m.get('id') for m in modules} == {m['id'] for m in evidence['modules']}, 'Unknown/duplicate/missing module')
    for module in modules:
        require(not any(key in module for key in ('score', 'algorithm', 'agent_score')), 'Ready module scoring fields are forbidden')
        text_field(module, 'summary')
        criteria(module, next(m['criteria'] for m in calculated['modules'] if m['id'] == module['id']))
        for criterion in module['criteria']:
            require(any(v.startswith(module['id'].split('#', 1)[0] + '#') for v in criterion['evidence']), 'Module criterion needs own-module evidence')
        recommendations(module, module['id'])


def evaluated(evidence, assessment):
    """Scores exist only in this program-owned copy, never in agent input."""
    check_assessment(assessment, evidence)
    result = copy.deepcopy(assessment)
    with localcontext() as context:
        context.prec = 50
        for owner, module in [(result, None)] + [(m, m['id']) for m in result['modules']]:
            calculated = scoring.facts(evidence, module)
            for row in owner['criteria']:
                values = [decision['value'] for decision in row['decisions']]
                if row['status'] == 'unavailable':
                    row['score'] = None
                else:
                    semantic = scoring.CATEGORIES[values[0]] if row['id'] == 'node_labels' else sum(values)
                    row['score'] = scoring.quality(calculated[row['id']]['algorithm'], semantic, scoring.MAXIMA[row['id']])
    return result


def esc(value):
    # Source and assessment prose stay inline data, including in tables.
    value = html.escape(str(value), quote=False).replace('\r', ' ').replace('\n', ' ')
    value = re.sub(r'([\\`*_~\[\]|])', r'\\\1', value)
    value = re.sub(r'^(\s{0,3})(#{1,6})(?=\s|$)', lambda match: match.group(1) + '\\' + match.group(2), value)
    value = re.sub(r'^(\s{0,3})([-+])(?=\s)', r'\1\\\2', value)
    value = re.sub(r'^(\s{0,3}\d{1,9})([.)])(?=\s)', r'\1\\\2', value)
    if re.fullmatch(r'\s{0,3}(?:-\s*){3,}', value):
        value = value[:len(value) - len(value.lstrip())] + '\\' + value.lstrip()
    return value


def rounded(value):
    return str(Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def allocate_cents(values, target):
    """Largest remainder, stable criterion order resolves equal remainders."""
    floors = [int((v * 100).to_integral_value(rounding=ROUND_FLOOR)) for v in values]
    missing = int(target * 100) - sum(floors)
    order = sorted(range(len(values)), key=lambda i: values[i] * 100 - floors[i], reverse=True)
    for index in order[:missing]:
        floors[index] += 1
    return [Decimal(v) / 100 for v in floors]


def score_parts(criteria):
    with localcontext() as context:
        context.prec = 50
        keys = [key for key in WEIGHTS if criteria[key]['score'] is not None]
        active = sum((Decimal(str(WEIGHTS[key])) for key in keys), Decimal(0))
        if not active:
            return None, {}, {}
        weights = [Decimal(str(WEIGHTS[key])) / active * 100 for key in keys]
        contributions = [Decimal(str(WEIGHTS[key])) * Decimal(str(criteria[key]['score'])) / active for key in keys]
        total = sum((Decimal(str(WEIGHTS[key])) * Decimal(str(criteria[key]['score'])) for key in keys), Decimal(0)) / active
        displayed_total = total.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
        return total, dict(zip(keys, allocate_cents(weights, Decimal('100.00')))), dict(zip(keys, allocate_cents(contributions, displayed_total)))


BANDS = [(0, 'Неудовлетворительно', '0–30'), (30, 'Удовлетворительно', '30–50'),
         (50, 'Хорошо', '50–70'), (70, 'Отлично', '70–85'), (85, 'Превосходно', '85–100')]


def band_index(score):
    return max(index for index, (lower, _, _) in enumerate(BANDS) if score >= lower)


def inline_code(value):
    """CommonMark code span; padding preserves literal edge spaces/backticks."""
    value = str(value).replace('\r', ' ').replace('\n', ' ')
    fence = '`' * (max((len(run) for run in re.findall(r'`+', value)), default=0) + 1)
    padding = ' ' if value.strip(' ') and (value.startswith((' ', '`')) or value.endswith((' ', '`'))) else ''
    return fence + padding + value + padding + fence


def prose(value, table=False):
    """Only complete quotations become code; GFM table pipes need escaping."""
    parts = re.split(r'(«[^«»]+»)', str(value))
    rendered = []
    for part in parts:
        if part.startswith('«') and part.endswith('»'):
            name = part[1:-1].replace('|', r'\|') if table else part[1:-1]
            rendered.append(inline_code(name))
        else:
            rendered.append(esc(part))
    return ''.join(rendered)


def display_chains(objects):
    """Shortest unambiguous suffix; aliases share the same complete identity."""
    def identity(obj):
        return (obj['module'], tuple(p[0] for p in obj['submodels']), tuple(p[0] for p in obj['objects']))

    def names(parts):
        return tuple((kind, name) for _, kind, name in parts)

    result = {}
    for target, obj in objects.items():
        chain = obj['submodels']
        length = min(1, len(chain))
        while length < len(chain):
            suffix = names(chain[-length:])
            ambiguous = any(identity(other) != identity(obj) and other['module'] == obj['module']
                            and names(other['objects']) == names(obj['objects'])
                            and names(other['submodels'][-length:]) == suffix
                            for other in objects.values())
            if not ambiguous:
                break
            length += 1
        result[target] = chain[-length:] if length else ()
    return result


def subject_objects(evidence):
    """Exact domain identities, never inferred from evidence strings or display names."""
    modules = {m['id']: m for m in evidence['modules']}
    scopes = {s['id']: s for s in evidence['scopes']}
    nodes = {n['id']: n for n in evidence['nodes']}
    locations = {}
    chains = {}

    def own(record):
        origin = record.get('provenance', {}).get('BasePackageGuid')
        package = evidence['package'].get('guid')
        return not origin or bool(package and origin.casefold() == package.casefold())

    def materialized(record):
        return own(record) and not any(k in record.get('provenance', {})
                                       for k in ('__deleted', '__derived', '__baseGuid'))

    def resolved_scope(identity):
        scope = scopes[identity]
        owner = nodes.get(scope['owner'])
        return (not scope['explicitly_deleted'] and materialized(scope)
                and (owner is None or (own(owner) and owner['active_state'] == 'observed_materialized'))
                and (scope['parent_scope'] not in scopes or resolved_scope(scope['parent_scope'])))

    def label(node):
        return node['label'] or node['service_name'] or 'Без метки'

    def chain(identity):
        if identity not in chains:
            scope = scopes[identity]
            parent = chain(scope['parent_scope']) if scope['parent_scope'] in scopes else ()
            owner = nodes.get(scope['owner'])
            part = ((scope['id'], 'Подмодель', label(owner)),) if owner else (
                ((scope['id'], 'Общая подмодель', 'Без метки'),) if scope['kind'] == 'catalog_definition' else ())
            chains[identity] = parent + part
        return chains[identity]

    def add(identity, module, submodels=(), objects=()):
        locations[identity] = {'module': module, 'submodels': submodels, 'objects': objects}

    for identity in modules:
        add(identity, identity)
    for scope in scopes.values():
        if resolved_scope(scope['id']):
            add(scope['id'], scope['module'], chain(scope['id']))
    children = {s['owner']: s for s in scopes.values() if s['owner'] and not s['explicitly_deleted']}
    for node in nodes.values():
        if node['active_state'] != 'observed_materialized' or not own(node) or not resolved_scope(node['scope']):
            continue
        if node['id'] in children:
            add(node['id'], node['module'], chain(children[node['id']]['id']))
        else:
            add(node['id'], node['module'], chain(node['scope']), ((node['id'], 'Узел', label(node)),))
        for field in node['fields']:
            base = locations[node['id']]
            add(field['locator'], base['module'], base['submodels'], base['objects'] + ((field['locator'], 'Поле', field['name'] or 'Без имени'),))
    for note in evidence['notes']:
        if note['explicitly_deleted'] or not materialized(note) or not resolved_scope(note['scope']):
            continue
        title = next((line.strip() for line in note['text'].splitlines() if line.strip()), 'Без текста')
        title = re.sub(r'^#{1,6}(?:\s+|$)', '', title)
        title = re.sub(r'\s+#+\s*$', '', title)
        title = re.sub(r'(?<!\*)\*\*(?=\S)(.+?)(?<=\S)\*\*(?!\*)', r'\1', title)
        title = re.sub(r'(`+)(.+?)\1', lambda m: m.group(2).strip(), title)
        sentence = re.search(r'^.*?[.!?](?=\s|$)', title)
        if sentence:
            title = sentence.group(0)
        if len(title) > 80:
            title = title[:79] + '…'
        add(note['locator'], scopes[note['scope']]['module'], chain(note['scope']), ((note['locator'], 'Заметка', title),))
    for variable in evidence['variables']:
        if variable['node']:
            base = locations.get(variable['node'])
        elif variable['scope'] in scopes:
            base = locations.get(variable['scope'])
        else:
            base = {'module': None, 'submodels': (), 'objects': ()} if variable.get('ownership') == 'package' else None
        if base is not None and materialized(variable):
            add(variable['locator'], base['module'], base['submodels'], base['objects'] + (
                (variable['locator'], 'Переменная', variable['label'] or variable['name'] or 'Без имени'),))
    return locations


def recommendation_blocks(rows, evidence, current_module=None):
    lines = []
    for row in rows:
        # Legacy steps stay in the same item; context is supplied by the author.
        parts = [row['text']] + row.get('steps', [])
        lines += ['- ' + ' '.join(prose(part) for part in parts), '']
    return lines


def render(evidence, assessment):
    assessment = evaluated(evidence, assessment)
    source = evidence['source']
    criteria = {r['id']: r for r in assessment['criteria']}
    total, weights, contributions = score_parts(criteria)
    provisional = (any(r['status'] != 'assessed' for r in criteria.values())
                   or any(r['status'] != 'assessed' for m in assessment['modules'] for r in m['criteria'])
                   or bool(evidence['coverage']) or any(r['status'] != 'resolved' for r in evidence['relations'])
                   or any(e['status'] != 'resolved' for e in evidence['links']))
    timestamp = datetime.fromisoformat(assessment['analysis_at'].replace('Z', '+00:00')) if 'analysis_at' in assessment else datetime.now(timezone.utc)
    offset = timestamp.strftime('%z')
    date = timestamp.strftime('%d.%m.%Y, %H:%M') + ' (' + offset[:3] + ':' + offset[3:] + ')'
    def score(row):
        return rounded(row['score']) if row['score'] is not None else 'Не оценено'

    name = Path(source['path']).name
    lines = ['# Отчёт о качестве пакета «' + esc(name) + '»', '', '| | |', '|---|---|',
             '| **Пакет** | ' + esc(name) + ' |', '| **Дата анализа** | ' + date + ' |',
             '| **Модулей проанализировано** | ' + str(len(evidence['modules'])) + ' |', '', '## Итоговая оценка', '']
    if total is None:
        lines += ['**Не оценено: недостаточно сведений для итогового балла.**', '']
        if not evidence['calculated']['package']['structure']['metrics']['total']:
            lines += ['В файле не найдено доступного содержимого сценария для оценки.', '']
    else:
        active_band = band_index(total)
        lines += ['**' + rounded(total) + ' / 100 — ' + BANDS[active_band][1] + '**', '']
        if band_index(Decimal(rounded(total))) != active_band:
            lines += ['До округления итог ниже ' + str(BANDS[active_band + 1][0]) + ', поэтому уровень — «' + BANDS[active_band][1] + '».', '']
    if provisional:
        lines += ['**Предварительная оценка.** Оценена доступная часть сведений о пакете.', '']
    active_band = band_index(total) if total is not None else None
    lines += ['| ' + ' | '.join('**' + label + '**' if i == active_band else label for i, (_, label, _) in enumerate(BANDS)) + ' |',
              '|' + '|'.join([':---:'] * 5) + '|',
              '| ' + ' | '.join(interval + (' ◄' if i == active_band else '') for i, (_, _, interval) in enumerate(BANDS)) + ' |', '',
              'Граничный балл относится к следующему уровню; 100 — к последнему.', '',
              'Оценки по четырём направлениям для пакета в целом:', '',
              '| ' + ' | '.join(LABELS.values()) + ' | **Итого** |',
              '|' + '|'.join([':---:'] * 5) + '|',
              '| ' + ' | '.join(score(criteria[key]) for key in WEIGHTS) + ' | **' + (rounded(total) if total is not None else 'Не оценено') + '** |', '',
              'Разбор с весами:', '', '| Критерий | Вес | Вклад в итог | Балл / 100 |',
              '|---|---:|---:|---:|']
    for key in WEIGHTS:
        row = criteria[key]
        lines.append('| ' + LABELS[key] + ' | ' +
                     (rounded(weights[key]) + '%' if key in weights else '—') + ' | ' +
                     (rounded(contributions[key]) if key in contributions else '—') + ' | ' + score(row) + ' |')
    lines += ['', 'Неоценённые направления не входят в итог; веса остальных приведены к 100%.', '', '## Заключение', '', prose(assessment['summary']), '']
    for title, key in [('Сильные стороны', 'strengths'), ('Слабые стороны', 'findings')]:
        lines += ['', '### ' + title, '']
        lines += ['- ' + prose(row['text']) for row in assessment[key]]
        if not assessment[key]:
            lines.append('Не отмечены.')

    lines += ['', '### Что исправить', '']
    lines += recommendation_blocks(assessment['recommendations'], evidence) if assessment['recommendations'] else ['Рекомендации не предложены.']

    for index, module in enumerate(evidence['modules'], 1):
        diagnostic = next(m for m in assessment['modules'] if m['id'] == module['id'])
        rows = {r['id']: r for r in diagnostic['criteria']}
        lines += ['', '## Модуль ' + str(index) + '. ' + inline_code(module['name']), '', '**Роль в пакете:** ' + prose(diagnostic['summary']), '',
                  '| № | Критерий | Балл / 100 | Комментарий |', '|---:|---|---:|---|']
        for number, key in enumerate(WEIGHTS, 1):
            row = rows[key]
            lines.append('| ' + str(number) + ' | ' + LABELS[key] + ' | ' + score(row) + ' | ' + prose(row['rationale'], table=True) + ' |')
        if diagnostic['recommendations']:
            lines += ['', '### Рекомендации', ''] + recommendation_blocks(diagnostic['recommendations'], evidence, module['id'])
        lines.append('')
    lines += ['## Ограничения проверки', '']
    if criteria['variables']['status'] == 'unavailable':
        lines += ['- Именование переменных не удалось оценить полностью; направление исключено из итога.']
    if (any(r['status'] != 'resolved' for r in evidence['relations'])
            or any(e['status'] != 'resolved' for e in evidence['links'])):
        lines += ['- Часть связей между узлами или пакетами нельзя установить по файлу.']
    lines += ['- Выполнение сценария и правильность расчётов не проверялись.', '']
    return '\n'.join(lines)


def report(source, assessment, output=None):
    evidence = inspect(source)
    check_assessment(assessment, evidence)
    source_path = Path(evidence['source']['path'])
    output = safe_path(output if output is not None else source_path.with_name(source_path.stem + '_lint.md'))
    require(output != source_path and not output.exists(), 'Output already exists or aliases source')
    require(output.suffix.lower() == '.md', 'Output must have .md extension')
    content = render(evidence, assessment)
    require(hashlib.sha256(source_path.read_bytes()).hexdigest() == evidence['source']['sha256'], 'Source changed before report write')
    try:
        with output.open('x', encoding='utf-8', newline='\n') as stream:
            stream.write(content)
    except OSError as exc:
        raise ValueError('Cannot create new report: ' + str(exc)) from exc
    return output


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    first = commands.add_parser('inspect')
    first.add_argument('input')
    second = commands.add_parser('report')
    second.add_argument('input')
    second.add_argument('--assessment', required=True)
    second.add_argument('--output')
    args = parser.parse_args(argv)
    try:
        if args.command == 'inspect':
            print(json.dumps(inspect(args.input), ensure_ascii=False, indent=2, allow_nan=False))
        else:
            with open(args.assessment, encoding='utf-8') as stream:
                assessment = json.load(stream)
            print(report(args.input, assessment, args.output))
        return 0
    except (ValueError, OSError) as exc:
        print('package-linter: ' + str(exc), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
