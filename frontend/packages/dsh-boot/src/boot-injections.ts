import type { IndexInjection, WebBootGraph } from './types.ts'

/** Bootstrap package whose ordinary client bundle supplies the module-system implementation. */
export const CLIENT_MODULES_ID = '@deepseek-ai/dsh-client-modules'

/**
 * Boot protocol as index injection rows: ModuleLoader queue, batch preloads,
 * bootstrap script-src rows, then `__DSH_BOOT__`.
 */
export function bootInjections(graph: WebBootGraph): IndexInjection[] {
  const bootstrapId = JSON.stringify(CLIENT_MODULES_ID)
  const queue = `(()=>{
const pendingQueue=[]
window.__ModuleLoader__={
  mode:"queue",
  pendingQueue,
  load(registration){pendingQueue.push(registration)},
  create(options){
    if(this.mode!=="queue")throw new Error("client-modules: window.__ModuleLoader__.create called after module-system boot")
    const index=pendingQueue.findIndex(registration=>registration.id===${bootstrapId})
    const registration=pendingQueue[index]
    if(registration===undefined)throw new Error("client-modules: HTML did not preload ${CLIENT_MODULES_ID}/client.js")
    pendingQueue.splice(index,1)
    const exports=registration.factory(specifier=>{
      throw new Error('client-modules: ${CLIENT_MODULES_ID}/client.js requested external "'+specifier+'" before the module system existed')
    })
    if(typeof exports!=="object"||exports===null||typeof exports.createClientModuleSystem!=="function"||typeof exports.apply!=="function"){
      throw new Error("client-modules: ${CLIENT_MODULES_ID}/client.js did not export the bootstrap module face")
    }
    return exports.createClientModuleSystem(this,{id:registration.id,exports},options)
  }
}
})()`
  const bootstrap = graph.batches.filter((batch) => batch.phase === 'bootstrap')
  const application = graph.batches.filter((batch) => batch.phase === 'application')
  const rows: IndexInjection[] = [{ kind: 'script', placement: 'head', text: queue }]
  for (const batch of application) {
    rows.push({ kind: 'script-preload', src: batch.url })
  }
  for (const batch of bootstrap) {
    rows.push({ kind: 'script-src', placement: 'head', src: batch.url })
  }
  rows.push({ kind: 'global', name: '__DSH_BOOT__', value: graph })
  return rows
}