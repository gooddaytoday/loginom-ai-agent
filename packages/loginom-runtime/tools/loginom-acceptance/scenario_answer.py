"""Export the final user-visible answer for business-requirement auditing only."""
import re
import sqlite3

from evidence import clean


def export_final_answer(home, secrets):
    database = home / 'state.db'
    if not database.exists():
        return {'status': 'unavailable', 'reason': 'no_history'}
    with sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True) as db:
        # Never query any reasoning/system/API-content column or intermediate prose.
        rows = db.execute("""SELECT m.id, m.session_id, m.content
            FROM messages m JOIN sessions s ON s.id=m.session_id
            WHERE m.role='assistant' AND m.finish_reason='stop'
              AND (m.tool_calls IS NULL OR m.tool_calls='[]') AND s.model='mimo-v2.5'
            ORDER BY m.id DESC LIMIT 1""").fetchall()
    if not rows:
        return {'status': 'unavailable', 'reason': 'no_final_answer'}
    row, session, content = rows[0]
    if not isinstance(content, str) or not content.strip() or len(content) > 100000:
        return {'status': 'unavailable', 'reason': 'unsupported_final_answer'}
    # Fail closed if the provider mixed private blocks into visible content.
    if re.search(r'<\s*/?\s*(?:think|thinking|analysis|reasoning)\b|\[/?(?:THINK|ANALYSIS)\]', content, re.I):
        return {'status': 'unavailable', 'reason': 'mixed_private_content'}
    return {'status': 'exported', 'row': row, 'session_id': session,
            'text': clean(content, secrets), 'scope': 'final_user_visible_answer_only'}
