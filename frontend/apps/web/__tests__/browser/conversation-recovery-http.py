"""Checks the production recovery HTTP contract against the owned full fixture, without model calls."""
from pathlib import Path
import json
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[5]
launch = json.loads((ROOT / 'backend/target/session-optimization/current-live.json').read_text(encoding='utf-8'))
host = json.loads((Path(launch['session']) / 'host.json').read_text(encoding='utf-8'))
base = 'http://127.0.0.1:' + host['port']
output = Path(__file__).parent / 'artifacts/conversation-optimization'
output.mkdir(parents=True, exist_ok=True)
checks = []

def request(method, path, body=None, status=200, language='zh-CN'):
    raw = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + path, raw, {'Content-Type': 'application/json', 'Accept-Language': language}, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    data = json.loads(response.read())
    assert response.status == status, (path, response.status, data)
    return data

id = host['conversationId']
path = '/api/ai/conversations/' + id
body = {'confirmContextReset': True, 'expectedWorkspaceLabel': host['workspaceLabel'], 'connectionId': host['connectionId'], 'model': host['model']}
request('PUT', path + '/working-memory', {'goal': 'Keep the task goal', 'constraints': ['Reuse existing components']})
request('POST', path + '/reconnect', {key: value for key, value in body.items() if key not in ('connectionId', 'model')}, status=400)
request('POST', '/qa/conversation-recovery/expire', {})
request('GET', path, status=404)
checks.append({'name': 'strict-current-contract-and-confirmed-expiry', 'passed': True})
for language in ('zh-CN', 'en-US'):
    denied = request('POST', path + '/reconnect', {**body, 'expectedWorkspaceLabel': 'other-workspace'}, status=409, language=language)
    assert denied['code'] == 'CONVERSATION_WORKSPACE_CHANGED'
    request('GET', path, status=404)
    rejected = request('POST', path + '/reconnect', {**body, 'model': 'not-allowed'}, status=403, language=language)
    assert rejected['code'] == 'MODEL_NOT_ALLOWED'
    request('GET', path, status=404)
    checks.append({'name': 'reject-before-recovery', 'language': language, 'workspace': denied['code'], 'model': rejected['code']})
restored = request('POST', path + '/reconnect', body)
assert restored['conversationId'] == id and restored['contextReset'] is True
assert restored['connectionId'] == host['connectionId'] and restored['model'] == host['model']
assert restored['workingMemory']['goal'] == 'Keep the task goal'
again = request('POST', path + '/reconnect', body)
assert again['contextReset'] is False and again['memoryCleared'] is False
assert again['workingMemory'] == restored['workingMemory']
checks.append({'name': 'atomic-same-id-binding-and-working-memory-restore', 'contextReset': restored['contextReset'], 'repeatKept': not again['memoryCleared']})
evidence = request('GET', '/qa/conversation-recovery/evidence?conversationId=' + id)
assert evidence == {'providerCalls': 0, 'externalModelCalls': 0, 'modelWindowMessages': 0}
checks.append({'name': 'recovery-does-not-replay-history-or-call-provider', **evidence})
request('POST', '/api/ai/connections/' + host['connectionId'] + '/enabled', {'enabled': False})
request('POST', '/qa/conversation-recovery/expire', {})
request('POST', path + '/reconnect', body, status=503)
request('GET', path, status=404)
request('POST', '/api/ai/connections/' + host['connectionId'] + '/enabled', {'enabled': True})
final = request('POST', path + '/reconnect', body)
assert final['contextReset'] and final['connectionId'] == host['connectionId']
checks.append({'name': 'disabled-target-denied-and-explicit-recovery-after-restoration', 'passed': True})
(output/'http-result.json').write_text(json.dumps({'kind': host['kind'], 'checks': checks, 'providerCalls': 0, 'externalModelCalls': 0, 'userProductAcceptance': False}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'passedGroups': len(checks), 'providerCalls': 0}))
