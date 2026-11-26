import { executionLogMessages } from './executionLogMessages'
import { productMessages } from './productMessages'
import { pluginCheckMessages } from './pluginMessages'
import { configureRuntimeLanguage } from '@eap/runtime-client'
import { presentationMessages } from './presentationMessages'
import { editorMessages } from './editorMessages'
import { toolExecutionMessages } from './toolExecutionMessages'
import { expertWorkspaceMessages } from './expertWorkspaceMessages'
import { workDocumentMessages } from './workDocumentMessages'
import { sceneDesignerMessages } from './sceneDesignerMessages'
import { interactionPatternsMessages } from './interactionPatternsMessages'
import { knowledgeContextMessages } from './knowledgeContextMessages'
import { contextBudgetMessages } from './contextBudgetMessages'
import { workingMemoryMessages } from './workingMemoryMessages'
import { skillMessages } from './skillMessages'
import { builderMessages } from './builderMessages'
import { generationMessages } from './generationMessages'
import { applicationMessages } from './applicationMessages'
import { boardPrototypeMessages } from './boardPrototypeMessages'
import { boardReviewMessages } from './boardReviewMessages'
import { boardDeliveryMessages } from './boardDeliveryMessages'
import { boardCodeMessages } from './boardCodeMessages'
import { boardVerificationMessages } from './boardVerificationMessages'
import { boardRunMessages } from './boardRunMessages'
import { appearanceMessages } from './appearanceMessages'
import { expertAgentMessages } from './expertAgentMessages'
import { inspectorMessages } from './inspectorMessages'
import { createAppI18n, type LocaleDictionary } from '@eap/i18n'
import { previewMessages } from './previewMessages'
import { desktopMessages, modelMessages, authMessages } from './desktopMessages'

import { shellMessages } from './shellMessages'

export const { i18n, registerMessages, createPluginLocale } = createAppI18n({
  locale: 'zh-CN',
  fallbackLocale: 'en-US',
})

registerMessages('executionLog', executionLogMessages)
registerMessages('product', productMessages)
registerMessages('presentation', presentationMessages)
registerMessages('toolExecution', toolExecutionMessages)
registerMessages('expertAgent', expertAgentMessages)
registerMessages('editor', editorMessages)
registerMessages('expertWorkspace', expertWorkspaceMessages)
registerMessages('workDocument', workDocumentMessages)
registerMessages('sceneDesigner', sceneDesignerMessages)
registerMessages('patterns', interactionPatternsMessages)
registerMessages('knowledgeContext', knowledgeContextMessages)
registerMessages('contextBudget', contextBudgetMessages)
registerMessages('workingMemory', workingMemoryMessages)
registerMessages('skill', skillMessages)
registerMessages('builder', builderMessages)
registerMessages('generation', generationMessages)
registerMessages('application', applicationMessages)
registerMessages('boardPrototype', boardPrototypeMessages)
registerMessages('boardReview', boardReviewMessages)
registerMessages('boardVerification', boardVerificationMessages)
registerMessages('boardDelivery', boardDeliveryMessages)
registerMessages('boardCode', boardCodeMessages)
registerMessages('boardRun', boardRunMessages)
registerMessages('appearance', appearanceMessages)
registerMessages('preview', previewMessages)
registerMessages('inspector', inspectorMessages)
registerMessages('desktop', desktopMessages)
registerMessages('modelUi', modelMessages)
registerMessages('authUi', authMessages)

// Register top-level keys from catalogs that supply several namespaces.
function registerCatalog(catalog: Readonly<Record<string, LocaleDictionary>>) {
  const namespaces = new Map<string, Record<string, LocaleDictionary[string]>>()
  for (const [locale, messages] of Object.entries(catalog)) {
    for (const [namespace, message] of Object.entries(messages)) {
      const translations = namespaces.get(namespace) ?? {}
      translations[locale] = message
      namespaces.set(namespace, translations)
    }
  }
  for (const [namespace, translations] of namespaces) registerMessages(namespace, translations)
}

registerCatalog(pluginCheckMessages)
registerCatalog(shellMessages)

configureRuntimeLanguage(() => (i18n.global.locale.value === 'en-US' ? 'en-US' : 'zh-CN'))
