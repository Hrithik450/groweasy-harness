/** Shared Web and desktop developer-tool preference stored by the Host. */
import z from '@deepseek-ai/schemastery'

/** Namespace for developer UI and HTML preview capabilities. */
export const DEVELOPER_TOOLS_NAMESPACE = 'ui-settings'

/** Persisted developer-tool choice. */
export interface DeveloperToolsSettings {
  /** Enable technical Tool and skill details, diagnostic views, preset selection, diffs, and scripted HTML previews. */
  enabled: boolean
}

/** Technical detail is opt-in when no saved choice or profile override exists. */
export const DeveloperToolsSettingsFields = {
  enabled: z.boolean().default(false),
}

/** Schema for shared configuration values. */
export const DeveloperToolsSettingsSchema = z.object(DeveloperToolsSettingsFields)
