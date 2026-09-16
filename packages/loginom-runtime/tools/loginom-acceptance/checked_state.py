"""Independent proof of a checked-state action, using immutable browser evidence."""
from rename_effect import journal_equal

TARGET_SUFFIX = 'WizrdMCF;ImportTextFilePreviewWizard;chkParallelProcessing;ValueControl;DisplayEl'


def audit_goal(evidence, checks, prefix, mutations, require_menu=False, require_root=False, rejected_before_browser=lambda c, e: False):
    """Prove a three-step checkbox round trip in the real Text Import wizard."""
    def check(name, value):
        checks.append({'name': name, 'passed': bool(value)})
    calls = evidence['calls']
    actions = [c for c in calls if c['tool'] == prefix + 'dock_ui_action'
               and c.get('arguments', {}).get('action', {}).get('verb') == 'set_checked']
    snapshots = [(t['row'], t['result']['output']) for t in evidence['tools']
                 if isinstance(t.get('result'), dict) and isinstance(t['result'].get('output'), dict)]
    transitions = []
    for call in actions:
        prior = max((c['row'] for c in calls if c['tool'] in mutations and c['row'] < call['row']), default=-1)
        args = call.get('arguments', {})
        targets = [e for row, s in snapshots if prior < row < call['row']
                   and s.get('observation_id') == args.get('observation_id')
                   for e in s.get('ui', {}).get('elements', []) if e.get('ref') == args['action'].get('ref')]
        target = targets[0] if targets and all(e == targets[0] for e in targets) else {}
        proof = prove(call, target, evidence)
        if (proof and target.get('tid', '').endswith(TARGET_SUFFIX)
                and target.get('check_state', {}).get('source') == 'loginom_ext'):
            transitions.append(proof)
    check('three_fresh_checked_actions_bound_to_browser', len(actions) == len(transitions) == 3)
    cycle = False
    if len(transitions) == 3:
        a, b, c = transitions
        cycle = (a['tid'] == b['tid'] == c['tid'] and not a['noop'] and b['noop'] and not c['noop']
                 and a['after'] == b['before'] == b['after'] == c['before']
                 and a['before'] == c['after'])
    check('checkbox_changed_repeated_without_click_and_restored', cycle)
    check('no_mutations_between_checked_steps_or_after_restore', bool(actions) and all(
        c in actions for c in calls if c['tool'] in mutations and c['row'] >= actions[0]['row']))
    check('no_save_or_execution', all(c.get('arguments', {}).get('action_key') == 'node.add'
          for c in calls if c['tool'] == prefix + 'dock_action_run'))
    if require_menu:
        check('context_menu_opened_and_setup_selected_from_fresh_observation',
              menu_proof(evidence, prefix, mutations, actions[0]['row'] if actions else -1, rejected_before_browser))
    if require_root:
        check('every_checked_action_uses_discovered_root_details',root_proof(evidence,prefix,actions,mutations))
    return {'schema_version': 1, 'kind': 'independent_checkbox_roundtrip_audit', 'assertions': checks,
            'all_assertions_passed': bool(checks) and all(c['passed'] for c in checks),
            'limitations': ['Proves one unsaved wizard checkbox only; no data import, apply, radio or reopen acceptance.']}


