/** Skill-reference presentation with activation owned by this keyed entry's Session injection. */
import type { UserTextNodeProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ReferenceChip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'

/** Session-bound preview action; accepting a preview is not a completion promise. */
export interface SkillReferenceInjected {
  hooks: {
    /** Accepted Coding Tools choice controls source-preview activation. */
    developerTools: HostObservable<boolean>
  }
  /**
   * Ask the skill source to preview a confirmed name in this entry's Session.
   * @param name - skill name without its slash.
   */
  readonly openSkill: (name: string) => void
}

type SkillReferenceProps = UserTextNodeProps<'skill'> & InjectFace<SkillReferenceInjected>

/**
 * Render a skill chip; source activation requires an interactive view and Coding Tools.
 * @param props - resolved node, raw token, interaction mode, and Session-bound preview action.
 * @returns an inline skill label or interactive chip.
 */
export function SkillReference({ node, raw, interactive, openSkill, useDeveloperTools }: SkillReferenceProps) {
  const showDetails = useDeveloperTools(enabled => enabled)
  return <ReferenceChip
    appearance="skill"
    label={`/${node.data.name}`}
    title={raw}
    {...(interactive && showDetails ? { onActivate: () => { openSkill(node.data.name) } } : {})}
  />
}
