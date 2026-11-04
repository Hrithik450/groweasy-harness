/**
 * Wire contract for one assistant-authored Generative UI block.
 *
 * The block catalog, validator, and submission text live in this package; the
 * React renderer and its component registry stay in the application.
 *
 * @module @openai-harness/generative-ui
 */

export interface UIBlockNode {
  type: string;
  props: Record<string, unknown>;
  children?: string[];
  slots?: Record<string, string[]>;
}

export interface UIBlockSpec {
  root: string;
  elements: Record<string, UIBlockNode>;
  [key: string]: unknown;
}
