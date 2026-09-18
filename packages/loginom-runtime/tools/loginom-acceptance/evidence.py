"""Export only tool replies and function-call metadata; never copy model prose."""
import json
import re
import sqlite3

PREFIX = "mcp__loginom_dock__"
LOCAL_TOOLS = {PREFIX + name for name in ("dock_prepare", "dock_action_describe", "dock_action_run",
    "dock_workspace_observe", "dock_ui_action", "dock_operation_inspect", "dock_operation_recover", "dock_diagnostics", "dock_artifact_upload", "dock_artifact_verify")}
KNOWLEDGE_TOOLS = {PREFIX + name for name in ("find", "search", "read", "grep", "glob", "list", "tree")}
# Export full-node receipts without silently expanding legacy audit allowlists.
NODE_TOOLS = {PREFIX + name for name in ("dock_node_apply", "dock_node_read", "dock_node_resume", "dock_node_status",
    "dock_node_wait", "dock_node_cancel", "dock_node_stop", "dock_artifact_deliver",
    "dock_artifact_delivery_status", "dock_artifact_delivery_resume")}

def clean(value, secrets, _path=()):
    if isinstance(value, list): return [clean(x, secrets, _path+('*',)) for x in value]
    if isinstance(value, dict):
        counters={'input_tokens','output_tokens','total_tokens','cache_read_tokens','cache_write_tokens','reasoning_tokens'}
        def safe_counter(k,v):
            return (_path in [('process','usage'),('efficiency','usage_counts')] and k in counters
                    and (v is None or type(v) is int and v>=0))
        return {k: (v if safe_counter(k,v) else '[redacted]' if re.search(r'api.?key|password|token|secret|authorization|cookie', k, re.I) else clean(v,secrets,_path+(k,)))
                for k,v in value.items() if k.lower() not in ['reasoning','reasoning_content','reasoning_details','system_prompt']}
    if not isinstance(value, str): return value
    for secret in sorted((s for s in secrets if isinstance(s,str) and len(s)>3),key=len,reverse=True):
        value=value.replace(secret,'[redacted]')
    # Hermes repeat-result notes embed an args JSON fragment inside prose,
    # sometimes truncated before it becomes parseable JSON. Key redaction on
    # dictionaries alone cannot protect session capabilities in these notes.
    value=re.sub(r'''(?i)(["'][^"'\r\n]*(?:token|secret|password|api_?key|authorization|cookie)[^"'\r\n]*["']\s*:\s*["'])[^"'\r\n]*''',
                 r'\1[redacted]',value)
    value=re.sub(r'\b(?:Bearer|Basic)\s+\S+', '[redacted]', value, flags=re.I)
    value=re.sub(r'(?i)([?&](?:token|key|api_key|access_token|password)=)[^&#\s]+', r'\1[redacted]', value)
    value=re.sub(r'(https?://)[^/@\s]+:[^/@\s]+@', r'\1[redacted]@', value)
    return value

def unwrap(value, depth=0):
    """Decode transport envelopes only; never reinterpret domain string fields."""
    if depth>=16: return value
    if isinstance(value,str):
        if value.startswith('<untrusted_tool_result'):
            start=value.find('\n\n'); end=value.rfind('\n</untrusted_tool_result>')
            if start>=0 and end>start:return unwrap(value[start+2:end],depth+1)
        try: decoded=json.loads(value)
        except (ValueError,TypeError):
            # dock_prepare combines a JSON receipt and the skill in one string.
            try:decoded=json.loads(value.split('\n',1)[0])
            except (ValueError,TypeError):return value
        return unwrap(decoded,depth+1) if decoded!=value else value
    if isinstance(value,list):return [unwrap(item,depth+1) for item in value]
    if isinstance(value,dict) and set(value)=={'result'}:return unwrap(value['result'],depth+1)
    if isinstance(value,dict) and set(value)=={'Ok'}:return unwrap(value['Ok'],depth+1)
    if isinstance(value,dict) and set(value)=={'error'}:return {'isError':True,'error':unwrap(value['error'],depth+1)}
    if isinstance(value,dict) and isinstance(value.get('content'),list):
        parts=[unwrap(item.get('text'),depth+1) for item in value['content'] if isinstance(item,dict) and item.get('type')=='text']
        if value.get('isError'):
            return {'isError':True,'content':parts}
        if parts and isinstance(parts[0],dict) and ('prepared' in parts[0] or
            all(key in parts[0] for key in ('status', 'action_key', 'operation_id'))):return parts[0]
        return parts[0] if len(parts)==1 else parts
    if isinstance(value,dict) and value.get('type')=='text' and 'text' in value:return unwrap(value['text'],depth+1)
    return value

