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
