"""Use the installed Hermes desktop/CLI attachment expansion, without model calls."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path.home()/'.hermes/hermes-agent'))
from agent.context_references import preprocess_context_references
from agent.model_metadata import get_model_context_length

source, destination, folder = map(Path, sys.argv[1:])
context = get_model_context_length('mimo-v2.5', provider='xiaomi')
result = preprocess_context_references(source.read_text(), cwd=folder,
                                       allowed_root=folder, context_length=context)
if result.blocked or not result.expanded or result.warnings:
    raise RuntimeError('Native attachment expansion did not complete cleanly')
with destination.open('x') as stream:
    stream.write(result.message)
print(json.dumps({'native_attachment_expanded': True, 'injected_tokens': result.injected_tokens,
                  'context_length': context, 'references': len(result.references)}))
