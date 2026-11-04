import { catalog } from "./catalog";
import { nestedToFlat } from "@json-render/core";
import type { UIBlockNode, UIBlockSpec } from "./types";

type NestedUINode = {
  type: string;
  props?: Record<string, unknown>;
  children?: unknown;
  slots?: unknown;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneElements(
  elements: Record<string, UIBlockNode>,
): Record<string, UIBlockNode> {
  return Object.fromEntries(
    Object.entries(elements).map(([id, element]) => {
      const raw = element as unknown;

      if (!isRecord(raw)) return [id, raw as UIBlockNode];

      const props = isRecord(raw.props) ? { ...raw.props } : raw.props;
      return [id, { ...raw, props } as unknown as UIBlockNode];
    }),
  ) as Record<string, UIBlockNode>;
}

/**
 * Accepts an object or a JSON string (optionally wrapped in <ui-block> tags).
 */
function parseInput(rawUI: unknown): Record<string, unknown> {
  let parsed = rawUI;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed.replace(/<\/?ui-block>/g, "").trim());
    } catch {
      throw new Error(
        "Invalid UI specification: string could not be parsed as valid JSON.",
      );
    }
  }

  if (!isRecord(parsed)) {
    throw new Error("Invalid UI specification: must be an object.");
  }

  return parsed;
}

/**
 * Normalizes either a flat `{ root, elements }` spec or a nested component
 * tree into the canonical flat representation.
 */
function toFlatSpec(raw: Record<string, unknown>): UIBlockSpec {
  if ("root" in raw && "elements" in raw) {
    if (!isRecord(raw.elements)) {
      throw new Error(
        "Invalid UI specification: 'elements' must be a valid dictionary.",
      );
    }

    return {
      ...raw,
      root: String(raw.root),
      elements: cloneElements(raw.elements as Record<string, UIBlockNode>),
    };
  }

  if (typeof raw.type !== "string") {
    throw new Error(
      "Invalid UI specification: must have either a 'type' property or '{ root, elements }' structure.",
    );
  }

  const node: NestedUINode =
    raw.props != null
      ? (raw as NestedUINode)
      : (() => {
          const { type, children, slots, ...props } = raw;
          return { type, props, children, slots };
        })();

  const flat = nestedToFlat(
    node as Parameters<typeof nestedToFlat>[0],
  ) as UIBlockSpec;

  return { ...flat, elements: cloneElements(flat.elements) };
}

/** Catalog names are PascalCase; models routinely emit them lowercase. */
const CANONICAL_TYPES: ReadonlyMap<string, string> = new Map(
  Object.keys(catalog.data.components).map((name) => [
    name.toLowerCase(),
    name,
  ]),
);

/**
 * Resolve one element's `type` to the catalog's spelling.
 *
 * The renderer looks components up by exact registry key, so `"card"` would
 * silently render nothing while `"Card"` renders. Unknown types are rejected
 * here, with the catalog in the message, so the model can correct the call
 * instead of shipping a block that draws a blank.
 *
 * @param type - the type string the model emitted.
 * @param elId - element id, for the error message.
 * @returns the catalog's spelling of the same component.
 */
function canonicalType(type: string, elId: string): string {
  const name = CANONICAL_TYPES.get(type.trim().toLowerCase());
  if (name === undefined) {
    throw new Error(
      `Unknown component type "${type}" ("${elId}"). Use a catalog component name — the full catalog is: ${[...CANONICAL_TYPES.values()].join(", ")}.`,
    );
  }
  return name;
}

/**
 * Validates structure and every element against the component catalog.
 * Element types are canonicalized and props are replaced with Zod-parsed output.
 */
function validateSpec(spec: UIBlockSpec): void {
  const { root, elements } = spec;

  if (!isRecord(elements) || Object.keys(elements).length === 0) {
    throw new Error(
      "Invalid UI specification: 'elements' must be a valid dictionary.",
    );
  }

  if (!elements[root]) {
    throw new Error(
      `Invalid UI specification: root element "${root}" not found in elements dictionary.`,
    );
  }

  for (const [elId, element] of Object.entries(elements)) {
    if (
      !isRecord(element) ||
      typeof element.type !== "string" ||
      !element.type
    ) {
      throw new Error(`Invalid element "${elId}": missing 'type'.`);
    }

    const name = canonicalType(element.type, elId);
    element.type = name;
    const componentDef =
      catalog.data.components[name as keyof typeof catalog.data.components];

    if (!componentDef?.props) continue;

    const parseResult = componentDef.props.safeParse(element.props ?? {});
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      const pathStr =
        firstIssue.path.length > 0 ? firstIssue.path.join(".") : "root";
      throw new Error(
        `Invalid ${element.type} ("${elId}") at "${pathStr}": ${firstIssue.message}.`,
      );
    }

    element.props = parseResult.data as Record<string, unknown>;
  }
}

/**
 * Rewrites element types to the catalog's spelling, never throwing.
 *
 * A spec is persisted exactly as the tool emitted it, so transcripts written
 * before a spelling fix still hold `"card"` where the registry has `Card`.
 * Rendering passes specs through here; an unknown type is left untouched and
 * simply draws nothing, as before.
 *
 * @param spec - flat block spec read from the session log.
 * @returns the spec with catalog-cased element types.
 */
export function canonicalizeBlockTypes(spec: UIBlockSpec): UIBlockSpec {
  if (!isRecord(spec.elements)) return spec;

  const elements = Object.fromEntries(
    Object.entries(spec.elements).map(([id, element]) => {
      const name =
        typeof element?.type === "string"
          ? CANONICAL_TYPES.get(element.type.trim().toLowerCase())
          : undefined;
      return [
        id,
        name !== undefined && name !== element.type
          ? { ...element, type: name }
          : element,
      ];
    }),
  );

  return { ...spec, elements };
}

export function validateAndNormalizeUI(
  rawUI: unknown,
): UIBlockSpec | undefined {
  if (!rawUI) return undefined;

  const spec = toFlatSpec(parseInput(rawUI));
  validateSpec(spec);

  return spec;
}
