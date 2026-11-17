import { h, defineComponent } from 'vue'
/** Input-type declarations shared by the DeepSeek and pi-ai catalog editors. */
import { Checkbox } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeepSeekModelDraft } from './DeepSeekModelsEditor.tsx'
import type { ModelsKey } from './locales.ts'
import styles from './ModelsSection.module.css'
/** Props of {@link ModelInputTypes}. */
interface ModelInputTypesProps {
  /** Effective model row, including fields outside the curated editor. */
  model: DeepSeekModelDraft
  /** Adapter-owned field; pi-ai inherits capabilities when absent or empty. */
  field: 'inputModalities' | 'input'
  /** One-based row position for the accessible group label. */
  position: number
  /** Prevent changes while read-only or saving. */
  disabled: boolean
  /** Installed model or provider defaults when the row does not declare input types. */
  fallback?: readonly string[] | undefined
  /** Section copy. */
  t: (key: ModelsKey) => string
  /** Replace this row, preserving unrelated configuration. */
  onChange: (model: DeepSeekModelDraft) => void
}
/**
 * Edit a nonempty set of input types, displaying inherited types before an override exists.
 * @param props - model declaration and row replacement action.
 * @returns the labeled text and image checkboxes.
 */
export const ModelInputTypes = defineComponent(
  (props: ModelInputTypesProps) => {
    return () => {
      const { model, field, position, disabled, fallback, t, onChange } = props
      const modalities = model[field]
      const selected =
        Array.isArray(modalities) && modalities.length > 0 ? modalities : (fallback ?? ['text'])
      return h(
        'fieldset',
        {
          class: styles['modelInputTypes'],
          'aria-label': `${t('modelInputTypes')} ${String(position)}`,
        },
        [
          h('legend', { class: styles['modelFieldLabel'] }, t('modelInputTypes')),
          h(
            'div',
            { class: styles['modelInputChoices'] },
            ['text', 'image'].map(modality =>
              h(Checkbox, {
                key: modality,
                label: t(modality === 'text' ? 'modelInputText' : 'modelInputImage'),
                checked: selected.includes(modality),
                disabled: disabled || (selected.length === 1 && selected.includes(modality)),
                onChange: (checked) => {
                  const nextSelected = ['text', 'image'].filter(value =>
                    value === modality
                      ? /** One-based row position for the accessible group label. */
                    /** One-based row position for the accessible group label. */ checked
                      : selected.includes(value),
                  )
                  const next = { ...model, [field]: nextSelected }
                  if (field === 'inputModalities' && !nextSelected.includes('image')) {
                    Reflect.deleteProperty(next, 'imagePixelBudget')
                    Reflect.deleteProperty(next, 'imageMaxBytes')
                  }
                  onChange(next)
                },
              }),
            ),
          ),
        ],
      )
    }
  },
  {
    inheritAttrs: false,
    props: ['model', 'field', 'position', 'disabled', 'fallback', 't', 'onChange'],
  },
)
