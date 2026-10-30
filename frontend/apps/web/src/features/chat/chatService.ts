import { runtimeApi } from '@eap/runtime-client';

/** Chat and settings always use the runtime client. Dev mock answers the same /api paths. */
export const modelApi = runtimeApi;

export function chatService() {
  return runtimeApi;
}

// Keep demo history separate from live backend conversation IDs.
export function chatStorage(mock: boolean, storage: Storage) {
  const key = (value: string) => mock ? `mock.${value}` : value;
  return { getItem: (value: string) => storage.getItem(key(value)), setItem: (value: string, data: string) => storage.setItem(key(value), data) };
}
