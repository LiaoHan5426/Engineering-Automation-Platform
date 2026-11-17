import { toValue, type MaybeRefOrGetter, type ShallowRef } from 'vue'
import { useObservableSelector } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  ConversationLocationDataStore,
  ConversationTurnDataMap,
} from '@deepseek-ai/dsh-client-ui-conversation/client'

/**
 * Subscribe to one value from a Turn's keyed Location-data store.
 * @param data - current Turn data store, or absence for a Node outside a Turn.
 * @param key - declaration-merged business key.
 * @returns the current value for that key.
 */
export function useTurnDataValue<Key extends Extract<keyof ConversationTurnDataMap, string>>(
  data: MaybeRefOrGetter<ConversationLocationDataStore<ConversationTurnDataMap> | undefined>,
  key: Key,
): Readonly<ShallowRef<Readonly<ConversationTurnDataMap[Key]> | undefined>> {
  return useObservableSelector(
    () => toValue(data)?.source(key),
    () => value => value,
  )
}
