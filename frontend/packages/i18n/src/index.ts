import { inject, ref, watch, type InjectionKey } from 'vue'
import { createI18n, type LocaleMessageValue, type VueMessageType } from 'vue-i18n'

export type LocaleDictionary = Readonly<Record<string, LocaleMessageValue<VueMessageType>>>
export type RegisterMessages = (namespace: string, messages: LocaleDictionary) => () => void

export const registerMessagesKey: InjectionKey<RegisterMessages> = Symbol('eap.registerMessages')

export function useRegisterMessages(): RegisterMessages {
  const register = inject(registerMessagesKey)
  if (!register) throw new Error('The app has not provided an i18n registry')
  return register
}

export function createAppI18n(options: { locale: string; fallbackLocale: string }) {
  const i18n = createI18n({ legacy: false, ...options })
  const namespaces = new Set<string>()

  const registerMessages: RegisterMessages = (namespace, messages) => {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(namespace) || Object.hasOwn(Object.prototype, namespace)) {
      throw new Error(`Invalid i18n namespace "${namespace}"`)
    }
    if (namespaces.has(namespace)) throw new Error(`Duplicate i18n namespace "${namespace}"`)

    for (const [locale, message] of Object.entries(messages)) {
      i18n.global.mergeLocaleMessage(locale, { [namespace]: message })
    }
    namespaces.add(namespace)
    let active = true
    return () => {
      if (!active) return
      active = false
      for (const locale of Object.keys(messages)) {
        const rest: Record<string, LocaleMessageValue<VueMessageType>> = {
          ...i18n.global.getLocaleMessage(locale),
        }
        delete rest[namespace]
        i18n.global.setLocaleMessage(locale, rest)
      }
      namespaces.delete(namespace)
    }
  }

  function createPluginLocale(pluginName: string) {
    const dictionaries = new Map<string, Map<string, Record<string, string>>>()
    const releases = new Map<string, () => void>()
    const revision = ref(0)
    const language = () => (i18n.global.locale.value === 'zh-CN' ? 'zh' : 'en')
    let snapshot = { active: language(), revision: revision.value }
    const getSnapshot = () => {
      if (snapshot.active !== language() || snapshot.revision !== revision.value) {
        snapshot = { active: language(), revision: revision.value }
      }
      return snapshot
    }
    const prefix = (namespace: string) => `plugin-${pluginName}-${namespace}`

    function update(namespace: string, translations: Map<string, Record<string, string>>) {
      releases.get(namespace)?.()
      releases.delete(namespace)
      if (translations.size) {
        releases.set(
          namespace,
          registerMessages(prefix(namespace), Object.fromEntries(translations)),
        )
      } else {
        dictionaries.delete(namespace)
      }
      revision.value += 1
    }

    return {
      register(namespace: string, language: string, dictionary: Record<string, string>) {
        const locale = language === 'zh' ? 'zh-CN' : language === 'en' ? 'en-US' : language
        const translations = dictionaries.get(namespace) ?? new Map()
        if (translations.has(locale))
          throw new Error(`Duplicate plugin locale "${namespace}/${locale}"`)
        translations.set(locale, dictionary)
        dictionaries.set(namespace, translations)
        update(namespace, translations)
        return () => {
          if (
            translations.get(locale) !== dictionary ||
            dictionaries.get(namespace) !== translations
          )
            return
          translations.delete(locale)
          update(namespace, translations)
        }
      },
      subscribe: (listener: () => void) => watch([i18n.global.locale, revision], listener),
      getSnapshot,
      getLocale: getSnapshot,
      bind: (namespace: string) => (key: string, params?: Record<string, unknown>) => {
        const path = `${prefix(namespace)}.${key}`
        if (!i18n.global.te(path) && !i18n.global.te(path, options.fallbackLocale)) return key
        return i18n.global.t(path, params ?? {})
      },
      t: (key: string) => i18n.global.t(key),
    }
  }

  return { i18n, registerMessages, createPluginLocale }
}
