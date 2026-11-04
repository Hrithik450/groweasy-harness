import { z } from "zod";
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";

const {
  Collapsible: _c,
  Dialog: _d,
  Drawer: _dr,
  Progress: _pr,
  Skeleton: _sk,
  Spinner: _sp,
  Popover: _pop,
  DropdownMenu: _dm,
  Toggle: _tog,
  ToggleGroup: _tg,
  ButtonGroup: _bg,
  Pagination: _pag,
  ...cleanShadcnDefinitions
} = shadcnComponentDefinitions;

/**
 * The shadcn definitions mark every prop nullable but still required, so a
 * model omitting `className` fails validation and is pushed into inventing
 * one. Only the props that never affect layout or usability become optional
 * here: the CSS-class escape hatch, the interaction-state initials, and the
 * validation plumbing the model must not hand-author. Everything that shapes
 * the layout (direction, columns, options, labels, ranges) stays required.
 */
const COSMETIC_PROPS = {
  className: true,
  checks: true,
  validateOn: true,
  value: true,
  checked: true,
} as const;

const lenientShadcnDefinitions = Object.fromEntries(
  Object.entries(cleanShadcnDefinitions).map(([name, definition]) => {
    const props = (definition as { props?: unknown }).props;
    if (props === null || typeof props !== "object" || !("shape" in props)) {
      return [name, definition];
    }
    const shape = (props as { shape: Record<string, unknown> }).shape;
    // Zod 4 rejects a mask naming keys the object does not have.
    const mask = Object.fromEntries(
      Object.keys(COSMETIC_PROPS)
        .filter((key) => key in shape)
        .map((key) => [key, true]),
    );
    return [
      name,
      {
        ...definition,
        props: (
          props as unknown as { partial(mask: object): unknown }
        ).partial(mask),
      },
    ];
  }),
) as typeof cleanShadcnDefinitions;

/**
 * Chart series colors are palette names, not raw CSS values. The renderer
 * resolves known names (orange, ink, success, warning, muted, chart-1…5) to the
 * `--chart-*` theme tokens and falls back to the categorical palette for any
 * unrecognized string, so model output can never inject arbitrary colors.
 */
const chartColorName = z
  .string()
  .optional()
  .describe(
    'Palette name: "orange", "ink", "success", "warning", "muted", or "chart-1" through "chart-5".',
  );

/**
 * Universal Generative UI Catalog.
 * Curated brand layout & interactive primitives for chat generative UI.
 */
