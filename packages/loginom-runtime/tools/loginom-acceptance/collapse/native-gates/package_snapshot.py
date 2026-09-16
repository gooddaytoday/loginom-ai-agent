"""Read actual saved Loginom XML; never synthesize omitted native defaults.

This is acceptance tooling only. A snapshot is not autonomous acceptance and
must be tied to a verified native download and a fresh-session trace.
"""
from __future__ import annotations
import hashlib
import io
import zipfile
import xml.etree.ElementTree as ET

XSI = '{http://www.w3.org/2001/XMLSchema-instance}type'
MAX_PACKAGE = 262144
MAX_XML = 2097152


def tree(element):
    return {'tag': element.tag, 'attributes': dict(sorted(element.attrib.items())),
            'text': (element.text or '').strip(), 'children': [tree(c) for c in element]}


def snapshot(data: bytes):
    if not 0 < len(data) <= MAX_PACKAGE:
        raise ValueError('package byte bound')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        names = [e.filename for e in entries]
        if len(names) != len(set(names)) or len(names) > 128:
            raise ValueError('duplicate or excessive archive entries')
        units = [e for e in entries if e.filename.split('/')[-1] == 'Unit.xml']
        if len(units) != 1 or not 0 < units[0].file_size <= MAX_XML:
            raise ValueError('unique bounded Unit.xml required')
        raw = archive.read(units[0])
    text = raw.decode('utf-8-sig')
    if '<!DOCTYPE' in text.upper() or '<!ENTITY' in text.upper():
        raise ValueError('XML declarations forbidden')
    root = ET.fromstring(text)
    if root.tag != 'Unit':
        raise ValueError('native Unit root required')
    workflows = root.findall('WorkFlow')
    if len(workflows) != 1:
        raise ValueError('one workflow required')
    workflow = workflows[0]
    nodes = workflow.findall('./Nodes/Item')
    guids = [n.get('Guid') for n in nodes]
    if len(nodes) != 2 or None in guids or len(set(guids)) != 2:
        raise ValueError('exact source/collapse node pair required')
    by_type = {}
    for node in nodes:
        engine = node.find('./Component/Engine')
        if engine is None or engine.get(XSI) in by_type:
            raise ValueError('unique native engine required')
        by_type[engine.get(XSI)] = (node, engine)
    if set(by_type) != {'TBGImportTextFile', 'TBGColumnFlippingEngine'}:
        raise ValueError('unexpected native engines')
    source, source_engine = by_type['TBGImportTextFile']
    collapse, collapse_engine = by_type['TBGColumnFlippingEngine']
    links = workflow.findall('./Links/Item')
    if len(links) != 1:
        raise ValueError('one native data link required')
    link = links[0]
    endpoints = []
    for tag, node, ports in [('SourcePort', source, 'OutputPorts'),
                             ('TargetPort', collapse, 'InputPorts')]:
        endpoint = link.find(tag)
        native_ports = node.findall('./'+ports+'/Item')
        if endpoint is None or len(native_ports) != 1 or endpoint.get('NodeGuid') != node.get('Guid') or endpoint.get('PortGuid') != native_ports[0].get('Guid'):
            raise ValueError('native topology mismatch')
        endpoints.append(dict(endpoint.attrib))
    return {
        'kind': 'collapse_saved_package_snapshot_v1',
        'package_sha256': hashlib.sha256(data).hexdigest(), 'package_bytes': len(data),
        'unit_sha256': hashlib.sha256(raw).hexdigest(),
        'source_path': source_engine.get('FileName'),
        'source_guid': source.get('Guid'), 'collapse_guid': collapse.get('Guid'),
        'native_nodes': [{'guid': n.get('Guid'), 'label': n.get('DisplayName'), 'vendor': n.get('VendorGuid')} for n in nodes],
        'service_guids': [n.get('Guid') for n in workflow.findall('./ServiceNodes/Item')],
        'source_component': tree(source.find('Component')),
        'collapse_component': tree(collapse.find('Component')),
        'collapse_engine_attributes': dict(collapse_engine.attrib),
        'link': {'guid': link.get('Guid'), 'source': endpoints[0], 'target': endpoints[1]},
    }


def compare(before, after):
    """Exact native serialization equality, including absent versus explicit attrs."""
    keys = ('source_path', 'source_guid', 'collapse_guid', 'native_nodes', 'service_guids', 'source_component',
            'collapse_component', 'collapse_engine_attributes', 'link')
    if any(key not in body for body in (before, after) for key in keys):
        raise ValueError('incomplete saved native snapshot')
    mismatches = [key for key in keys if before.get(key) != after.get(key)]
    if mismatches:
        raise ValueError('saved native settings changed: '+', '.join(mismatches))
    return {'status': 'MATCH', 'compared': list(keys)}


def verify_graph(saved, native):
    expected={n['guid']:n['label'] for n in saved['native_nodes']}
    nodes=native['nodes'];links=native['links']
    if len(nodes)!=len(expected)+len(saved['service_guids']) or len({n['id'] for n in nodes})!=len(nodes):
        raise ValueError('native graph node count/identity')
    if {n['id'] for n in nodes}!=set(expected)|set(saved['service_guids']):
        raise ValueError('native graph differs from saved package nodes')
    if any(n['label']!=expected[n['id']] for n in nodes if n['id'] in expected):
        raise ValueError('native saved node label differs')
    if len(links)!=1 or links[0]['id']!=saved['link']['guid']:
        raise ValueError('native link identity differs')
    link=links[0]
    for side in ['source','target']:
        endpoint=saved['link'][side]
        if link[side]['node']!=endpoint['NodeGuid'] or link[side]['port']!=endpoint['PortGuid']:
            raise ValueError('native '+side+' endpoint differs')
    return {'status':'NATIVE_TOPOLOGY_MATCH','nodes':len(nodes),'links':len(links)}