def root_proof(evidence, prefix, actions, mutations):
    if len(actions)!=3:return False
    calls=evidence['calls'];tools=evidence['tools']
    pairs={(c.get('session_id'),c.get('tool_call_id')):c for c in calls}
    def output(t):
        r=t.get('result',{})
        return r.get('output',{}) if isinstance(r,dict) and r.get('status')=='SUCCEEDED' else {}
    for action in actions:
        args=action['arguments'];prior=max((c['row'] for c in calls if c['tool'] in mutations and c['row']<action['row']),default=-1)
        verified=False
        for t in tools:
            o=output(t);root=o.get('observation_root',{});call=pairs.get((t.get('session_id'),t.get('tool_call_id')),{});a=call.get('arguments',{})
            if not (t.get('tool')==prefix+'dock_workspace_observe' and prior<call.get('row',-1)<t['row']<action['row']
                    and o.get('observation_id')==args.get('observation_id') and root.get('global_scan') is False
                    and root.get('global_guards')=='fixed_native_queries' and root.get('ref')==a.get('root_ref')
                    and o.get('ui',{}).get('truncated',{}).get('nodes') is True
                    and any(e.get('ref')==args['action']['ref'] for e in o.get('ui',{}).get('elements',[]))):continue
            for d in tools:
                discovery=output(d)
                if not (d.get('tool')==prefix+'dock_workspace_observe' and d.get('session_id')==t.get('session_id')
                        and prior<d['row']<call['row'] and discovery.get('observation_kind')=='roots'
                        and discovery.get('observation_id')==a.get('observation_id')
                        and discovery.get('scan',{}).get('detail_elements')==0):continue
                if any(e.get('ref')==root['ref'] and e.get('identity')==root.get('identity')
                       and e.get('kind')=='region' and e.get('allowed_actions')==[]
                       for e in discovery.get('ui',{}).get('elements',[])):verified=True
        if not verified:return False
    return True


def menu_proof(evidence, prefix, mutations, first_checked_row, rejected_before_browser=lambda c, e: False):
    calls = evidence['calls']
    effective = [c for c in calls if c['tool'] in mutations and not rejected_before_browser(c, evidence)]
    def bound(call):
        args = call.get('arguments', {})
        action = args.get('action', {})
        prior = max((c['row'] for c in effective if c['row'] < call['row']), default=-1)
        targets = [item for t in evidence['tools'] if prior < t['row'] < call['row']
                   and isinstance(t.get('result'), dict)
                   and t['result'].get('output', {}).get('observation_id') == args.get('observation_id')
                   for item in t['result'].get('output', {}).get('ui', {}).get('elements', [])
                   if item.get('ref') == action.get('ref')]
        if not targets or not all(t == targets[0] for t in targets): return None
        target = targets[0]
        replies = [t for t in evidence['tools'] if t.get('session_id') == call.get('session_id')
                   and t.get('tool_call_id') == call.get('tool_call_id') and t['row'] > call['row']]
        if len(replies) != 1: return None
        r = replies[0].get('result', {})
        records = [e['outcome'] for e in evidence['events'] if e.get('phase') == 'completed'
                   and e.get('operation_id') and e.get('operation_id') == r.get('operation_id')]
        if (len(records) != 1 or not journal_equal(records[0], r) or r.get('status') != 'SUCCEEDED'
                or r.get('cleanup_complete') is not True or r.get('effect_possible') is not True
                or action.get('verb') not in target.get('allowed_actions', [])
                or not any(t.get('event') == 'ui_preconditions_verified' and t.get('refs') == [action.get('ref')]
                           and t.get('verb') == action.get('verb') for t in r.get('trace', []))
                or not any(t.get('event') == 'ui_gesture_applied' and t.get('verb') == action.get('verb') for t in r.get('trace', []))):
            return None
        return target, records[0]['output']
    rights = [c for c in calls if c['tool'] == prefix+'dock_ui_action'
              and c.get('arguments', {}).get('action', {}).get('verb') == 'right_click']
    if not rights: return False
    # A label and its node open different menus. Prior observed right clicks
    # are allowed, but every one must have a real, successful browser receipt.
    if not all(bound(c) for c in rights): return False
    right = rights[-1]; opened = bound(right)
    if not opened or ';Graph;Текстовый_файл' not in opened[0].get('tid', ''): return False
    if not any(e.get('tid') == 'mn;mniSetupNode' for e in opened[1].get('ui', {}).get('elements', [])): return False
    later = [c for c in effective if right['row'] < c['row'] < first_checked_row]
    if len(later) != 1 or later[0]['tool'] != prefix+'dock_ui_action': return False
    selected = bound(later[0])
    # Rendering may finish after the click receipt. A subsequent read-only
    # observation in the same session can prove the wizard before the first
    # checked action; `later` above forbids intervening mutations.
    selected_replies = [t for t in evidence['tools'] if t.get('tool_call_id') == later[0].get('tool_call_id')
                        and t.get('session_id') == later[0].get('session_id')]
    rendered = [selected[1]] if selected else []
    if len(selected_replies) == 1:
        for t in evidence['tools']:
            if (t.get('tool') == prefix+'dock_workspace_observe'
                    and t.get('session_id') == later[0].get('session_id')
                    and selected_replies[0]['row'] < t['row'] < first_checked_row
                    and isinstance(t.get('result'), dict) and t['result'].get('status') == 'SUCCEEDED'
                    and any(c.get('tool_call_id') == t.get('tool_call_id')
                            and c.get('session_id') == t.get('session_id') and c['tool'] == t['tool']
                            and selected_replies[0]['row'] < c['row'] < t['row'] for c in calls)):
                rendered.append(t['result'].get('output', {}))
    return bool(selected and later[0]['arguments']['action']['verb'] == 'click'
                and selected[0].get('tid') == 'mn;mniSetupNode'
                and any((e.get('tid') or '').endswith(TARGET_SUFFIX)
                        for output in rendered for e in output.get('ui', {}).get('elements', [])))


