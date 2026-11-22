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
  Carousel: _car,
  ...cleanShadcnDefinitions
} = shadcnComponentDefinitions;

/**
 * Universal Generative UI Catalog.
 * Curated brand layout & interactive primitives for chat generative UI.
 */
export const catalog = defineCatalog(schema, {
  components: {
    ...cleanShadcnDefinitions,
    Stack: {
      props: z.object({
        direction: z.enum(["horizontal", "vertical"]).nullable(),
        gap: z.enum(["none", "sm", "md", "lg", "xl"]).nullable(),
        align: z
          .enum(["start", "center", "end", "stretch", "baseline"])
          .nullable()
          .describe(
            "'baseline' for rows of text; 'center'/'start'/'end' for icons or controls; 'stretch' for vertical",
          ),
        justify: z
          .enum(["start", "center", "end", "between", "around"])
          .nullable(),
      }),
      description:
        "Flex container for layouts. Use align 'baseline' when a row mixes text sizes (eyebrow + heading).",
      example: { direction: "horizontal", gap: "md", align: "baseline" },
    },
    Heading: {
      props: z.object({
        text: z.string().describe("max 4 to 11 words"),
        level: z.enum(["h1", "h2", "h3", "h4", "h5", "h6"]).optional(),
      }),
      description: "Heading text (level h1-h6, max 4-11 words)",
    },
    Text: {
      props: z.object({
        text: z.string().describe("max 10 to 18 words (2-3 lines max)"),
        variant: z
          .enum(["accent", "light", "dark"])
          .optional()
          .describe("text colour only: 'accent', 'light', or 'dark'"),
        size: z
          .enum(["xs", "sm", "md", "lg"])
          .optional()
          .describe("body size: 'xs', 'sm', 'md' (default), or 'lg'"),
      }),
      description:
        "Body text with independent colour (variant) and size (size), max 10-18 words",
    },
    Eyebrow: {
      props: z.object({
        text: z.string().describe("max 1 to 4 words, or a short number"),
        size: z
          .enum(["sm", "md", "lg", "xl"])
          .optional()
          .describe("'sm' (default), 'md', 'lg', or 'xl'"),
        variant: z
          .enum(["accent", "muted", "foreground"])
          .optional()
          .describe("'accent' (default orange), 'muted', or 'foreground'"),
      }),
      description:
        "Small or large label above content. Compose it inside Stack when a card needs a numbered marker or kicker.",
    },
    Badge: {
      props: z.object({
        text: z.string().describe("max 1 to 2 words"),
        variant: z
          .enum([
            "accent",
            "light",
            "muted",
            "dark",
            "outline",
            "success",
            "destructive",
          ])
          .optional()
          .describe(
            "badge style: 'accent' (default orange), 'muted', 'light', 'dark', or 'outline'",
          ),
      }),
      description: "Status badge pill (max 1-2 words)",
    },
    Alert: {
      props: z.object({
        title: z.string().optional().describe("max 3 to 7 words"),
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
        value: z
          .string()
          .optional()
          .describe("value sent when pressed; defaults to the label"),
      }),
      description:
        "Submit button. Pressing it commits the block with its value and any current selections.",
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
    Separator: {
      props: z.object({
        orientation: z
          .enum(["horizontal", "vertical"])
          .optional()
          .describe("'horizontal' (default) or 'vertical'"),
        variant: z
          .enum(["light", "dark", "muted", "strong"])
          .optional()
          .describe("'light', 'dark', 'muted' (default), or 'strong'"),
      }),
      description:
        "Horizontal or vertical line divider between content blocks.",
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
          .array(
            z.array(
              z.union([
                z.string(),
                z.object({
                  text: z
                    .string()
                    .optional()
                    .describe("badge label, max 1-2 words"),
                  mark: z.boolean().optional(),
                  badge: z
                    .enum(["accent", "dark", "muted"])
                    .optional()
                    .describe(
                      "render text as a badge: 'accent' filled, 'dark' outlined strong, 'muted' outlined quiet",
                    ),
                }),
              ]),
            ),
          )
          .describe(
            "cells: plain text, { text }, { mark: true/false } for a marker, or { text, badge } for a status badge",
          ),
        highlightRows: z
          .array(z.number().int().min(0))
          .optional()
          .describe("zero-based row indexes to highlight"),
        variant: z
          .enum(["accent", "light", "dark"])
          .optional()
          .describe(
            "table style: 'accent' (default orange), 'light', or 'dark'",
          ),
        headerVariant: z
          .enum(["light", "dark"])
          .optional()
          .describe(
            "header row style: 'light' or 'dark'; defaults to the table variant",
          ),
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
        selectable: z
          .boolean()
          .optional()
          .describe(
            "compact choice card only: shows a radio and must NOT contain a Button; cards with an action are never selectable",
          ),
        aspectRatio: z
          .enum(["9/16", "4/5", "1/1", "16/9", "3/2"])
          .optional()
          .describe(
            "asset aspect ratio: '9/16', '1/1', '4/5', '16/9', '3/2' (bounds card width automatically)",
          ),
        variant: z
          .enum(["accent", "light", "muted", "dark"])
          .optional()
          .describe(
            "'accent' (default orange), 'muted' for a quiet card, 'light' for a plain card, or 'dark' for contrast",
          ),
      }),
      description:
        "Surface container. Two mutually exclusive modes: a compact choice card may set selectable=true (radio, no Button child); an action surface composes a Button child and must never be selectable.",
    },
    Grid: {
      props: z.object({
        columns: z.number().min(1).max(12).optional().describe("1-12 columns"),
        gap: z.enum(["sm", "md"]).optional(),
        stretchLast: z
          .boolean()
          .optional()
          .describe(
            "true for odd text/card grids so the last item fills the row; false whenever image or video children are present so media is not stretched or distorted",
          ),
        spans: z
          .array(
            z.object({
              colSpan: z.number().int().min(1).max(12).optional(),
              rowSpan: z.number().int().min(1).max(12).optional(),
            }),
          )
          .optional()
          .describe(
            "per-child spans in child order; colSpan cannot exceed columns, omit for equal widths",
          ),
      }),
      description:
        "Responsive 1-12 column grid. Use spans to make any child wider or taller (e.g. media colSpan 1 + content colSpan 2). Rows wrap automatically; use colSpan totals that fill the columns.",
    },
    Chips: {
      props: z.object({
        name: z.string().optional(),
        label: z.string().optional().describe("max 2 to 3 words"),
        items: z
          .array(z.string())
          .describe("chip labels, max 1 to 3 words each"),
        variant: z
          .enum(["accent", "muted", "light", "dark"])
          .optional()
          .describe("chip style; 'accent' (default orange)"),
        selectable: z.boolean().optional(),
        multiSelect: z.boolean().optional(),
      }),
      description:
        "Row of search chips or tag pills (max 1-3 words per chip). When selectable=true, user can click to toggle selection under `name`.",
    },
    SubmitBar: {
      props: z.object({
        label: z.string().describe("max 2 to 3 words"),
        statusText: z.string().optional().describe("max 3 to 5 words"),
        disabled: z.boolean().optional(),
        variant: z
          .enum(["dark", "light"])
          .optional()
          .describe(
            "'dark' (default) for primary brand CTA, 'light' for subtle/secondary bar",
          ),
      }),
      description:
        "Commit control for multi-select or several inline controls: label (max 2-3 words) and optional statusText (max 3-5 words). Not needed when a single selectable Card submits on click or a Button already commits.",
    },
    Image: {
      props: z.object({
        src: z.string(),
        alt: z.string().optional().describe("max 3 to 4 words"),
        aspectRatio: z.enum(["9/16", "4/5", "1/1", "16/9", "3/2"]).optional(),
        fit: z.enum(["contain", "cover"]).optional(),
      }),
      description:
        "Rich interactive image preview, aspect-ratio scaling, and optional alt (max 3-4 words). Use to display marketing creatives or competitor visuals.",
    },
    Video: {
      props: z.object({
        src: z.string(),
        title: z.string().optional().describe("max 3 to 7 words"),
        aspectRatio: z.enum(["9/16", "4/5", "1/1", "16/9", "3/2"]).optional(),
      }),
      description:
        "Rich inline video player with playback controls, timeline scrub bar, volume, aspect-ratio scaling, and optional title (max 3-4 words). Use to present video creatives or competitor video ads.",
    },
    Audio: {
      props: z.object({
        src: z.string(),
        title: z.string().optional().describe("max 3 to 7 words"),
      }),
      description:
        "Rich inline audio player with playback controls, timeline scrubbing, volume, download, and optional title (max 3-4 words). Use to present voiceovers, music tracks, or sound effects.",
    },
    ProgressBar: {
      props: z.object({
        label: z.string().describe("max 3 to 5 words"),
        value: z.number().min(0).max(100),
        color: z.enum(["dark", "accent", "grey", "muted"]).optional(),
      }),
      description:
        "One labeled progress row: label on the left, bar and percentage on the right. Stack several for a share breakdown.",
    },
    BarChart: {
      props: z.object({
        data: z.array(z.record(z.string(), z.any())),
        xKey: z.string(),
        yKey: z.union([z.string(), z.array(z.string())]),
        title: z.string().optional().describe("max 3 to 5 words"),
        layout: z.enum(["horizontal", "vertical"]).optional(),
        height: z.number().optional(),
        stacked: z
          .boolean()
          .optional()
          .describe("stack yKey series into one bar per row"),
        color: z.enum(["brand", "amber", "multi"]).optional(),
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
              color: z.string().optional(),
            }),
          )
          .optional(),
        yKey: z.string().optional(),
        title: z.string().optional().describe("max 3 to 5 words"),
        height: z.number().optional(),
        curve: z.enum(["smooth", "linear"]).optional(),
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
              color: z.string().optional(),
            }),
          )
          .optional(),
        yKey: z.string().optional(),
        title: z.string().optional().describe("max 3 to 5 words"),
        height: z.number().optional(),
      }),
      description:
        "Interactive area chart with smooth gradient fills and title (max 3-5 words) for cumulative metrics and volume growth.",
    },
    PieChart: {
      props: z.object({
        data: z.array(
          z.object({
            name: z.string().describe("max 2 to 3 words"),
            value: z.number(),
            color: z.string().optional(),
          }),
        ),
        donut: z.boolean().optional(),
        title: z.string().optional().describe("max 3 to 5 words"),
        height: z.number().optional(),
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
            color: z.string().optional(),
          }),
        ),
        dimensionKey: z.string().optional(),
        title: z.string().optional().describe("max 3 to 5 words"),
        height: z.number().optional(),
      }),
      description:
        "Radar chart with title (max 3-5 words) for multi-dimensional competitor capability comparisons (e.g. Automation, UX, Pricing, Speed).",
    },
  },
  actions: {},
});

export type AppCatalog = typeof catalog;