def transport_documents(value, kind, depth=0):
    if depth > 16:
        return []
    if isinstance(value, str):
        if value.startswith('<untrusted_tool_result'):
            start=value.find('\n\n'); end=value.rfind('\n</untrusted_tool_result>')
            if start>=0 and end>start:
                return transport_documents(value[start+2:end],kind,depth+1)
        try:
            decoded=json.loads(value)
        except ValueError:
            found=[]
            for line in value.splitlines():
                try: decoded=json.loads(line)
                except ValueError: continue
                found.extend(transport_documents(decoded,kind,depth+1))
            return found
        return transport_documents(decoded,kind,depth+1)
    if isinstance(value,list):
        return [context for part in value for context in transport_documents(part,kind,depth+1)]
    if isinstance(value,dict):
        if value.get('kind') == kind:
            return [value]
        return [context for key in ('result','Ok','content','text') if key in value
                for context in transport_documents(value[key],kind,depth+1)]
    return []


def recovery_contexts(value, depth=0):
    return transport_documents(value, 'dock_recovery_context', depth)


def export_history(home, secrets, *, retain_raw_tools=False):
    """Keep execution occurrences distinct; document proven compaction copies.

    Hermes replace_messages archives rows and persists the retained conversation
    with its original timestamps. Only exact copies (or the exact generic tool
    summary) across a recorded compression boundary can alias earlier evidence.
    No assistant body, compressed summary body or reasoning column is read.
    """
    path=home/'state.db'
    if not path.exists():return [],[]
    db=sqlite3.connect(f'file:{path}?mode=ro',uri=True)
    try:
        db.execute('BEGIN')
        columns={r[1] for r in db.execute('PRAGMA table_info(messages)')}
        timestamp='timestamp' if 'timestamp' in columns else 'NULL'
        active='active' if 'active' in columns else 'NULL'
        boundaries={}
        if '_compressed_summary' in columns:
            for row,session in db.execute("SELECT id,session_id FROM messages WHERE _compressed_summary=1"):
                boundaries.setdefault(session,[]).append(row)
        retained_prepare=set()
        # Hermes preserves the initial prepare pair BEFORE its summary marker.
        # Recognize only a complete, exact archived pair; never infer retries
        # from IDs or a summary-looking string alone. No prose is selected.
        if {'timestamp','active','_compressed_summary'} <= columns:
            for session,markers in boundaries.items():
                for marker in markers:
                    pair=list(db.execute("SELECT id,role,tool_calls,tool_call_id,tool_name,timestamp,active FROM messages WHERE session_id=? AND id<? ORDER BY id DESC LIMIT 2",(session,marker)))
                    if len(pair)!=2:continue
                    reply,call=pair
                    # A later compaction can archive this retained pair too.
                    # Its exact original timestamps, serialized call, reply and
                    # adjacent summary marker still distinguish it from a retry.
                    if reply[1]!='tool' or call[1]!='assistant' or reply[6] not in (0,1) or call[6]!=reply[6]:continue
                    try:items=json.loads(call[2])
                    except (ValueError,TypeError):continue
                    if not isinstance(items,list) or len(items)!=1:continue
                    item=items[0];function=item.get('function',{})
                    if function.get('name')!=PREFIX+'dock_prepare' or reply[4]!=PREFIX+'dock_prepare':continue
                    if (item.get('id') or item.get('call_id'))!=reply[3]:continue
                    old_calls=list(db.execute("SELECT id FROM messages WHERE session_id=? AND role='assistant' AND active=0 AND timestamp=? AND tool_calls=? AND id<?",(session,call[5],call[2],call[0])))
                    old_replies=list(db.execute("SELECT id,content FROM messages WHERE session_id=? AND role='tool' AND active=0 AND timestamp=? AND tool_call_id=? AND tool_name=? AND id<?",(session,reply[5],reply[3],reply[4],call[0])))
                    if len(old_calls)!=1 or len(old_replies)!=1 or old_calls[0][0]>=old_replies[0][0]:continue
                    original=old_replies[0][1]
                    content=db.execute("SELECT content FROM messages WHERE id=? AND role='tool'",(reply[0],)).fetchone()[0]
                    try:args=function.get('arguments',{});args=json.loads(args) if isinstance(args,str) else args
                    except (ValueError,TypeError):continue
                    if not isinstance(args,dict):continue
                    first=''.join(f' {k}={str(v)[:40]}' for k,v in list(args.items())[:2])
                    stub=f"[{reply[4]}]{first} ({len(original):,} chars result)"
                    if content not in (original,stub):continue
                    retained_prepare.update((session,row) for row in (call[0],reply[0]))
        def copied(original,row,session,stamp):
            return (stamp is not None and original['timestamp']==stamp and original['active']==0
                    and (any(original['row']<b<row for b in boundaries.get(session,[]))
                         or (session,row) in retained_prepare))
        calls=[];dispatch=[]
        rows=db.execute(f"SELECT id,session_id,tool_calls,{timestamp},{active} FROM messages WHERE role='assistant' AND tool_calls IS NOT NULL ORDER BY id")
        for row,session,serialized,stamp,is_active in rows:
            decoded=json.loads(serialized)
            for index,item in enumerate(decoded if isinstance(decoded,list) else []):
                function=item.get('function',{});arguments=function.get('arguments',{})
                if isinstance(arguments,str):
                    try:arguments=json.loads(arguments)
                    except ValueError:pass
                raw_args=arguments;transport=function.get('name');name=transport
                if name=='tool_call' and isinstance(arguments,dict) and isinstance(arguments.get('name'),str):
                    name=arguments['name'];arguments=arguments.get('arguments',{})
                raw_id=item.get('id') or item.get('call_id')
                originals=[d for d in dispatch if d['session']==session and d['raw_id']==raw_id
                           and d['function']==function and copied(d,row,session,stamp)]
                if originals:
                    record=originals[0]['record']
                    record.setdefault('storage_copies',[]).append({'row':row,'timestamp':stamp,'kind':'identical_call_after_compression'})
                else:
                    record={'row':row,'session_id':session,'tool_call_id':f'{raw_id}@{row}:{index}',
                            'provider_tool_call_id':raw_id,'tool':name,'arguments':arguments,
                            **({'transport_tool':transport} if transport!=name else {})}
                    calls.append(record)
                dispatch.append({'row':row,'session':session,'raw_id':raw_id,'record':record,'function':function,
                                 'raw_args':raw_args,'transport':transport,'timestamp':stamp,'active':is_active})
        tools=[];originals=[]
        rows=db.execute(f"SELECT id,session_id,tool_call_id,tool_name,content,{timestamp},{active} FROM messages WHERE role='tool' ORDER BY id")
        for row,session,raw_id,name,content,stamp,is_active in rows:
            candidates=[d for d in dispatch if d['session']==session and d['raw_id']==raw_id and d['row']<row]
            latest=max((d['row'] for d in candidates),default=-1)
            candidates=[d for d in candidates if d['row']==latest]
            call=candidates[0] if len(candidates)==1 else None
            transport=name
            if name=='tool_call' and call:name=call['record']['tool']
            if name not in LOCAL_TOOLS | NODE_TOOLS | KNOWLEDGE_TOOLS:
                # Unmatched routed replies must not disappear from the audit.
                if transport!='tool_call':continue
            identifier=call['record']['tool_call_id'] if call else f'unmatched@{row}'
            prior=[t for t in originals if t['session']==session and t['identifier']==identifier and copied(t,row,session,stamp)]
            alias=None;kind=None
            for old in prior:
                if old['content']==content:alias=old;kind='identical_reply_after_compression';break
                # Hermes compressor replaces an older repeated tool reply with this
                # exact marker. Require a later original, byte-identical reply
                # in the same archived segment; never alias an actual new call.
                if (content=='[Duplicate tool output — same content as a more recent call]'
                        and {'timestamp','active'} <= columns and isinstance(old['content'],str)
                        and db.execute("SELECT 1 FROM messages WHERE session_id=? AND role='tool' AND tool_name=? AND active=0 AND id>? AND id<? AND timestamp>? AND content=? LIMIT 1",
                            (session,transport,old['row'],row,old['timestamp'],old['content'])).fetchone()):
                    alias=old;kind=('exact_duplicate_read_marker_after_compression' if name==PREFIX+'read'
                                    else 'exact_duplicate_tool_marker_after_compression');break
                if call and isinstance(call['raw_args'],dict):
                    first=''.join(f' {k}={str(v)[:40]}' for k,v in list(call['raw_args'].items())[:2])
                    stub=f"[{call['transport']}]{first} ({len(old['content']):,} chars result)"
                    if content==stub:alias=old;kind='exact_generic_summary_after_compression';break
            if alias:
                alias['record'].setdefault('storage_copies',[]).append({'row':row,'timestamp':stamp,'kind':kind,
                    'summary':content if kind=='exact_generic_summary_after_compression' else None})
                continue
            record={'row':row,'session_id':session,'tool_call_id':identifier,'provider_tool_call_id':raw_id,'tool':name,
                    **({'transport_tool':transport} if transport!=name else {}),'result':unwrap(content),
                    **({'pairing_error':'missing_or_ambiguous_call'} if not call else {}),
                    **({'recovery_contexts':recovery_contexts(content),
                        'verifications':transport_documents(content,'dock_outcome_verification')} if name in LOCAL_TOOLS | NODE_TOOLS else {})}
            if retain_raw_tools:record["raw_content"]=content
            tools.append(record)
            originals.append({'row':row,'session':session,'identifier':identifier,'content':content,'timestamp':stamp,'active':is_active,'record':record})
        return clean(calls,secrets),clean(tools,secrets)
    finally:db.close()


def tool_evidence(home, secrets):
    return export_history(home,secrets)[1]


def call_evidence(home, secrets):
    return export_history(home,secrets)[0]
