import { useId } from "react";
import { catalog } from "./catalog";

export function toCamelCase(str?: string): string {
  if (!str) return "";
  const trimmed = str.trim();
  if (!trimmed) return "";

  // If already standard camelCase (starts with lowercase, letters and digits only)
  if (/^[a-z][a-zA-Z0-9]*$/.test(trimmed)) {
    return trimmed;
  }

  // Split on camelCase transitions, spaces, dashes, underscores, and special characters
  const words = trimmed
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "";

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

export function cleanReactId(reactId: string): string {
  return reactId.replace(/[^a-zA-Z0-9]/g, "");
}

export function composeFieldId(
  nameOrLabel?: string,
  reactId?: string,
  fallback = "field",
): string {
  const base = toCamelCase(nameOrLabel) || fallback;
  // If a name or label was explicitly provided, use the stable base name.
  // Only use reactId as a discriminator if falling back to generic "field".
  if (nameOrLabel && nameOrLabel.trim()) {
    return base;
  }
  if (!reactId) return base;
  const cleanId = cleanReactId(reactId);
  return cleanId ? `${base}_${cleanId}` : base;
}

export function useNormalizedFieldId(
  nameOrLabel?: string,
  fallback = "field",
): string {
  const rawId = useId();
  return composeFieldId(nameOrLabel, rawId, fallback);
}

/**
 * Robustly reads an interactive store field value by fieldName or original prop name,
 * matching both exact keys and legacy keys stored with suffixes (e.g. subject_r0).
 */
export function getStoreFieldValue(
  scopeValues: Record<string, unknown> | undefined,
  fieldName: string,
  fallbackName?: string,
): unknown {
  if (!scopeValues) return undefined;
  if (scopeValues[fieldName] !== undefined) return scopeValues[fieldName];
  if (fallbackName && scopeValues[fallbackName] !== undefined) {
    return scopeValues[fallbackName];
  }

  // Also check if stored with an old suffix (e.g. subject_r0, subject_r1)
  const targets = new Set<string>();
  if (fieldName) targets.add(fieldName.toLowerCase());
  if (fallbackName) targets.add(fallbackName.toLowerCase());

  for (const [k, v] of Object.entries(scopeValues)) {
    const kLower = k.toLowerCase();
    const kClean = kLower.replace(/_[a-z0-9]+$/i, "");
    if (targets.has(kLower) || targets.has(kClean)) {
      return v;
    }
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getZodDesc(schema: any): string | undefined {
  if (!schema) return undefined;
  if (schema.description) return schema.description;
  if (schema._def?.description) return schema._def.description;
  if (schema.def?.description) return schema.def.description;
  if (schema._def?.innerType) return getZodDesc(schema._def.innerType);
  if (schema.innerType) return getZodDesc(schema.innerType);
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapZod(schema: any): any {
  let curr = schema;
  while (curr?._def?.innerType || curr?.innerType) {
    curr = curr._def?.innerType || curr.innerType;
  }
  return curr;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatPropEntry(key: string, schema: any): string {
  const desc = getZodDesc(schema);
  const unwrapped = unwrapZod(schema);
  if (unwrapped?.type === "array" && unwrapped.element?.shape) {
    const subProps = Object.entries(unwrapped.element.shape).map(([k, v]) =>
      formatPropEntry(k, v),
    );
    return `${key}: [{ ${subProps.join(", ")} }]`;
  }
  return desc ? `${key} (${desc})` : key;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFormattedProps(propSchema: any): string[] {
  if (!propSchema) return [];
  const shape =
    propSchema.shape ||
    (typeof propSchema._def?.shape === "function"
      ? propSchema._def.shape()
      : propSchema._def?.shape) ||
    propSchema.def?.shape;
  if (shape && typeof shape === "object") {
    return Object.entries(shape).map(([k, v]) => formatPropEntry(k, v));
  }
  return [];
}

export function generateLegoComponentsPrompt(): string {
  const lines: string[] = [];
  for (const [name, def] of Object.entries(catalog.data.components)) {
    const propKeys = extractFormattedProps(def.props);
    const propsStr = propKeys.length > 0 ? ` [${propKeys.join(", ")}]` : "";
    const desc = def.description ? ` - ${def.description}` : "";
    lines.push(`- **${name}**${propsStr}${desc}`);
  }
  return lines.join("\n");
}

export const getUIBlockPrompt = () => `UI block syntax:

- Output a nested tree only: { "type", "props", "children" }. Never use the flat root/elements format.
- "type" is a component name from the catalog, "props" are its properties, and "children" is an optional array of child components.
- Always start with a "Stack" as the root. Every Stack prop is required, so pass all of them: "direction": "vertical", "gap": "md", "align": "stretch", "justify": "start", "className": null.
- Card, Metric, Table, Badge, Button, and SubmitBar take variant "light" (default) or "dark". Never use raw hex colors.
- The example shows structure only. Choose components and layout to fit the content.
- When the user answers a block, the next message carries that block with "submitted": true plus one JSON line { "blockId", "values" }. That JSON is the user's answer: act on those values at once, and never re-render that block or ask the same question again.

Example:
\`\`\`json
{
  "spec": {
    "type": "Stack",
    "props": { "direction": "vertical", "gap": "md" },
    "children": [
      {
        "type": "Card",
        "props": { "title": "Campaign Growth Brief", "variant": "dark" },
        "children": [
          { "type": "Metric", "props": { "label": "Avg CPA", "value": "₹340", "change": "-14%", "trend": "down", "variant": "dark" } }
        ]
      },
      { "type": "SubmitBar", "props": { "label": "Apply Settings", "variant": "dark" } }
    ]
  }
}
\`\`\``;
