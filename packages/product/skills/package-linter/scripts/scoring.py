"""Quality assessment formulae; factual inputs and semantic decisions stay separate."""
from collections import Counter
from decimal import Decimal, localcontext
import re

MAXIMA = {'structure': 3, 'notes': 2, 'node_labels': 2, 'variables': 3}
DECISIONS = {'structure': ('modularity', 'balance', 'depth'), 'notes': ('adequacy', 'substance'),
             'node_labels': ('naming_category',), 'variables': ('style', 'labels', 'meaning')}
CATEGORIES = {'good': 2, 'systemic': 1, 'critical': 0}


def clamp(value):
    return max(Decimal(0), min(Decimal(1), value))


def structure_coefficient(maximum, overcrowded, critical, flat, deep, suspicious):
    penalty = Decimal(0)
    if maximum >= 40:
        penalty += min(Decimal('.4'), Decimal('.2') + Decimal(maximum - 40) / 80 * Decimal('.2'))
    elif maximum >= 25:
        penalty += Decimal(maximum - 25) / 15 * Decimal('.2')
    penalty += min(Decimal('.3'), Decimal('.15') * critical)
    penalty += min(Decimal('.15'), Decimal('.05') * overcrowded)
    penalty += Decimal('.2') * flat + Decimal('.1') * deep
    penalty += min(Decimal('.15'), Decimal('.03') * suspicious)
    return clamp(1 - penalty)


def notes_coefficient(total, notes, trivial):
    if not total:
        return Decimal(1)
    penalty = Decimal(0)
    if not notes:
        penalty = Decimal('.4') if total >= 15 else Decimal('.15')
    else:
        ratio = Decimal(notes) / total
        if total >= 15:
            penalty += Decimal('.25') if ratio < Decimal('.1') else Decimal('.15') if ratio < Decimal('.2') else Decimal('.05') if ratio < Decimal('.3') else 0
        share = Decimal(trivial) / notes
        penalty += Decimal('.15') if share > Decimal('.5') else Decimal('.05') if share > Decimal('.3') else 0
    return clamp(1 - penalty)


def file_type(vendor):
    return any(word in vendor.lower() for word in ('экспорт', 'импорт', 'файл'))


def file_extension(label):
    return bool(re.search(r'\.\w{2,5}$', label.strip()))


def partial_repeat(label, vendor):
    words = set(vendor.lower().split())
    return bool(words) and len(words & set(label.lower().split())) * 2 >= len(words)


def too_short(label):
    return len(label.strip()) < 5


def nodes_coefficient(system_share, unrenamed_file, no_extension, duplicates, partial, short):
    return clamp(1 - min(system_share / Decimal('.20'), Decimal(1)) * Decimal('.4')
                 - Decimal('.2') * unrenamed_file - Decimal('.1') * sum((no_extension, duplicates, partial, short)))


def detect_style(name):
    if not name:
        return 'other'
    upper, lower = any(c.isupper() for c in name), any(c.islower() for c in name)
    if '_' in name and not upper:
        return 'snake_case'
    if not upper and name.isalnum():
        return 'ambiguous_lower'
    if not lower and name.isalnum():
        return 'ambiguous_upper'
    if name[0].islower() and upper:
        return 'camelCase'
    if name[0].isupper():
        return 'PascalCase'
    return 'other'


def variable_style(names):
    classified = [detect_style(name) for name in names]
    explicit = [style for style in classified if style in ('camelCase', 'snake_case', 'PascalCase')]
    if not explicit:
        return True, 'undefined', []
    counts = Counter(explicit)
    dominant = max(counts, key=counts.get)  # Counter retains first occurrence for a tie.
    violations = [i for i, style in enumerate(classified) if style in ('camelCase', 'snake_case', 'PascalCase') and style != dominant]
    if dominant == 'PascalCase':
        violations += [i for i, style in enumerate(classified) if style == 'ambiguous_lower']
    return not violations, dominant, violations


def variables_coefficient(total, violations, cyrillic):
    if not total:
        return None
    return clamp(1 - Decimal('.5') * Decimal(violations) / total - Decimal('.5') * (1 - Decimal(cyrillic) / total))


def quality(algorithm, semantic, maximum):
    return 50 * (algorithm + Decimal(semantic) / maximum)