def prove(call, target, evidence):
    """Return the verified transition or None. Caller proves delivery and goal scope."""
    action = call.get('arguments', {}).get('action', {})
    desired = action.get('checked')
    before = target.get('check_state', {})
    if (action.get('verb') != 'set_checked' or type(desired) is not bool
            or action.get('ref') != target.get('ref')
            or 'set_checked' not in target.get('allowed_actions', [])
            or before.get('kind') not in ('checkbox', 'radio')
            or type(before.get('indeterminate')) is not bool
            or (type(before.get('checked')) is not bool and not (
                before.get('checked') is None and before.get('indeterminate') is True))
            or (before.get('kind') == 'radio' and not desired)
            or not target.get('tid') or not target.get('identity')):
        return None
    replies = [t for t in evidence.get('tools', [])
               if t.get('session_id') == call.get('session_id')
               and t.get('tool_call_id') == call.get('tool_call_id')
               and t.get('tool') == call.get('tool') and t.get('row', -1) > call['row']]
    if len(replies) != 1:
        return None
    result = replies[0].get('result', {})
    records = [e.get('outcome', {}) for e in evidence.get('events', [])
               if e.get('phase') == 'completed' and e.get('operation_id')
               and e.get('operation_id') == result.get('operation_id')]
    if (result.get('status') != 'SUCCEEDED' or result.get('cleanup_complete') is not True
            or len(records) != 1 or not journal_equal(records[0], result)):
        return None
    raw = records[0]
    matches = [e for e in raw.get('output', {}).get('ui', {}).get('elements', [])
               if e.get('identity') == target['identity'] and e.get('tid') == target['tid']
               and e.get('label') == target.get('label')]
    if len(matches) != 1:
        return None
    after = matches[0].get('check_state', {})
    if (after.get('kind') != before['kind'] or after.get('checked') is not desired
            or after.get('indeterminate') is not False):
        return None
    trace = raw.get('trace', [])
    noop = before.get('checked') is desired and before.get('indeterminate') is False
    if (raw.get('effect_possible') is not (not noop)
            or raw.get('output', {}).get('gesture_applied') is not (not noop)
            or not any(t.get('event') == 'ui_preconditions_verified'
                       and t.get('verb') == 'set_checked' and t.get('refs') == [action['ref']]
                       for t in trace)
            or not any(t.get('event') == 'ui_state_verified' and t.get('verb') == 'set_checked'
                       and t.get('checked') is desired
                       and t.get('ref') == matches[0].get('ref') for t in trace)
            or sum(t.get('event') == 'ui_gesture_applied' for t in trace) != (0 if noop else 1)
            or any(t.get('event') == 'ui_gesture_applied' and t.get('verb') != 'set_checked' for t in trace)
            or sum(t.get('event') == 'ui_state_already_satisfied' and t.get('checked') is desired
                   for t in trace) != (1 if noop else 0)):
        return None
    return {'tid': target['tid'], 'before': before, 'after': after, 'noop': noop}
