import json

print(json.dumps({'graph': {'nodes': [
    {'id': 'sales', 'type': 'imports.text', 'label': 'Продажи'},
]}}, ensure_ascii=False, indent=2))
