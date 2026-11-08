---
name: render-template
description: "Standardized SVG presets for video hook overlays and branded end cards, rasterized with renderElement and composited with ffmpeg."
---

## Rules

- **Strict presets:** Use the exact geometry, hierarchy, and coordinates below. Never redesign or restyle the templates.
- **Placeholders only:** Substitute `{BRAND_NAME_PART_1}`, `{HOOK_LINE_1}`, `{CTA_URL}`, `{PHONE_NUMBER}`, and color tokens with campaign data.
- **Preset 1 is transparent:** Footage must show through; display from `t=0` to `t=1.2`.
- **Preset 2 is opaque:** Full-screen `1080x1920` end card for the final 2.5–3.5s.
- **Chain:** `renderElement({ svg, storage: "tmp" })` returns a PNG `/api/attachments/<attachmentId>` URL → composite it onto the MP4 with `ffmpeg`.

## Prerequisites

- Fetch brand tokens first with `fetchBusinessProfile`: primary/accent colors, dark background, logo name split, phone, destination URL.
- The target video or assembled draft is available as an attachment id (`sha256:<hex>`) or `/api/attachments/<attachmentId>` URL.

## Clarifications

- Confirm the phone number, CTA URL, and two-tone brand name split when the profile does not make them clear.

## Guardrails

- **Never change coordinates:** No edits to `x`, `y`, `width`, `height`, `rx`, or `font-size`.
- **Self-contained SVG:** No external image URLs; all vector elements and text are inline.
- **Retention:** intermediate PNGs use `storage: "tmp"`; the final composite video uses `"artifact"`. Storage is a retention hint, not a directory.

---

## Execution Workflow

1. **Ingest brand tokens** with `fetchBusinessProfile`.
2. **Rasterize** the chosen preset SVG with `renderElement({ svg: "<svg>...</svg>", storage: "tmp" })` to a 1080×1920 PNG.
3. **Composite** with `ffmpeg`: overlay Preset 1 for `enable='between(t,0,1.2)'`, or concatenate Preset 2 as the outro.

---

## Preset 1: Front hook card (transparent, 1080×1920)

- **Brand pill:** `x=330`, `y=310`, `w=420`, `h=100`, `rx=30`, fill `{CARD_BG_COLOR}`. Text at `x=540`, `y=380`, size 56, weight 900, two-tone brand name.
- **Hook line 1:** rect `x=210`, `y=940`, `w=660`, `h=115`, `rx=22`, fill `{CARD_BG_COLOR}`; text at `y=1022`, size 68, weight 900, white, `{HOOK_LINE_1}`.
- **Hook line 2:** rect `x=150`, `y=1065`, `w=780`, `h=125`, `rx=24`, fill `{CARD_BG_COLOR}`; text at `y=1152`, size 74, weight 900, `{BRAND_COLOR_ACCENT}`, `{HOOK_LINE_2}`.

```json
{
  "svg": "<svg width=\"1080\" height=\"1920\" viewBox=\"0 0 1080 1920\" xmlns=\"http://www.w3.org/2000/svg\">\n  <rect x=\"330\" y=\"310\" width=\"420\" height=\"100\" rx=\"30\" fill=\"{CARD_BG_COLOR}\"/>\n  <text x=\"540\" y=\"380\" font-family=\"Arial, sans-serif\" font-size=\"56\" font-weight=\"900\" text-anchor=\"middle\">\n    <tspan fill=\"{BRAND_COLOR_PRIMARY}\">{BRAND_NAME_PART_1}</tspan><tspan fill=\"{BRAND_COLOR_ACCENT}\">{BRAND_NAME_PART_2}</tspan>\n  </text>\n  <rect x=\"210\" y=\"940\" width=\"660\" height=\"115\" rx=\"22\" fill=\"{CARD_BG_COLOR}\"/>\n  <text x=\"540\" y=\"1022\" font-family=\"Arial, sans-serif\" font-size=\"68\" font-weight=\"900\" fill=\"#FFFFFF\" text-anchor=\"middle\">{HOOK_LINE_1}</text>\n  <rect x=\"150\" y=\"1065\" width=\"780\" height=\"125\" rx=\"24\" fill=\"{CARD_BG_COLOR}\"/>\n  <text x=\"540\" y=\"1152\" font-family=\"Arial, sans-serif\" font-size=\"74\" font-weight=\"900\" fill=\"{BRAND_COLOR_ACCENT}\" text-anchor=\"middle\">{HOOK_LINE_2}</text>\n</svg>",
  "storage": "tmp"
}
```

```bash
-i /api/attachments/<assembledVideoAttachmentId> -i /api/attachments/<frontCardPngAttachmentId> -filter_complex "[0:v][1:v]overlay=enable='between(t,0,1.2)'[v]" -map "[v]" -map 0:a? -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p
```

## Preset 2: End card outro (opaque, 1080×1920)

- **Background:** full-frame rect, fill `{BG_COLOR}` (`#072042`).
- **Brand title:** centered at `x=540`, `y=820`, size 88, weight 900, two-tone.
- **Headline:** centered at `y=920`, size 48, weight 700, white.
- **CTA pill:** `x=310`, `y=990`, `w=460`, `h=110`, `rx=55`, fill `{CTA_BUTTON_BG}`; text at `y=1062`, size 42, weight 800, `{CTA_URL}`.
- **Phone:** centered at `y=1190`, size 44, weight 800, white, `{PHONE_NUMBER}`.
- **Divider:** line at `y=1260`, `x1=410` to `x2=670`, `stroke-width=6`, `{DIVIDER_LINE_COLOR}`.

---

## Deliverables

Rendered PNGs come back as `/api/attachments/<attachmentId>` URLs; pass that URL (or the matching `sha256:<hex>` id) directly to the `ffmpeg` tool.
