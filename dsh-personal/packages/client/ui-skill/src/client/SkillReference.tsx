/** Skill-reference presentation with activation owned by this keyed entry's Session injection. */
import { defineComponent, h } from 'vue'
import type { UserTextNodeProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ReferenceChip } from '@deepseek-ai/dsh-client-ui-primitives'

/** Session-bound preview action; accepting a preview is not a completion promise. */
export interface SkillReferenceInjected {
  /** Ask the skill source to preview a confirmed name in this entry's Session. @param name - skill name without its slash. */
  readonly openSkill: (name: string) => void
}
type SkillReferenceProps = UserTextNodeProps<'skill'> & SkillReferenceInjected

/** Render a skill chip, omitting activation in previews. */
export const SkillReference = defineComponent((props: SkillReferenceProps) => () => h(ReferenceChip, {
  appearance: 'skill', label: `/${props.node.data.name}`, title: props.raw,
  ...(props.interactive ? { onActivate: () => { props.openSkill(props.node.data.name) } } : {}),
}), { props: ['node', 'raw', 'interactive', 'openSkill'] })
