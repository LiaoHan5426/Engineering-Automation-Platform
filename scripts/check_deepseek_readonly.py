"""Explicit local connectivity check. Never requests code generation, tools or proposal apply."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:8080/api/ai'

def call(path, body=None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(BASE + path, data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)

def code_state():
    data = subprocess.check_output(['git', '-c', 'core.safecrlf=false', 'diff', '--binary', 'HEAD', '--', 'backend', 'frontend', 'scripts'], cwd=ROOT, stderr=subprocess.DEVNULL)
    names = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z', '--', 'backend', 'frontend', 'scripts'], cwd=ROOT)
    digest = hashlib.sha256(data)
    for raw in names.split(b'\0'):
        if not raw: continue
        path = ROOT / os.fsdecode(raw)
        if path.is_file(): digest.update(raw); digest.update(path.read_bytes())
    return digest.hexdigest()

def main():
    config = (ROOT / 'backend/eap-runtime/src/main/resources/application.yml').read_text(encoding='utf-8')
    match = re.search(r'(?m)^\s*deepseek-key:\s*([^\r\n]+)', config)
    if not match: raise ValueError('Missing configured key')
    scalar = match.group(1).strip()
    quoted = re.match(r'''^(['"])(.*?)\1''', scalar)
    secret = quoted.group(2) if quoted else scalar.split(' #', 1)[0].strip()
    if secret.startswith('${') and secret.endswith('}'):
        variable, _, default = secret[2:-1].partition(':'); secret = os.environ.get(variable, default)
    if not secret: raise ValueError('Empty configured key')
    before = code_state()
    connection = call('/connections', {'name': 'DeepSeek read-only connectivity check', 'baseUrl': 'https://api.deepseek.com', 'secret': secret, 'enabled': True, 'defaultSelected': False})
    connection_id = connection['id']
    try:
        catalog = call('/connections/' + connection_id + '/models/refresh', {})
        available = catalog['models']
        if not available:
            code = str(catalog.get('discoveryError', 'NO_MODELS'))
            print(json.dumps({'ok': False, 'discovery_error': code if re.fullmatch(r'[A-Z0-9_]+', code) else 'DISCOVERY_FAILED'}))
            return 1
        model = next((item for item in available if item['id'] == 'deepseek-chat'), available[0])
        call('/connections/' + connection_id + '/models', {'models': catalog['models'], 'allowedModels': [model['id']], 'defaultModel': model['id']})
        conversation = call('/conversations', {})
        conversation_id = conversation['conversationId']
        call('/conversations/' + conversation_id + '/connection', {'connectionId': connection_id, 'model': model['id'], 'confirmTargetChange': True})
        response = call('/conversations/' + conversation_id + '/messages', {
            'message': 'Reply with EAP_READ_ONLY_OK only. This is a connectivity check.', 'toolMode': 'none',
            'context': {'mode': 'chat', 'expert': 'general', 'instructions': 'No tools, file access, code generation or commands.', 'reasoning': 'default', 'approval': 'read_only', 'files': [], 'prototypeVersionId': ''},
        })
        assert not response.get('proposal'), 'Unexpected proposal'
        assert not response.get('toolEvents'), 'Unexpected tool events'
        assert not response.get('error'), 'Model request failed'
        assert before == code_state(), 'Repository code changed during check'
        print(json.dumps({'model': model['id'], 'answer_received': bool(response.get('answer')), 'marker_received': 'EAP_READ_ONLY_OK' in response.get('answer', ''), 'proposal': False, 'tools': False, 'repository_unchanged': True}))
    finally:
        call('/connections/' + connection_id + '/enabled', {'enabled': False})

if __name__ == '__main__':
    try: sys.exit(main() or 0)
    except urllib.error.HTTPError as error:
        print(json.dumps({'ok': False, 'http_status': error.code})); sys.exit(1)
    except Exception as error:
        # Never print exception text or request/response bodies, which may include credentials.
        print(json.dumps({'ok': False, 'error_type': type(error).__name__})); sys.exit(1)