def facts(evidence, module=None):
    """Own screens are counted once; separate module roots never add depth."""
    scopes = [s for s in evidence['scopes'] if (module is None or s['module'] == module) and not s.get('explicitly_deleted')]
    scope_ids = {s['id'] for s in scopes}
    nodes = [n for n in evidence['nodes'] if n['scope'] in scope_ids and n['kind'] == 'node'
             and n['guid'] and n['provenance'].get('__deleted', '').lower() not in ('true', '1')]
    node_ids = {n['id'] for n in nodes}
    by_scope = {s['id']: [n for n in nodes if n['scope'] == s['id']] for s in scopes}
    children = {n['id']: [s for s in scopes if s['owner'] == n['id']] for n in nodes}
    scope_by_id = {s['id']: s for s in scopes}

    def depth(scope):
        if not scope['owner'] or scope['parent_scope'] not in scope_by_id:
            return 0
        return depth(scope_by_id[scope['parent_scope']]) + 1

    def root_context(scope):
        while scope['parent_scope'] in scope_by_id:
            scope = scope_by_id[scope['parent_scope']]
        return scope['id']

    counts = [len(by_scope[s['id']]) for s in scopes]
    total, maximum = len(nodes), max(counts, default=0)
    independent_roots = len({root_context(scope_by_id[node['scope']]) for node in nodes})
    nesting = max((depth(s) for s in scopes), default=0)
    overcrowded = sum(25 <= count < 40 for count in counts)
    critical = sum(count >= 40 for count in counts)
    flat = total >= 25 and maximum * 10 >= total * 7
    deep = nesting > 5
    submodels = [s for s in scopes if s['owner'] in node_ids or s['kind'] == 'catalog_definition' and not s['owner']]
    small, suspicious, small_details = 0, 0, []
    for scope in submodels:
        direct = by_scope[scope['id']]
        if len(direct) > 2 or any(children[n['id']] for n in direct):
            continue
        small += 1
        owner = next((n for n in nodes if n['id'] == scope['owner']), None)
        targets = {scope['id']} | ({owner['id']} if owner else set())
        callers = sum(r['status'] == 'resolved' and r['kind'] in ('node_reference', 'vendor_instance')
                      and bool(targets.intersection(r['targets'])) for r in evidence['relations'])
        incoming, outgoing = (len(owner['incoming']), len(owner['outgoing'])) if owner else (0, 0)
        roles = []
        unknown_role = owner is not None and owner['active_state'] == 'unknown_delta' or owner is None and not callers
        if unknown_role:
            roles.append('unknown')
        elif callers:
            roles.append('reused')
        if not unknown_role and incoming >= 2:
            roles.append('convergence')
        if not unknown_role and outgoing >= 2:
            roles.append('divergence')
        if not unknown_role and incoming and not outgoing:
            roles.append('terminal')
        if not unknown_role and outgoing and not incoming:
            roles.append('source')
        if not roles:
            roles.append('linear' if incoming == outgoing == 1 else 'isolated')
            suspicious += 1
        small_details.append({'scope': scope['id'], 'roles': roles, 'demand': 'unknown'})
    limitations = []
    if any(n['active_state'] == 'unknown_delta' for n in evidence['nodes'] if n['scope'] in scope_ids):
        limitations.append('incomplete_active_content')
    if any(r['status'] != 'resolved' and (module is None or r['consumer'].startswith(module.split('#')[0] + '#')) for r in evidence['relations']):
        limitations.append('unresolved_dependencies')
    if any(e['status'] != 'resolved' and e['scope'] in scope_ids for e in evidence['links']):
        limitations.append('unresolved_links')
    if any('isolated' in row['roles'] for row in small_details):
        limitations.append('isolated_submodel_demand_unknown')
    if any('unknown' in row['roles'] for row in small_details):
        limitations.append('unavailable_parent_role')
    structure_forced = {}
    single_large_context = independent_roots == 1 and total >= 25
    if flat or single_large_context and not submodels:
        structure_forced['modularity'] = False
    if critical or overcrowded >= 2:
        structure_forced['balance'] = False
    if deep or suspicious >= 2 or nesting == 0 and single_large_context:
        structure_forced['depth'] = False
    structure = {'algorithm': structure_coefficient(maximum, overcrowded, critical, flat, deep, suspicious) if nodes else None,
                 'forced': structure_forced, 'limitations': limitations,
                 'metrics': {'total': total, 'maximum': maximum, 'screens': counts, 'depth': nesting,
                             'independent_roots': independent_roots,
                             'overcrowded': overcrowded, 'critical': critical, 'flat_large': flat,
                             'too_deep': deep, 'submodels': len(submodels), 'small': small,
                             'suspicious_small': suspicious, 'small_roles': small_details}}
    notes = [n for n in evidence['notes'] if n['scope'] in scope_ids and n['text'].strip() and not n.get('explicitly_deleted')
             and n['provenance'].get('__deleted', '').lower() not in ('true', '1')]
    trivial = sum(len(n['text'].strip()) < 20 for n in notes)
    note_forced = {}
    if not notes:
        note_forced.update(adequacy=total < 15, substance=False)
    elif trivial * 2 >= len(notes) or total >= 15 and len(notes) * 10 < total:
        note_forced['adequacy'] = False
    note_limits = ['inherited_notes'] if any(n['provenance'] for n in notes) else []
    if not total:
        note_limits.append('no_observed_content')
    note_facts = {'algorithm': notes_coefficient(total, len(notes), trivial) if total else None,
                  'forced': note_forced, 'limitations': note_limits,
                  'metrics': {'total': total, 'notes': len(notes), 'trivial': trivial,
                              'density': str(Decimal(len(notes)) / total) if total else '0',
                              'trivial_share': str(Decimal(trivial) / len(notes)) if notes else '0'}}
    known = [n for n in nodes if n.get('vendor_name') and n.get('label') is not None and (n.get('generated_title') or '').lower() not in ('true', '1')]
    renamed = [n for n in known if n['label'].strip() != n['vendor_name'].strip()]
    system_count = len(known) - len(renamed)
    unrenamed_file = any(file_type(n['vendor_name']) for n in known if n not in renamed)
    no_extension = any(file_type(n['vendor_name']) and not file_extension(n['label']) for n in renamed)
    duplicate_counts = Counter((n['module'], n['label']) for n in renamed)
    duplicate = any(count > 1 for count in duplicate_counts.values())
    partial = any(partial_repeat(n['label'], n['vendor_name']) for n in renamed)
    short = any(too_short(n['label']) for n in renamed)
    name_limits = ['incomplete_type_or_title'] if len(known) != len(nodes) else []
    if any(n['active_state'] == 'unknown_delta' for n in nodes):
        name_limits.append('incomplete_active_content')
    node_facts = {'algorithm': nodes_coefficient(Decimal(system_count) / total, unrenamed_file, no_extension, duplicate, partial, short) if total and len(known) == total else None,
                  'forced': {'naming_category': 'critical'} if unrenamed_file or system_count * 2 > total else {},
                  'limitations': name_limits,
                  'metrics': {'total': total, 'known_types': len(known), 'system_names': system_count,
                              'unrenamed_file': unrenamed_file, 'missing_extension': no_extension,
                              'duplicates': duplicate, 'partial_repeats': partial, 'too_short': short}}
    # A fallback socket declaration may occur twice in evidence; its source address is one observation.
    variable_rows = [v for v in evidence['variables'] if v['scope'] in scope_ids or module is None and v.get('ownership') == 'package']
    variables = list({v['locator']: v for v in variable_rows if v.get('provenance', {}).get('__deleted', '').lower() not in ('true', '1')}.values())
    names = [v['name'] or '' for v in variables]
    consistent, dominant, violations = variable_style(names)
    cyrillic = sum(bool(re.search('[а-яА-ЯёЁ]', v['label'] or '')) for v in variables)
    var_forced = {'style': consistent, 'labels': cyrillic * 10 >= len(variables) * 7} if variables else {}
    always_poor = sum(bool(re.fullmatch(r'[a-zA-Z]|var\d+|tmp|field\d+|obj', name, re.I)) for name in names)
    if variables and always_poor * 2 >= len(variables):
        var_forced['meaning'] = False
    variable_limits = ['opaque_variable_uses'] if any(s['variable_visibility'] == 'unknown' for s in scopes) else []
    if any(any(key in v.get('provenance', {}) for key in ('__baseGuid', '__derived')) for v in variables):
        variable_limits.append('inherited_variables')
    variable_facts = {'algorithm': variables_coefficient(len(variables), len(violations), cyrillic),
                      'forced': var_forced, 'limitations': variable_limits,
                      'metrics': {'total': len(variables), 'style_consistent': consistent, 'dominant_style': dominant,
                                  'style_violations': [variables[i]['locator'] for i in violations],
                                  'cyrillic': cyrillic, 'cyrillic_dominance': var_forced.get('labels'),
                                  'always_poor': always_poor}}
    return {'structure': structure, 'notes': note_facts, 'node_labels': node_facts, 'variables': variable_facts}


def json_facts(evidence):
    def serial(rows):
        return {key: {**row, 'algorithm': str(row['algorithm']) if row['algorithm'] is not None else None} for key, row in rows.items()}
    with localcontext() as context:
        context.prec = 50
        return {'package': serial(facts(evidence)), 'modules': [
            {'id': module['id'], 'criteria': serial(facts(evidence, module['id']))} for module in evidence['modules']]}