export const catalog = defineCatalog(schema, {
  components: {
    ...lenientShadcnDefinitions,
    // The shadcn Stack only admits "horizontal"/"vertical", but the block
    // protocol (and the registry's own default) speak "column"/"row" — the
    // very value the prompt example emits. Accept all four spellings.
    Stack: {
      props: z.object({
        direction: z
          .enum(["column", "row", "horizontal", "vertical"])
          .describe("'column' for stacked content (the usual root), 'row' for side-by-side"),
        gap: z.enum(["none", "sm", "md", "lg"]).optional(),
        align: z.string().optional(),
        justify: z.string().optional(),
        className: z.string().optional(),
      }),
      description:
        "Flex container for layouts; start every block with a Stack of direction 'column'",
    },
    Heading: {
      props: z.object({
        text: z.string().describe("max 4 to 6 words"),
        level: z.enum(["h1", "h2", "h3", "h4"]).optional(),
      }),
      description: "Heading text (level h1-h4, max 4-6 words)",
    },
    Text: {
      props: z.object({
        text: z.string().describe("max 10 to 12 words (2 lines max)"),
        variant: z
          .enum(["default", "muted", "caption", "p", "lead"])
          .optional(),
      }),
      description: "Paragraph text (max 10-12 words, 2 lines max)",
    },
    Badge: {
      props: z.object({
        text: z.string().describe("max 1 to 2 words"),
        variant: z
          .enum(["light", "dark", "success", "destructive"])
          .optional()
          .describe("badge style: 'light' (default) or 'dark'"),
      }),
      description: "Status badge pill (max 1-2 words)",
    },
    Alert: {
      props: z.object({
        title: z.string().optional().describe("max 3 to 4 words"),
        message: z.string().describe("max 10 to 12 words (2 lines max)"),
        type: z.enum(["info", "warning", "success", "error"]).optional(),
      }),
      description:
        "Alert banner with title (max 3-4 words) and message (max 10-12 words, 2 lines max)",
    },
    Button: {
      props: z.object({
        label: z.string().describe("max 2 to 3 words"),
        variant: z
          .enum(["dark", "light", "destructive", "outline", "ghost"])
          .optional()
          .describe("'dark' (default) for primary, 'light' for secondary"),
        disabled: z.boolean().optional(),
      }),
      description: "Clickable button with label (max 2-3 words)",
    },
    Link: {
      props: z.object({
        label: z.string().describe("max 2 to 3 words"),
        href: z.string(),
      }),
      description: "Anchor link with label (max 2-3 words)",
    },
    Tooltip: {
      props: z.object({
        content: z.string().describe("max 5 to 7 words"),
        text: z.string().describe("trigger text, max 2 to 4 words"),
      }),
      description:
        "Hover tooltip with content (max 5-7 words) over trigger text (max 2-4 words)",
    },
    Accordion: {
      props: z.object({
        items: z.array(
          z.object({
            title: z.string().describe("max 3 to 5 words"),
            content: z.string().describe("max 12 to 15 words"),
          }),
        ),
        type: z.enum(["single", "multiple"]).optional(),
      }),
      description:
        "Collapsible sections with item title (max 3-5 words) and content (max 12-15 words)",
    },
    Tabs: {
      props: z.object({
        tabs: z.array(
          z.object({
            label: z.string().describe("max 1 to 3 words"),
            value: z.string(),
          }),
        ),
        defaultValue: z.string().optional(),
        value: z.string().optional(),
      }),
      description: "Tab navigation with tab label (max 1-3 words)",
    },
    Table: {
      props: z.object({
        columns: z
          .array(z.string())
          .describe("header labels, max 1 to 3 words each"),
        rows: z
          .array(z.array(z.string()))
          .describe("cell values, max 3 to 5 words per cell"),
        variant: z
          .enum(["light", "dark"])
          .optional()
          .describe("theme: 'light' (default) or 'dark'"),
      }),
      description:
        "Data table with concise column headers (max 1-3 words) and cell values (max 3-5 words)",
    },
    Card: {
      props: z.object({
        name: z
          .string()
          .optional()
          .describe("group name for interactive selection"),
        value: z
          .string()
          .optional()
          .describe("value submitted when card is selected"),
        selectable: z.boolean().optional(),
        // Accepted alias: models reliably write "interactive" here, and a
        // stripped unknown key would silently leave the card inert.
        interactive: z.boolean().optional().describe("alias of selectable"),
        eyebrow: z.string().optional().describe("max 1 to 2 words"),
        badge: z.string().optional().describe("max 1 to 2 words"),
        title: z.string().optional().describe("max 3 to 4 words"),
        description: z.string().optional().describe("max 10 to 12 words"),
        aspectRatio: z
          .enum(["9/16", "4/5", "1/1", "16/9", "3/2"])
          .optional()
          .describe(
            "asset aspect ratio: '9/16', '1/1', '4/5', '16/9', '3/2' (bounds card width automatically)",
          ),
        variant: z
          .enum(["light", "dark"])
          .optional()
          .describe(
            "'dark' for brand card, 'light' (default) for standard cards",
          ),
      }),
      description:
        "Container card with title (max 3-4 words), description (max 10-12 words), optional badge, and aspectRatio. When selectable=true, acts as an interactive choice card within a `name` group.",
    },
    Grid: {
      props: z.object({
        columns: z
          .number()
          .min(1)
          .max(2)
          .optional()
          .describe("max 2 columns for card grids to keep cards legible"),
        gap: z.enum(["sm", "md"]).optional(),
        layout: z.enum(["grid", "flex"]).optional(),
        stretchLast: z.boolean().optional(),
        className: z.string().optional(),
      }),
      description:
        "Responsive grid (max 2 columns for card layouts) that stretches cards to cover full width equally with auto-stretch for remaining odd cards",
    },
    Carousel: {
      props: z.object({
        items: z
          .array(
            z.object({
              title: z.string().optional().describe("max 3 to 4 words"),
              description: z
                .string()
                .optional()
                .describe("max 10 to 12 words."),
              src: z.string().optional(),
              sourceLink: z.string().optional(),
              aspectRatio: z
                .enum(["9/16", "4/5", "1/1", "16/9", "3/2"])
                .optional()
                .describe("'9/16', '1/1', '4/5', '16/9', '3/2'"),
              fit: z.enum(["contain", "cover"]).optional(),
              className: z.string().optional(),
            }),
          )
          .optional(),
      }),
      description:
        "Horizontally scrollable carousel. Each item or child card includes title (max 3-4 words) and description assets. Supports nested child cards or items array.",
    },
    Chips: {
      props: z.object({
        name: z.string().optional(),
        label: z.string().optional().describe("max 2 to 3 words"),
        items: z
          .array(z.string())
          .describe("chip labels, max 1 to 3 words each"),
        selectable: z.boolean().optional(),
        interactive: z.boolean().optional().describe("alias of selectable"),
        multiSelect: z.boolean().optional(),
        className: z.string().optional(),
      }),
      description:
        "Row of search chips or tag pills (max 1-3 words per chip). When selectable=true, user can click to toggle selection under `name`.",
    },
    SubmitBar: {
      props: z.object({
        label: z.string().describe("max 2 to 3 words"),
        statusText: z.string().optional().describe("max 3 to 5 words"),
        secondaryLabel: z.string().optional().describe("max 2 to 3 words"),
        secondaryAction: z.string().optional(),
        disabled: z.boolean().optional(),
        variant: z
          .enum(["dark", "light"])
          .optional()
          .describe(
            "'dark' (default) for primary brand CTA, 'light' for subtle/secondary bar",
          ),
      }),
      description:
        "Unified action submission bar with label (max 2-3 words) and optional statusText (max 3-5 words). Collects all selected values from interactive components and submits them back to the you.",
    },
    Image: {
      props: z.object({
        src: z.string(),
        alt: z.string().optional().describe("max 3 to 4 words"),
        aspectRatio: z.enum(["9/16", "4/5", "1/1", "16/9", "3/2"]).optional(),
        fit: z.enum(["contain", "cover"]).optional(),
        className: z.string().optional(),
      }),
      description:
        "Rich interactive image preview, aspect-ratio scaling, and optional alt (max 3-4 words). Use to display marketing creatives or competitor visuals.",
    },
    Video: {
      props: z.object({
        src: z.string(),
        title: z.string().optional().describe("max 3 to 4 words"),
        aspectRatio: z.enum(["9/16", "4/5", "1/1", "16/9", "3/2"]).optional(),
        className: z.string().optional(),
      }),
      description:
        "Rich inline video player with playback controls, timeline scrub bar, volume, aspect-ratio scaling, and optional title (max 3-4 words). Use to present video creatives or competitor video ads.",
    },
    Audio: {
      props: z.object({
        src: z.string(),
        title: z.string().optional().describe("max 3 to 4 words"),
        className: z.string().optional(),
      }),
      description:
        "Rich inline audio player with playback controls, timeline scrubbing, volume, download, and optional title (max 3-4 words). Use to present voiceovers, music tracks, or sound effects.",
    },
    Columns: {
      props: z.object({
        columns: z.array(
          z.object({
            title: z.string().describe("max 2 to 3 words"),
            items: z
              .array(z.string())
              .describe("bullet items, max 5 to 7 words each"),
          }),
        ),
      }),
      description:
        "Multi-column breakdown divided by vertical borders with column title (max 2-3 words) and bullet items (max 5-7 words each).",
    },
    BarChart: {
      props: z.object({
        data: z.array(z.record(z.string(), z.any())),
        xKey: z.string(),
        yKey: z.union([z.string(), z.array(z.string())]),
        title: z.string().optional().describe("max 3 to 5 words"),
        layout: z.enum(["horizontal", "vertical"]).optional(),
        height: z.number().optional(),
        color: z
          .enum(["brand", "amber", "multi"])
          .optional()
          .describe(
            'Palette preset: "brand" (ink-led), "amber" (orange-led) or "multi" (full categorical palette).',
          ),
        className: z.string().optional(),
      }),
      description:
        "Interactive bar chart with title (max 3-5 words) for comparing metrics across competitors, channels, or ad creatives (supports horizontal and vertical bars).",
    },
    LineChart: {
      props: z.object({
        data: z.array(z.record(z.string(), z.any())),
        xKey: z.string(),
        series: z
          .array(
            z.object({
              key: z.string(),
              label: z.string().optional().describe("max 2 to 3 words"),
              color: chartColorName,
            }),
          )
          .optional(),
        yKey: z.string().optional(),
        title: z.string().optional().describe("max 3 to 5 words"),
        height: z.number().optional(),
        curve: z.enum(["smooth", "linear"]).optional(),
        className: z.string().optional(),
      }),
      description:
        "Interactive line chart with title (max 3-5 words) for showing trends, CTR evolution, or CPA progression over time.",
    },
    AreaChart: {
      props: z.object({
        data: z.array(z.record(z.string(), z.any())),
        xKey: z.string(),
        series: z
          .array(
            z.object({
              key: z.string(),
              label: z.string().optional().describe("max 2 to 3 words"),
              color: chartColorName,
            }),
          )
          .optional(),
        yKey: z.string().optional(),
        title: z.string().optional().describe("max 3 to 5 words"),
        height: z.number().optional(),
        className: z.string().optional(),
      }),
      description:
        "Interactive area chart with subtle tonal fills and title (max 3-5 words) for cumulative metrics and volume growth.",
    },
    PieChart: {
      props: z.object({
        data: z.array(
          z.object({
            name: z.string().describe("max 2 to 3 words"),
            value: z.number(),
            color: chartColorName,
          }),
        ),
        donut: z.boolean().optional(),
        title: z.string().optional().describe("max 3 to 5 words"),
        height: z.number().optional(),
        className: z.string().optional(),
      }),
      description:
        "Interactive donut or pie chart with title (max 3-5 words) for media budget allocations, audience share splits, and channel breakdowns.",
    },
    RadarChart: {
      props: z.object({
        data: z.array(z.record(z.string(), z.any())),
        keys: z.array(
          z.object({
            key: z.string(),
            label: z.string().optional().describe("max 2 to 3 words"),
            color: chartColorName,
          }),
        ),
        dimensionKey: z.string().optional(),
        title: z.string().optional().describe("max 3 to 5 words"),
        height: z.number().optional(),
        className: z.string().optional(),
      }),
      description:
        "Radar chart with title (max 3-5 words) for multi-dimensional competitor capability comparisons (e.g. Automation, UX, Pricing, Speed).",
    },
    Metric: {
      props: z.object({
        label: z.string().describe("max 2 to 3 words"),
        value: z
          .union([z.string(), z.number()])
          .describe("concise stat, e.g. '$18.40' or '+24%'"),
        change: z
          .string()
          .optional()
          .describe(
            "percentage or delta, e.g. '+24%', pair with matching trend",
          ),
        trend: z
          .enum(["up", "down", "neutral"])
          .optional()
          .describe(
            "pair with change: 'up' (gains), 'down' (drops), 'neutral'",
          ),
        variant: z
          .enum(["light", "dark"])
          .optional()
          .describe(
            "visual style: 'dark' for primary/hero KPI, 'light' (default) for standard metrics",
          ),
      }),
      description:
        "Executive KPI metric card with label (max 2-3 words), stat value, and change indicator (always pair change with its matching trend: up, down, or neutral).",
    },
  },
  actions: {},
});

export type AppCatalog = typeof catalog;
