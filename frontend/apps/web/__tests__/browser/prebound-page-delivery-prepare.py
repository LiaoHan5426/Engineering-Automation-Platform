from pathlib import Path
import urllib.request,urllib.error,json,uuid,hashlib,time,os
if os.environ.get('EAP_RUN_PREBOUND_REAL_MODEL')!='approved':raise SystemExit('Set EAP_RUN_PREBOUND_REAL_MODEL=approved to explicitly authorize one real configured model request')
root=Path(__file__).resolve().parents[5];out=root/'backend/target/prebound-live';base=json.loads((out/'process.json').read_text(encoding='utf-8'))['base']+'/api'
def request(method,path,data=None):
 raw=None if data is None else json.dumps(data,ensure_ascii=False).encode('utf-8')
 req=urllib.request.Request(base+path,data=raw,method=method,headers={'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=120) as response:return json.load(response)
 except urllib.error.HTTPError as error:
  print(json.dumps({'path':path,'status':error.code,'body':error.read().decode('utf-8')[:1000]}),flush=True);raise
statePath=out/'session.json'
state=json.loads(statePath.read_text(encoding='utf-8')) if statePath.exists() else {'projectId':'prebound-page-delivery-'+uuid.uuid4().hex[:12],'taskRequestId':str(uuid.uuid4()),'prototypeRequestId':str(uuid.uuid4())}
def save():statePath.write_text(json.dumps(state,indent=2),encoding='utf-8')
save()
if (out/'proposal.json').exists():print('Existing real proposal preserved; no second model request');raise SystemExit()
target='frontend/apps/web/src/features/chat/GenerationBaseline.vue'
goal='Improve the actual generation snapshot panel: bound tasks must show a PREBOUND badge in the collapsed summary and a clear next delivery step after source application. Keep task identity, hashes and prototype evidence intact.'
criteria='With taskBinding: the summary shows generation.prebound in @eap/ui Badge with data-testid=generation-prebound, and the expanded content shows generation.deliveryNext in p[data-testid=generation-next-step]. Without taskBinding neither is present. No claims of automatic validation or acceptance, no network calls/navigation, and existing generation evidence remains unchanged.'
if 'prototype' not in state:
 body=json.dumps({'format':'eap-prototype-v1','schema':{'version':1,'title':'Generation evidence and next step','unknownMappings':[],'grapesProject':{},'root':{'id':'page','kind':'page','props':{},'children':[{'id':'heading','kind':'heading','props':{'text':'生成前已绑定任务'},'children':[]},{'id':'instruction','kind':'text','props':{'text':'应用源码后回看板运行独立验证，并提交源码证据和人工决定。'},'children':[]}]}}},ensure_ascii=False)
 state['prototype']=request('POST','/prototype-versions',{'requestId':state['prototypeRequestId'],'sourceRef':'builder-alpha','title':'PREBOUND generation evidence delivery','body':body,'acceptance':['Bound status is visible without expanding details','Manual acceptance remains explicit']});save()
if 'task' not in state:
 task=request('POST','/board/tasks',{'projectId':state['projectId'],'requestId':state['taskRequestId'],'title':'Real PREBOUND generation evidence page delivery','sessionId':'','column':'ready','goal':goal,'acceptanceCriteria':criteria})
 state['task']=request('POST','/board/tasks/'+task['id']+'/prototype',{'projectId':state['projectId'],'revision':task['revision'],'versionId':state['prototype']['id']});save()
if 'conversation' not in state:state['conversation']=request('POST','/ai/conversations',{});save()
task=state['task'];conversation=state['conversation'];context={'mode':'code','expert':'frontend','approval':'review','reasoning':'low','files':[],'prototypeVersionId':state['prototype']['id'],'targetPath':target,'taskRef':{'projectId':state['projectId'],'taskId':task['id'],'revision':task['revision']}}
context['instructions']='Modify only the one target Vue file, return complete source. Reuse @eap/ui Collapse and Badge, Vue useI18n; the two translation keys generation.prebound and generation.deliveryNext already exist. Keep all current identity, hash, absent-target and prototype displays. Add Badge to the named summary slot with v-if generation.taskBinding and data-testid="generation-prebound". Add p[data-testid="generation-next-step"] inside expanded content with the same condition. No other files, new packages, HTTP, navigation, timers, automatic approval, or hardcoded translations. Follow existing formatting.'
state['context']=context;state['message']=goal+'\nAcceptance: '+criteria;state['modelRequestStartedAt']=time.time();save()
before=(root/'backend/target/prebound-page-workspace'/target).read_bytes();state['beforeHash']=hashlib.sha256(before).hexdigest();save()
req=urllib.request.Request(base+'/ai/conversations/'+conversation['conversationId']+'/messages',method='POST',data=json.dumps({'message':state['message'],'toolMode':'none','context':context},ensure_ascii=False).encode('utf-8'),headers={'Content-Type':'application/json','Accept':'text/event-stream'})
events=[];payload=[];kind='';final=None
print('Requesting one real configured model candidate with committed PREBOUND task/prototype/source context',flush=True)
try:
 with urllib.request.urlopen(req,timeout=150) as response:
  for raw in response:
   line=raw.decode('utf-8').rstrip('\r\n')
   if line.startswith('event:'):kind=line[6:].strip()
   elif line.startswith('data:'):payload.append(line[5:].lstrip())
   elif not line and payload:
    event=json.loads('\n'.join(payload));payload=[];events.append(event)
    (out/'model-events.json').write_text(json.dumps(events,ensure_ascii=False,indent=2),encoding='utf-8')
    if kind=='final':final=event.get('payload');break
except urllib.error.HTTPError as error:
 print(json.dumps({'status':error.code,'body':error.read().decode('utf-8')[:1200]}),flush=True);raise
assert final and final.get('proposal'),json.dumps(final or events[-2:],ensure_ascii=False)[:1400]
proposal=final['proposal'];assert proposal['generation']['taskBinding']==context['taskRef'];assert len(proposal['files'])==1 and proposal['files'][0]['path']==target
assert (root/'backend/target/prebound-page-workspace'/target).read_bytes()==before,'Generation wrote source before review'
(out/'proposal.json').write_text(json.dumps(proposal,ensure_ascii=False,indent=2),encoding='utf-8')
state['proposalId']=proposal['id'];state['generationId']=proposal['generation']['id'];state['final']=final;state['modelSeconds']=round(time.time()-state['modelRequestStartedAt'],2);save()
print(json.dumps({'conversationId':conversation['conversationId'],'taskId':task['id'],'revision':task['revision'],'prototypeId':state['prototype']['id'],'proposalId':proposal['id'],'generationId':proposal['generation']['id'],'target':target,'model':conversation.get('model'),'seconds':state['modelSeconds'],'sourceUnchangedBeforeApproval':True}),flush=True)
