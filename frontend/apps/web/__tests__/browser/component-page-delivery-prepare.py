from pathlib import Path
import urllib.request,urllib.error,json,uuid,hashlib,time,os
if os.environ.get('EAP_RUN_COMPONENT_REAL_MODEL')!='approved':raise SystemExit('Set EAP_RUN_COMPONENT_REAL_MODEL=approved to explicitly authorize one real configured model request')
root=Path(__file__).resolve().parents[5];out=root/'backend/target/component-live';base=json.loads((out/'process.json').read_text(encoding='utf-8'))['base']+'/api'
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
target='frontend/apps/web/src/components/DeliveryEvidencePanel.vue'
companions=['frontend/apps/web/src/components/DeliveryEvidenceSummary.vue','frontend/apps/web/src/components/deliveryEvidenceModel.ts']
goal='Deliver a complete read-only multi-file candidate evidence panel on the existing task candidate page: filter, select files, inspect baseline and exact byte size, and distinguish technical evidence from explicit later gates.'
criteria='Preserve the Panel props files/status/labels and EvidenceFile public type. Summary shows total files, modified-existing count excluding unchanged files, and newly-added count. Case-insensitive path filter keeps all-file summary counts. File buttons select detail: path, baseline hash, UTF-8 byte size and complete content. First visible file is selected initially; selection reconciles when filter or props change. Empty filter/files show empty state with no stale detail. Display labels.boundary without triggering requests, navigation, timers or mutations.'
if 'prototype' not in state:
 body=json.dumps({'format':'eap-prototype-v1','schema':{'version':1,'title':'Multi-file delivery evidence','unknownMappings':[],'grapesProject':{},'root':{'id':'page','kind':'page','props':{},'children':[{'id':'heading','kind':'heading','props':{'text':'多文件候选证据'},'children':[]},{'id':'instruction','kind':'text','props':{'text':'筛选并选择文件，检查摘要、基线和源码；应用、独立验证和人工决定仍需明确操作。'},'children':[]}]}}},ensure_ascii=False)
 state['prototype']=request('POST','/prototype-versions',{'requestId':state['prototypeRequestId'],'sourceRef':'builder-alpha','title':'Multi-file evidence page delivery','body':body,'acceptance':['Filter, file selection and empty state are visible','Manual acceptance remains explicit']});save()
if 'task' not in state:
 task=request('POST','/board/tasks',{'projectId':state['projectId'],'requestId':state['taskRequestId'],'title':'Real multi-file evidence page delivery','sessionId':'','column':'ready','goal':goal,'acceptanceCriteria':criteria})
 state['task']=request('POST','/board/tasks/'+task['id']+'/prototype',{'projectId':state['projectId'],'revision':task['revision'],'versionId':state['prototype']['id']});save()
if 'conversation' not in state:state['conversation']=request('POST','/ai/conversations',{});save()
if state.get('modelRequestStartedAt'):raise SystemExit('Previous request marker found; inspect durable proposal before another model call')
task=state['task'];conversation=state['conversation'];context={'mode':'code','expert':'frontend','approval':'review','reasoning':'low','files':[],'prototypeVersionId':state['prototype']['id'],'targetPath':target,'componentPaths':companions,'taskRef':{'projectId':state['projectId'],'taskId':task['id'],'revision':task['revision']}}
context['instructions']='Return exactly the selected three files in the required order with complete source, no markdown. Root Panel must statically import ./DeliveryEvidenceSummary.vue and ./deliveryEvidenceModel; Summary may also use model. No circular, dynamic or other local references. Keep static import/export-from statements on one line. Use only Vue and @eap/ui imports. Reuse public Input, Button, Panel, Badge; no native input/button/select or custom interaction roles. Panel props files EvidenceFile[], status string, labels Record<string,string> remain. EvidenceFile retains path,before,content,baseHash. Keep exported evidenceRows(files,query) as case-insensitive filter. All visible product wording comes from labels or status/paths/evidence, no literal English/Chinese labels. Public labels keys title,filter,empty,total,changed,added,details,bytes,baseline,boundary already supplied. Required testids: evidence-panel on root; evidence-summary on summary; evidence-total/evidence-changed/evidence-added on individual summary counts; evidence-filter on Input; evidence-file on each Button; evidence-detail only when a visible selected file exists. Detail displays path, baseline hash, UTF-8 byte count using TextEncoder and complete content in pre/code. Existing modified count means before!==null and before!==content, new count means before===null, unchanged files excluded from changed count. Use computed state and selected path reconciled against visible files so props/filter changes never retain stale detail. First visible selected by default. Add responsive CSS using layout/gap/wrapping and existing theme tokens var(--...). No fixed colors, new deps, HTTP, timers, filesystem, acceptance actions or other files. Maintain concise code under 10KB total. Do not modify independent acceptance tests.'
state['context']=context;state['message']=goal+'\nAcceptance: '+criteria;state['modelRequestStartedAt']=time.time();save()
before={p:(root/'backend/target/component-page-workspace'/p).read_bytes() for p in [target,*companions]};state['beforeHashes']={p:hashlib.sha256(v).hexdigest() for p,v in before.items()};save()
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
proposal=final['proposal'];assert proposal['generation']['taskBinding']==context['taskRef'];assert [f['path'] for f in proposal['files']]==[target,*companions]
assert all((root/'backend/target/component-page-workspace'/p).read_bytes()==value for p,value in before.items()),'Generation wrote source before review'
(out/'proposal.json').write_text(json.dumps(proposal,ensure_ascii=False,indent=2),encoding='utf-8')
state['proposalId']=proposal['id'];state['generationId']=proposal['generation']['id'];state['final']=final;state['modelSeconds']=round(time.time()-state['modelRequestStartedAt'],2);save()
print(json.dumps({'conversationId':conversation['conversationId'],'taskId':task['id'],'revision':task['revision'],'prototypeId':state['prototype']['id'],'proposalId':proposal['id'],'generationId':proposal['generation']['id'],'target':target,'model':conversation.get('model'),'seconds':state['modelSeconds'],'sourceUnchangedBeforeApproval':True}),flush=True)
