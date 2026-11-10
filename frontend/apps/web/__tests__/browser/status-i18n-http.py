"""Real HTTP contract probe against StatusI18nLiveFixture; no external model or production data."""
from pathlib import Path
import urllib.request,urllib.error,json,uuid
root=Path.cwd();session=root/'backend/target/status-i18n/live';host=json.loads((session/'host.json').read_text(encoding='utf-8'));base='http://127.0.0.1:'+str(host['port'])
out=root/'frontend/apps/web/__tests__/browser/artifacts/status-i18n';out.mkdir(parents=True,exist_ok=True)
checks=[]
def call(path,method='GET',body=None,language='zh-CN',raw=None,extra=None):
 headers={'Accept-Language':language,'Content-Type':'application/json',**(extra or {})}
 data=raw if raw is not None else None if body is None else json.dumps(body).encode()
 request=urllib.request.Request(base+path,data=data,method=method,headers=headers)
 try:reply=urllib.request.urlopen(request,timeout=25)
 except urllib.error.HTTPError as error:reply=error
 text=reply.read().decode('utf-8');content=reply.headers.get('Content-Type','')
 value=json.loads(text) if 'json' in content else text
 assert 'private fixture' not in text and 'private deterministic' not in text
 return reply.status,dict(reply.headers),value
def problem(name,path,status,code,method='GET',body=None,raw=None,extra=None):
 records=[]
 for language in ['zh-CN','en-US']:
  actual,headers,value=call(path,method,body,language,raw,extra)
  assert actual==status,(name,actual,value)
  assert value['status']==status and value['code']==code,(name,value)
  assert value['type']=='about:blank' and value['title'] and value['requestId']
  assert headers.get('Content-Language')==language,(name,headers)
  assert value['detail'] and value['detail']!=code and '{0' not in value['detail']
  records.append({'language':language,'status':actual,'body':value})
 assert records[0]['body']['detail']!=records[1]['body']['detail']
 checks.append({'name':name,'responses':records});return records
cid=host['conversationId'];tool=host['toolExecutionId'];toolbase='/api/cli-programs/git/operations/git-status/executions'
# The two immutable proposals share the same source baseline, and each reaches the real claim/failure path once.
baseline=[]
for language,key in [('zh-CN','proposalId'),('en-US','proposalIdEn')]:
 status,headers,value=call(f'/api/ai/conversations/{cid}/proposals/{host[key]}/apply','POST',{'confirmed':True},language)
 assert status==409 and value['code']=='FILE_CHANGED_SINCE_PROPOSAL',(status,value)
 baseline.append({'language':language,'status':status,'body':value})
assert baseline[0]['body']['detail']!=baseline[1]['body']['detail'];checks.append({'name':'source-baseline-conflict','responses':baseline})
blocked=problem('unknown-blocks-new-execution',toolbase,409,'TOOL_EXECUTION_BLOCKED','POST',{'requestId':str(uuid.uuid4())})
assert all(x['body']['execution']['id']==tool and x['body']['execution']['status']=='UNKNOWN' for x in blocked)
status,_,runtime=call('/api/board/runtime?projectId=status-i18n-qa');assert status==200 and runtime['taskCount']==1 and runtime['runCount']==0,(status,runtime)
checks.append({'name':'real-aggregate-state-query','snapshot':runtime})
call('/qa/status-i18n/store-failure','POST',{'enabled':True})
try:problem('tool-store-unavailable',toolbase+'/'+tool,503,'TOOL_EXECUTION_STORE_UNAVAILABLE')
finally:call('/qa/status-i18n/store-failure','POST',{'enabled':False})
problem('invalid-json','/api/ai/conversations',400,'INVALID_CHAT_REQUEST','POST',raw=b'{broken')
problem('invalid-uuid','/api/ai/conversations/not-a-uuid',400,'INVALID_REQUEST')
problem('filter-host-rejection','/api/health',403,'HOST_REJECTED',extra={'Host':'outside.example.invalid'})
problem('unsupported-directory-grant','/api/ai/workspace/grants',405,'USER_DIRECTORY_GRANTS_NOT_STORED_ON_SERVER','POST',{})
def frames(text):
 values=[]
 for line in text.splitlines():
  if line.startswith('data:'):values.append(json.loads(line[5:].strip()))
 return values
sse=[]
for language in ['zh-CN','en-US']:
 status,headers,text=call(f'/api/ai/conversations/{cid}/messages','POST',{'message':'Deterministic provider failure fixture','toolMode':'none'},language)
 assert status==200 and headers['Content-Language']==language,(status,text)
 events=frames(text);failures=[e for e in events if e.get('code') and e.get('type') in ['error','refused','final']]
 assert failures and all(e.get('message') for e in failures),events
 event=failures[-1];eid=event['executionId'];path=f'/api/ai/conversations/{cid}/executions/{eid}/snapshot'
 before=call(f'/qa/status-i18n/journal?conversationId={cid}&executionId={eid}')[2]['sha256']
 zh=call(path,language='zh-CN')[2];en=call(path,language='en-US')[2]
 after=call(f'/qa/status-i18n/journal?conversationId={cid}&executionId={eid}')[2]['sha256']
 ze=[x for x in zh['events'] if x.get('message')][-1];ee=[x for x in en['events'] if x.get('message')][-1]
 assert ze['code']==ee['code']==event['code'] and ze['status']==ee['status'] and ze['message']!=ee['message']
 assert before==after and ze['text']==ee['text']
 sse.append({'language':language,'executionId':eid,'code':event['code'],'status':event['status'],'message':event['message'],'snapshotZh':ze['message'],'snapshotEn':ee['message'],'journalHashUnchanged':before==after})
checks.append({'name':'sse-worker-language-and-snapshot-reread','executions':sse})
# Current production revoke and expiry checks execute before any new provider call.
before=call('/qa/status-i18n/evidence')[2]['modelCalls']
call('/api/ai/connections/'+host['modelConnectionId']+'/enabled','POST',{'enabled':False})
problem('conversation-connection-revoked',f'/api/ai/conversations/{cid}/messages',503,'AI_NOT_CONFIGURED','POST',{'message':'must not invoke provider','toolMode':'none'})
call('/qa/status-i18n/expire','POST',{})
problem('conversation-expired',f'/api/ai/conversations/{cid}',404,'UNKNOWN_CONVERSATION')
assert call('/qa/status-i18n/evidence')[2]['modelCalls']==before
# Closing uncertainty is an explicit, deduplicated human assertion, never a fabricated process success.
review={'requestId':str(uuid.uuid4()),'note':'QA fixture: manually checked the owned test process tree stopped','processTreeStopped':True}
status,_,closed=call(toolbase+'/'+tool+'/resolve-unknown','POST',review);assert status==200 and closed['status']=='CLOSED_UNKNOWN',(status,closed)
status,_,retry=call(toolbase+'/'+tool+'/resolve-unknown','POST',review,'en-US');assert status==200 and retry['resolution']==closed['resolution']
checks.append({'name':'unknown-human-close-and-idempotent-reread','executionId':tool,'status':closed['status'],'sameResolution':True})
result={'kind':host['kind'],'schema':host['schema'],'checks':checks,'modelCalls':before,'externalModelCalls':0,'userProductAcceptance':False}
(out/'http-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'checks':len(checks),'modelCalls':before,'externalModelCalls':0}))
