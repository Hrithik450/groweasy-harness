/**
 * Component types the React renderer can actually draw.
 *
 * The catalog (used by validation) also carries shadcn's lowercase
 * definitions, but the renderer registry only implements the PascalCase set
 * below. A spec can therefore be "valid" and still render blank — validation
 * must use this set, not the catalog alone.
 *
 * @module @/lib/generative.ui/renderable
 */

export const RENDERABLE_COMPONENT_TYPES: ReadonlySet<string> = new Set([
  "Accordion",
  "Alert",
  "AreaChart",
  "Audio",
  "Avatar",
  "Badge",
  "BarChart",
  "Button",
  "Card",
  "Checkbox",
  "Chips",
  "Eyebrow",
  "Grid",
  "Heading",
  "Image",
  "Input",
  "LineChart",
  "Link",
  "PieChart",
  "ProgressBar",
  "RadarChart",
  "Radio",
  "Select",
  "Separator",
  "Slider",
  "Stack",
  "SubmitBar",
  "Switch",
  "Table",
  "Tabs",
  "Text",
  "Textarea",
  "Tooltip",
  "Video",
]);

/** Common wrong-case / shadcn names, so the error names the right component. */
const TYPE_SUGGESTIONS: Record<string, string> = {
  accordion: "Accordion",
  alert: "Alert",
  areachart: "AreaChart",
  audio: "Audio",
  avatar: "Avatar",
  badge: "Badge",
  barchart: "BarChart",
  button: "Button",
  card: "Card",
  checkbox: "Checkbox",
  chips: "Chips",
  eyebrow: "Eyebrow",
  grid: "Grid",
  header: "Heading",
  heading: "Heading",
  image: "Image",
  input: "Input",
  linechart: "LineChart",
  link: "Link",
  piechart: "PieChart",
  progressbar: "ProgressBar",
  radarchart: "RadarChart",
  radio: "Radio",
  select: "Select",
  separator: "Separator",
  slider: "Slider",
  stack: "Stack",
  submitbar: "SubmitBar",
  switch: "Switch",
  table: "Table",
  tabs: "Tabs",
  text: "Text",
  textarea: "Textarea",
  tooltip: "Tooltip",
  video: "Video",
};

/** `null` when the renderer supports the type, else a corrective message. */
export function renderableTypeError(type: string): string | null {
  if (RENDERABLE_COMPONENT_TYPES.has(type)) return null;
  const suggestion = TYPE_SUGGESTIONS[type.trim().toLowerCase()];
  return `"${type}" is not a renderable component${
    suggestion ? `; use "${suggestion}"` : ""
  }`;
}

/** Whether a stored spec can be handed to the renderer without going blank. */
export function isRenderableSpec(spec: unknown): boolean {
  if (!spec || typeof spec !== "object") return false;
  const { root, elements } = spec as {
    root?: unknown;
    elements?: unknown;
  };
  if (typeof root !== "string" || !elements || typeof elements !== "object") {
    return false;
  }
  const map = elements as Record<string, unknown>;
  if (!map[root]) return false;
  for (const element of Object.values(map)) {
    const type = (element as { type?: unknown } | null)?.type;
    if (typeof type !== "string" || !RENDERABLE_COMPONENT_TYPES.has(type)) {
      return false;
    }
  }
  return true;
}
