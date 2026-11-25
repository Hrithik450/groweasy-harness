import { nestedToFlat } from "@json-render/core";
import { isRenderableAssetUrl } from "@/lib/attachments/asset.url";
import { catalog } from "./catalog";
import { renderableTypeError } from "./renderable";

type NestedUINode = {
  type: string;
  props?: Record<string, unknown>;
  children?: unknown;
  slots?: unknown;
  [key: string]: unknown;
};

export interface CanonicalUINode {
  type: string;
  props: Record<string, unknown>;
  children?: string[];
  slots?: Record<string, string[]>;
}

export interface CanonicalUIMesssage {
  root: string;
  elements: Record<string, CanonicalUINode>;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasDescendantType(
  elements: Record<string, CanonicalUINode>,
  rootId: string,
  type: string,
  seen = new Set<string>(),
): boolean {
  if (seen.has(rootId)) return false;
  seen.add(rootId);
  const element = elements[rootId];
  if (!element) return false;
  for (const childId of element.children ?? []) {
    if (elements[childId]?.type === type) return true;
    if (hasDescendantType(elements, childId, type, seen)) return true;
  }
  return false;
}

function cloneElements(
  elements: Record<string, CanonicalUINode>,
): Record<string, CanonicalUINode> {
  return Object.fromEntries(
    Object.entries(elements).map(([id, element]) => {
      const raw = element as unknown;

      // Keep malformed entries as-is; validateSpec produces the clear error.
      if (!isRecord(raw)) return [id, raw as CanonicalUINode];

      const props = isRecord(raw.props) ? { ...raw.props } : raw.props;
      return [id, { ...raw, props } as unknown as CanonicalUINode];
    }),
  ) as Record<string, CanonicalUINode>;
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
function toFlatSpec(raw: Record<string, unknown>): CanonicalUIMesssage {
  if ("root" in raw && "elements" in raw) {
    if (!isRecord(raw.elements)) {
      throw new Error(
        "Invalid UI specification: 'elements' must be a valid dictionary.",
      );
    }

    // Spread first so the normalized values win over the raw ones.
    return {
      ...raw,
      root: String(raw.root),
      elements: cloneElements(raw.elements as Record<string, CanonicalUINode>),
    };
  }

  if (typeof raw.type !== "string") {
    throw new Error(
      "Invalid UI specification: must have either a 'type' property or '{ root, elements }' structure.",
    );
  }

  // Props may be flat on the node rather than under `props`.
  const node: NestedUINode =
    raw.props != null
      ? (raw as NestedUINode)
      : (() => {
          const { type, children, slots, ...props } = raw;
          return { type, props, children, slots };
        })();

  const flat = nestedToFlat(
    node as Parameters<typeof nestedToFlat>[0],
  ) as CanonicalUIMesssage;

  return { ...flat, elements: cloneElements(flat.elements) };
}

/**
 * Validates structure and every element against the component catalog.
 * Element props are replaced with Zod-parsed output.
 */
function validateSpec(spec: CanonicalUIMesssage): void {
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

    // The catalog validates props for shadcn's lowercase names too, but the
    // renderer only implements the PascalCase set; a "valid" lowercase spec
    // renders blank, so reject it here.
    const typeError = renderableTypeError(element.type);
    if (typeError !== null) {
      throw new Error(`Invalid element "${elId}": ${typeError}.`);
    }

    const componentDef =
      catalog.data.components[
        element.type as keyof typeof catalog.data.components
      ];

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

    // Media props must be browser-fetchable: the attachment route or https.
    for (const key of ["src", "url"] as const) {
      const value = (element.props as Record<string, unknown> | undefined)?.[key];
      if (value === undefined) continue;
      if (!isRenderableAssetUrl(value)) {
        throw new Error(
          `Invalid ${element.type} ("${elId}") at "${key}": expected "/api/attachments/…" or an https URL, got "${String(value)}".`,
        );
      }
    }

    // Link targets must be a real https URL or an in-app path; an empty or
    // placeholder href renders as a dead link.
    if (element.type === "Link") {
      const href = (element.props as { href?: unknown } | undefined)?.href;
      const valid =
        typeof href === "string" &&
        /^(?:https?:\/\/\S+|\/(?!\/)\S*|mailto:\S+|tel:\S+|#\S*)$/i.test(
          href.trim(),
        );
      if (!valid) {
        throw new Error(
          `Invalid Link ("${elId}") at "href": expected an https URL or an app path, got "${String(href)}".`,
        );
      }
    }

    // Replace with validated props from Zod.
    element.props = parseResult.data as Record<string, unknown>;

    // A span can only cover columns that exist, and only real children.
    if (element.type === "Grid") {
      const gridProps = element.props as {
        columns?: number;
        spans?: Array<{ colSpan?: number; rowSpan?: number }>;
      };
      if (Array.isArray(gridProps.spans) && gridProps.spans.length > 0) {
        const childCount = Array.isArray(element.children)
          ? element.children.length
          : 0;
        const cols = Number(gridProps.columns) || 2;
        if (gridProps.spans.length > childCount) {
          throw new Error(
            `Invalid Grid ("${elId}"): spans has ${gridProps.spans.length} entries but the grid has ${childCount} children.`,
          );
        }
        gridProps.spans.forEach((span, index) => {
          if (span?.colSpan !== undefined && span.colSpan > cols) {
            throw new Error(
              `Invalid Grid ("${elId}") at "spans.${index}.colSpan": ${span.colSpan} exceeds the grid's ${cols} column(s).`,
            );
          }
        });
      }
    }

    // Cards are either compact choices or action cards, never both.
    if (
      element.type === "Card" &&
      (element.props as { selectable?: boolean }).selectable &&
      hasDescendantType(elements, elId, "Button")
    ) {
      throw new Error(
        `Invalid Card ("${elId}"): a selectable card cannot contain a Button. Use selectable cards for compact choices, or a Button for a direct action card.`,
      );
    }
  }

  // Every child/slot id must exist, and every element must be reachable from
  // the root. A dangling id or an orphan is a broken block, not a style issue,
  // so reject it here instead of paying for a model verdict.
  const childIdsOf = (element: CanonicalUINode): string[] =>
    Array.isArray(element.children) ? element.children : [];
  const slotIdsOf = (element: CanonicalUINode): string[] =>
    isRecord(element.slots)
      ? Object.values(element.slots).flatMap((ids) =>
          Array.isArray(ids) ? ids : [],
        )
      : [];

  for (const [elId, element] of Object.entries(elements)) {
    for (const childId of childIdsOf(element)) {
      if (!elements[childId]) {
        throw new Error(
          `Invalid UI specification: "${elId}" references missing child "${childId}".`,
        );
      }
    }
    for (const id of slotIdsOf(element)) {
      if (!elements[id]) {
        throw new Error(
          `Invalid UI specification: "${elId}" slot references missing element "${id}".`,
        );
      }
    }
  }

  const reachable = new Set<string>();
  const queue: string[] = [root];
  while (queue.length > 0) {
    const id = queue.pop();
    if (id === undefined || reachable.has(id)) continue;
    const element = elements[id];
    if (!element) continue;
    reachable.add(id);
    queue.push(...childIdsOf(element), ...slotIdsOf(element));
  }
  const orphans = Object.keys(elements).filter((id) => !reachable.has(id));
  if (orphans.length > 0) {
    throw new Error(
      `Invalid UI specification: unreachable element(s) ${orphans.join(", ")} — every element must be rendered from "${root}".`,
    );
  }

  // Selectable Chips are a commit group: they must sit first or last.
  for (const [elId, element] of Object.entries(elements)) {
    const children = element.children;
    if (!Array.isArray(children) || children.length === 0) continue;
    const chipIndexes = children
      .map((childId, index) =>
        elements[childId]?.type === "Chips" ? index : -1,
      )
      .filter((index) => index >= 0);
    if (chipIndexes.length === 0) continue;
    const atStart = chipIndexes.every((index, position) => index === position);
    const atEnd = chipIndexes.every(
      (index, position) =>
        index === children.length - chipIndexes.length + position,
    );
    if (!atStart && !atEnd) {
      throw new Error(
        `Invalid Chips inside "${elId}": selectable chips must be the first or last group so their submit control sits directly beside them.`,
      );
    }
  }
}

export function validateAndNormalizeUI(
  rawUI: unknown,
): CanonicalUIMesssage | undefined {
  if (!rawUI) return undefined;

  const spec = toFlatSpec(parseInput(rawUI));
  validateSpec(spec);

  return spec;
}
