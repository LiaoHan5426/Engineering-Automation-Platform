import { apiStorageScope } from '../../lib/runtimeConfig'
import { runtimeApi } from '@eap/runtime-client'

/** Chat and settings share the runtime client. */
export const modelApi = runtimeApi

export function chatService() {
  return runtimeApi
}

export function chatStorage(storage: Storage) {
  const key = (value: string) => `${apiStorageScope}.${value}`
  return {
    getItem: (value: string) => storage.getItem(key(value)),
    setItem: (value: string, data: string) => storage.setItem(key(value), data),
  }
}
