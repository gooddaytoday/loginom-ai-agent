"""Audit direct restoration of Loginom's empty default datetime mask.

Each field needs its own Apply, independent reopen/readback, then Cancel.
The surrounding verifier supplies raw, owner-checked observation readers.
"""


def verify_default_datetime_restoration(observations, mutations, table, after_step, fields,
        defaults, proof, *, before, control, owned, dialog, definitions, selected):
    if not defaults:
        return ([], set()) if proof in (None, []) else (['datetime_restoration_unrequested'], set())
    modal = table['table_tid'] + ';ModalWindow_BrowseFormat'
    open_tid = table['table_tid'] + ';btnDataGridFormat'
    tail = [(n, a) for n, a, _ in mutations if n > after_step]
    cursor, allowed, projected = 0, set(), []
    try:
        for target, settings in defaults:
            def segment(verify):
                nonlocal cursor
                if cursor >= len(tail): raise ValueError('datetime_restoration_missing_open')
                start, action = tail[cursor]
                e = control(start, action)
                if (action.get('verb') != 'click' or e.get('tid') != open_tid
                        or 'click' not in e.get('allowed_actions', []) or not owned(before(start))
                        or before(start).get('ui', {}).get('dialogs') != []):
                    raise ValueError('datetime_restoration_open_owner')
                allowed.add(start); cursor += 1
                filled, committed, chosen = False, False, False
                end_tid = modal + (';btnCancel' if verify else ';btnApply')
                while cursor < len(tail):
                    n, a = tail[cursor]; s, e = before(n), control(n, a)
                    tid, verb = e.get('tid') or e.get('identity', {}).get('anchor_tid', ''), a.get('verb')
                    if not dialog(s) or verb not in e.get('allowed_actions', []):
                        raise ValueError('datetime_restoration_mutation_owner')
                    fmt = s['table_settings']['format']; sel = fmt.get('selected_datetime', {})
                    same = sel.get('source_index') == target['source_index'] and sel.get('name_key') == target['name_key']
                    if tid == end_tid and verb == 'click':
                        if not chosen or not same or (not verify and not committed):
                            raise ValueError('datetime_restoration_final_selection')
                        readback = selected([(n, s)], target)
                        expected = settings if verify else dict(settings, custom=True)
                        if not readback or readback[-1][1] != expected:
                            raise ValueError('datetime_restoration_persisted_settings')
                        allowed.add(n); cursor += 1
                        closed = [state for step, state in observations if step > n
                                  and (cursor == len(tail) or step < tail[cursor][0])
                                  and owned(state) and state.get('ui', {}).get('dialogs') == []]
                        if not closed: raise ValueError('datetime_restoration_not_closed')
                        states = [(step, state) for step, state in observations if start < step < n and dialog(state)]
                        seen = definitions(states, True)
                        for actual, original in zip(seen, fields):
                            if {k:v for k,v in actual.items() if k != 'format_string'} != {k:v for k,v in original.items() if k != 'format_string'}:
                                raise ValueError('datetime_restoration_definition_identity')
                            pending = {f['source_index'] for f, _ in defaults[len(projected)+(1 if verify else 0):]}
                            mask = 'yyyy-mm-dd hh:nn:ss.zzz' if actual['source_index'] in pending else original['format_string']
                            # Before Apply the edited field can still have its old
                            # cache mask. Reopened metadata must be fully restored.
                            if (verify or actual['source_index'] != target['source_index']) and actual['format_string'] != mask:
                                raise ValueError('datetime_restoration_definition_changed')
                        return n
                    if committed or (filled and verb != 'press'):
                        raise ValueError('datetime_restoration_selection_after_clear')
                    field = e.get('table_field', {})
                    if verb == 'click' and field:
                        if field.get('source_index') != target['source_index'] or field.get('name_key') != target['name_key'] or field.get('type') != 'datetime':
                            raise ValueError('datetime_restoration_foreign_selection')
                        chosen = True
                    elif verb == 'scroll' and isinstance(tid, str) and tid.startswith(modal + ';BrowseFormat;'):
                        pass
                    elif not verify and chosen and same and verb == 'set_checked':
                        settings_refs = [sel.get(k, {}) for k in ('formatting', 'custom')]
                        if a.get('checked') is not True or not any(a.get('ref') in (v.get('input_ref'),v.get('display_ref')) and v.get('value') is False for v in settings_refs):
                            raise ValueError('datetime_restoration_checkbox')
                    elif not verify and chosen and same and verb == 'fill':
                        if filled or a.get('text') != '' or a.get('ref') != sel.get('format_string', {}).get('input_ref'):
                            raise ValueError('datetime_restoration_clear')
                        filled = True
                    elif not verify and filled and same and verb == 'press':
                        if a.get('key') != 'Tab' or a.get('ref') != sel.get('format_string', {}).get('input_ref'):
                            raise ValueError('datetime_restoration_commit')
                        committed = True
                    else:
                        raise ValueError('datetime_restoration_unexpected_mutation')
                    allowed.add(n); cursor += 1
                raise ValueError('datetime_restoration_missing_finish')
            segment(False)
            segment(True)
            projected.append(dict(index=target['source_index'], key=target['name_key'], type='datetime',
                                  settings=settings, verified_after_apply=True))
        if proof != projected:
            raise ValueError('datetime_restoration_checkpoint')
        return [], allowed
    except (KeyError, TypeError, ValueError) as error:
        return [str(error) if isinstance(error, ValueError) else 'datetime_restoration_malformed'], set()
