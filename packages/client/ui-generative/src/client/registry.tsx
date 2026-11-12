"use client";

import React, { useContext, useState, useEffect, useRef } from "react";
import { defineRegistry, useBoundProp, useActions } from "@json-render/react";
import {
  catalog,
  toCamelCase,
  getFieldValue,
} from "@openai-harness/generative-ui";
import { useNormalizedFieldId } from "./field-id";
import { GenerativeUIContext } from "./renderer";
import {
  ASPECT_CONFIG,
  AudioPlayer,
  GenerativeUIImage,
  VideoPlayer,
  normalizeAspectRatio,
  type StandardAspectRatio,
} from "@openai-harness/client-ui-attachment-viewers/client";
import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  LineChart as RechartsLineChart,
  Line,
  AreaChart as RechartsAreaChart,
  Area,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  RadarChart as RechartsRadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Check,
  Search,
  ExternalLink,
  Loader2,
  X,
  Send,
} from "lucide-react";

export const GenerativeUIContainerContext = React.createContext<{
  isInGrid?: boolean;
  isInCard?: boolean;
  isInCarousel?: boolean;
  isVertical?: boolean;
  aspectRatio?: StandardAspectRatio;
}>({});

/**
 * Categorical chart palette. Order matches the Uno grammar: orange emphasis,
 * ink, success, warning, then muted. Chart data may name a color (legacy blocks
 * persisted "brand"/"amber"/"multi"); resolve those known names to tokens and
 * never inject an arbitrary user string as a CSS color.
 */
const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

const CHART_COLOR_NAMES: Record<string, string> = {
  accent: "var(--chart-1)",
  orange: "var(--chart-1)",
  "chart-1": "var(--chart-1)",
  brand: "var(--chart-2)",
  ink: "var(--chart-2)",
  primary: "var(--chart-2)",
  foreground: "var(--chart-2)",
  "chart-2": "var(--chart-2)",
  success: "var(--chart-3)",
  green: "var(--chart-3)",
  "chart-3": "var(--chart-3)",
  warning: "var(--chart-4)",
  amber: "var(--chart-4)",
  "chart-4": "var(--chart-4)",
  muted: "var(--chart-5)",
  gray: "var(--chart-5)",
  info: "var(--chart-5)",
  "chart-5": "var(--chart-5)",
  destructive: "var(--destructive)",
  danger: "var(--destructive)",
};

function resolveChartColor(value: unknown, index: number): string {
  if (typeof value === "string") {
    const token = CHART_COLOR_NAMES[value.trim().toLowerCase()];
    if (token) return token;
  }
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

 
function CustomChartTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-none border border-border bg-card/95 p-2.5 text-xs min-w-[120px]">
        {label && (
          <p className="font-semibold text-foreground mb-1 border-b border-border pb-1">
            {label}
          </p>
        )}
        {payload.map((entry: any, index: number) => (
          <div
            key={`tooltip-${index}-${entry.dataKey || entry.name || "item"}`}
            className="flex items-center justify-between gap-3 text-muted-foreground py-0.5"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-none shrink-0"
                style={{ backgroundColor: entry.color || entry.fill }}
              />
              <span className="font-medium text-foreground">
                {entry.name || entry.dataKey}:
              </span>
            </div>
            <span className="font-bold text-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export const { registry } = defineRegistry(catalog, {
  components: {
     
    Card: ({ props, children }: { props: any; children?: React.ReactNode }) => {
      const {
        isSubmitted = false,
        specValues,
        setFieldValue,
      } = useContext(GenerativeUIContext);
      const containerContext = useContext(GenerativeUIContainerContext);

      // `interactive` is the alias models reach for; treat both alike.
      const isSelectable = Boolean(props.selectable ?? props.interactive);
      const cardValue = props.value || props.title || "card";
      const group = toCamelCase(props.name) || "cardSelection";
      const cardDomId = useNormalizedFieldId(
        props.title || props.value,
        "card",
      );

      const resolvedSelection = getFieldValue(
        specValues,
        group,
        props.name,
      );
      const isSelected = isSelectable
        ? resolvedSelection !== undefined &&
          String(resolvedSelection) === String(cardValue)
        : false;

      const handleCardClick = () => {
        if (!isSelectable || isSubmitted) return;
        setFieldValue?.(group, cardValue);
      };

      const hasChildren = Boolean(
        children &&
        (Array.isArray(children)
          ? children.some(Boolean)
          : children !== null && children !== undefined),
      );

      const isDark = props.variant === "dark";

      const effectiveBadge =
        props.badge || (isSelectable && isSelected ? "SELECTED" : undefined);

      const badgeClass =
        isSelectable && isSelected
          ? isDark
            ? "bg-card/20 text-primary-foreground border-primary-foreground/30"
            : "bg-brand/10 text-brand border-brand/20"
          : isDark
            ? "bg-card/15 text-primary-foreground border-primary-foreground/20"
            : "bg-secondary text-foreground border-border";

      const cursorClass =
        isSelectable && !isSubmitted
          ? "cursor-pointer hover:border-brand/40 select-none"
          : isSelectable && isSubmitted
            ? "cursor-default select-none"
            : "";

      const aspect = normalizeAspectRatio(
        props.aspectRatio || containerContext?.aspectRatio,
      );

      const isVertical =
        aspect === "9/16" || Boolean(containerContext?.isVertical);

      const isInsideCarousel = Boolean(containerContext?.isInCarousel);

      const isStandaloneMediaCard =
        !containerContext?.isInGrid && !isInsideCarousel && Boolean(aspect);

      const maxWidthClass =
        aspect && isStandaloneMediaCard
          ? `${ASPECT_CONFIG[aspect].cardWidthClass} self-start`
          : "w-full max-w-full";

      const hasAsset = Boolean(aspect) || hasChildren || isInsideCarousel;
      const descClampClass = hasAsset ? "line-clamp-1" : "line-clamp-2";

      const surfaceClass = isDark
        ? "bg-brand text-primary-foreground border-brand-border/40"
        : "bg-card text-foreground border-border";

      const selectionBorder =
        isSelectable && isSelected
          ? isDark
            ? "!border-2 !border-primary-foreground ring-2 ring-primary-foreground/30"
            : "!border-2 !border-brand ring-2 ring-brand/20"
          : "";

      return (
        <div
          id={cardDomId}
          onClick={handleCardClick}
          data-name={group}
          data-value={cardValue}
          className={`${maxWidthClass} ${cursorClass} h-full flex flex-col justify-between rounded-none border ${surfaceClass} ${selectionBorder} p-3 sm:p-3.5 transition-all ${props.className || ""}`.trim()}
        >
          <div className="flex flex-col flex-1">
            {(props.eyebrow ||
              props.title ||
              props.description ||
              effectiveBadge) && (
              <div
                className={`flex items-start justify-between gap-2 ${
                  hasChildren ? "mb-2.5 pb-2 border-b border-current/10" : ""
                }`}
              >
                <div className="flex flex-col gap-1.5 min-w-0">
                  {props.eyebrow && (
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                      {props.eyebrow}
                    </span>
                  )}
                  {props.title && (
                    <h3 className="font-display font-semibold text-sm sm:text-[15px] tracking-tight leading-snug line-clamp-1">
                      {props.title}
                    </h3>
                  )}
                  {props.description && (
                    <p className={`text-xs opacity-75 leading-relaxed ${descClampClass}`}>
                      {props.description}
                    </p>
                  )}
                </div>
                {effectiveBadge && (
                  <span
                    className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-none text-[10.5px] font-medium leading-tight border ${badgeClass}`}
                  >
                    {effectiveBadge}
                  </span>
                )}
              </div>
            )}
            {hasChildren && (
              <GenerativeUIContainerContext.Provider
                value={{
                  isInCard: true,
                  isVertical,
                  aspectRatio: aspect || containerContext?.aspectRatio,
                  isInCarousel: containerContext?.isInCarousel,
                }}
              >
                <div className="flex flex-col gap-2.5 flex-1">{children}</div>
              </GenerativeUIContainerContext.Provider>
            )}
          </div>
        </div>
      );
    },
     
    Stack: ({
      props,
      children,
    }: {
       
      props: any;
      children?: React.ReactNode;
    }) => {
      const isRow =
        props.direction === "row" || props.direction === "horizontal";
      const gapClass = isRow ? "gap-2.5" : "gap-3";

      const normClassName = (props.className || "")
        .replace(
          /\b([pP][xytblr]?-\d+(\.\d+)?|sm:[pP][xytblr]?-\d+(\.\d+)?|[mM][xytblr]?-\d+(\.\d+)?|space-[xy]-\d+(\.\d+)?|gap-\d+(\.\d+)?)\b/g,
          "",
        )
        .trim();

      return (
        <div
          className={`flex ${
            isRow ? "flex-row flex-wrap items-center" : "flex-col"
          } ${gapClass} w-full ${normClassName}`}
        >
          {children}
        </div>
      );
    },
     
    Grid: ({ props, children }: { props: any; children?: React.ReactNode }) => {
      if (props.layout === "flex") {
        return (
          <GenerativeUIContainerContext.Provider value={{ isInGrid: true }}>
            <div
              className={`flex flex-wrap gap-3 w-full my-1 items-stretch [&>*]:flex-1 [&>*]:min-w-[160px] ${
                props.className || ""
              }`}
            >
              {children}
            </div>
          </GenerativeUIContainerContext.Provider>
        );
      }

      const hasCards = React.Children.toArray(children).some((child: any) => {
        if (!child) return false;
        const el = child?.props?.element;
        if (el?.type === "Card") return true;
        const p = child?.props?.props || child?.props || {};
        return Boolean(p.title || p.description || p.badge);
      });

      const rawCols = Number(props.columns) || 2;
      const cols = hasCards
        ? Math.max(1, Math.min(2, rawCols))
        : Math.max(1, Math.min(4, rawCols));

      const colsMap: Record<number, string> = {
        1: "grid-cols-1",
        2: "grid-cols-1 sm:grid-cols-2",
        3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
        4: "grid-cols-2 sm:grid-cols-4",
      };
      const gridClass = colsMap[cols] || "grid-cols-1 sm:grid-cols-2";
      const stretchClass =
        (props.stretchLast ?? cols === 2)
          ? "[&>*:last-child:nth-child(odd)]:col-span-full"
          : "";

      return (
        <GenerativeUIContainerContext.Provider value={{ isInGrid: true }}>
          <div
            className={`grid ${gridClass} ${stretchClass} gap-3 [&:has([data-system-image])]:w-fit w-full max-w-full my-1 items-stretch ${
              props.className || ""
            }`}
          >
            {children}
          </div>
        </GenerativeUIContainerContext.Provider>
      );
    },
     
    Separator: ({ props }: { props: any }) => {
      const isVertical = props.orientation === "vertical";
      return (
        <div
          className={
            isVertical
              ? "h-full w-px bg-muted mx-2 self-stretch"
              : "w-full h-px bg-muted my-2"
          }
        />
      );
    },
     
    Tabs: ({ props, children, bindings, emit }: any) => {
      const rawTabs = Array.isArray(props.tabs) ? props.tabs : [];
      const tabs: Array<{
        value: string;
        label: string;
        key: string;
      }> = rawTabs.map((tab: unknown, idx: number) => {
        if (typeof tab === "string" || typeof tab === "number") {
          const s = String(tab);
          return { value: s, label: s, key: `tab-${idx}-${s}` };
        }
        if (typeof tab === "object" && tab !== null) {
          const t = tab as { value?: unknown; label?: unknown };
          const val = String(t.value ?? t.label ?? "");
          const lbl = String(t.label ?? t.value ?? "");
          return { value: val, label: lbl, key: `tab-${idx}-${val}` };
        }
        const s = String(tab ?? "");
        return { value: s, label: s, key: `tab-${idx}-${s}` };
      });
      const [boundValue, setBoundValue] = useBoundProp(
        props.value,
        bindings?.value,
      );
      const [localValue, setLocalValue] = useState(
        props.defaultValue ?? tabs[0]?.value ?? "",
      );
      const isBound = !!bindings?.value;
      const value = isBound ? (boundValue ?? tabs[0]?.value ?? "") : localValue;
      const setValue = isBound ? setBoundValue : setLocalValue;

      return (
        <div className="w-full flex flex-col gap-2.5 my-1">
          <div className="flex items-center gap-1 p-1 bg-secondary rounded-none overflow-x-auto">
            {tabs.map((tab) => {
              const isActive = value === tab.value;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setValue(tab.value);
                    emit?.("change");
                  }}
                  className={`px-3 py-1.5 rounded-none text-xs font-medium transition-all ${
                    isActive
                      ? "bg-card text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="pt-1">{children}</div>
        </div>
      );
    },
     
    Accordion: ({ props }: any) => {
      const rawItems = Array.isArray(props.items) ? props.items : [];
      const normalizedItems: Array<{
        title: string;
        content: string;
        key: string;
      }> = rawItems.map((item: unknown, i: number) => {
        if (typeof item === "string" || typeof item === "number") {
          const s = String(item);
          return { title: s, content: "", key: `accordion-${i}-${s}` };
        }
        if (typeof item === "object" && item !== null) {
          const o = item as {
            title?: unknown;
            content?: unknown;
            text?: unknown;
            label?: unknown;
            header?: unknown;
            body?: unknown;
          };
          const title = String(
            o.title ?? o.label ?? o.header ?? `Section ${i + 1}`,
          );
          const content = String(o.content ?? o.text ?? o.body ?? "");
          return { title, content, key: `accordion-${i}-${title}` };
        }
        const s = String(item ?? "");
        return { title: s, content: "", key: `accordion-${i}-${s}` };
      });
      const isMultiple = props.type === "multiple";
      const [openIndex, setOpenIndex] = useState<number | null>(0);
      const [openSet, setOpenSet] = useState<Set<number>>(new Set([0]));

      return (
        <div className="w-full divide-y divide-border rounded-none border border-border bg-card overflow-hidden my-1">
          {normalizedItems.map((item, i: number) => {
            const isOpen = isMultiple ? openSet.has(i) : openIndex === i;
            return (
              <div key={item.key} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => {
                    if (isMultiple) {
                      const next = new Set(openSet);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      setOpenSet(next);
                    } else {
                      setOpenIndex(isOpen ? null : i);
                    }
                  }}
                  className="flex items-center justify-between px-4 py-3 text-left text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  <span>{item.title}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-foreground" : ""
                    }`}
                  />
                </button>
                {isOpen && item.content && (
                  <div className="px-4 pb-3.5 pt-1 text-xs text-muted-foreground leading-relaxed border-t border-border bg-muted">
                    {item.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    },
    Carousel: ({
      props,
      children,
    }: {
      props: {
        items?: (string | Record<string, unknown>)[];
        aspectRatio?: string;
        fit?: "cover" | "contain" | "fill";
      };
      children?: React.ReactNode;
    }) => {
      const scrollRef = useRef<HTMLDivElement>(null);
      const [canScrollLeft, setCanScrollLeft] = useState(false);
      const [canScrollRight, setCanScrollRight] = useState(false);

      const items = Array.isArray(props.items) ? props.items : [];
      const hasChildren = Boolean(
        children &&
        (Array.isArray(children)
          ? children.some(Boolean)
          : children !== null && children !== undefined),
      );

      const checkScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 10);
        setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
      };

      useEffect(() => {
        checkScroll();
        const el = scrollRef.current;
        if (!el) return;
        el.addEventListener("scroll", checkScroll, { passive: true });
        window.addEventListener("resize", checkScroll);
        const t1 = setTimeout(checkScroll, 100);
        const t2 = setTimeout(checkScroll, 500);
        return () => {
          el.removeEventListener("scroll", checkScroll);
          window.removeEventListener("resize", checkScroll);
          clearTimeout(t1);
          clearTimeout(t2);
        };
      }, [items.length, hasChildren]);

      const scroll = (direction: "left" | "right") => {
        const el = scrollRef.current;
        if (!el) return;
        const scrollAmount = el.clientWidth * 0.75;
        el.scrollBy({
          left: direction === "left" ? -scrollAmount : scrollAmount,
          behavior: "smooth",
        });
      };

      return (
        <div className={`relative w-full group/carousel my-0.5 `}>
          {/* Left Arrow Button */}
          {canScrollLeft && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                scroll("left");
              }}
              aria-label="Scroll carousel left"
              className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 z-30 w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center rounded-none bg-card hover:bg-muted text-foreground border border-border transition-all opacity-95 hover:opacity-100 hover:scale-105 active:scale-95 cursor-pointer"
            >
              <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
            </button>
          )}

          {/* Right Arrow Button */}
          {canScrollRight && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                scroll("right");
              }}
              aria-label="Scroll carousel right"
              className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-30 w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center rounded-none bg-card hover:bg-muted text-foreground border border-border transition-all opacity-95 hover:opacity-100 hover:scale-105 active:scale-95 cursor-pointer"
            >
              <ChevronRight className="w-6 h-6 stroke-[2.5]" />
            </button>
          )}

          {/* Carousel Track */}
          <div
            ref={scrollRef}
            className="w-full flex items-stretch gap-3 overflow-x-auto pt-0.5 pb-1.5 px-0.5 snap-x snap-mandatory no-scrollbar scroll-smooth"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {hasChildren ? (
              <GenerativeUIContainerContext.Provider
                value={{
                  isInCarousel: true,
                  aspectRatio: normalizeAspectRatio(props.aspectRatio),
                }}
              >
                {React.Children.map(children, (child, idx) => {
                  if (!child) return null;
                   
                  const childProps = (child as any)?.props || {};
                   
                  const childEl = (child as any)?.props?.element;
                   
                  const childSpec = (child as any)?.props?.spec;
                  const hasVideoChild = Boolean(
                    childEl?.type === "Video" ||
                    (childSpec?.elements &&
                      Array.isArray(childEl?.children) &&
                      childEl.children.some(
                        (k: string) => childSpec.elements[k]?.type === "Video",
                      )),
                  );
                  const childAspect =
                    normalizeAspectRatio(
                      childProps.aspectRatio ||
                        childEl?.props?.aspectRatio ||
                        childProps.props?.aspectRatio ||
                        props.aspectRatio,
                    ) || (hasVideoChild ? "9/16" : "1/1");
                  const itemWidthClass =
                    ASPECT_CONFIG[childAspect].carouselWidthClass;
                  return (
                    <div
                      key={idx}
                      className={`shrink-0 snap-start flex flex-col ${itemWidthClass}`}
                    >
                      {child}
                    </div>
                  );
                })}
              </GenerativeUIContainerContext.Provider>
            ) : (
              items.map((rawItem, i) => {
                const item: Record<string, unknown> =
                  typeof rawItem === "string"
                    ? { src: rawItem, title: "" }
                    : rawItem || {};
                const mediaSrc =
                  (item.src as string) ||
                  (item.image as string) ||
                  (item.video as string) ||
                  "";
                const isVideo = Boolean(
                  mediaSrc &&
                  /\.(mp4|webm|mov|m4v|avi|mkv)(\?|$)/i.test(mediaSrc),
                );
                const itemAspect = normalizeAspectRatio(
                  (item.aspectRatio as string) || props.aspectRatio,
                );
                const effectiveAspect =
                  itemAspect ||
                  (isVideo ? "9/16" : mediaSrc ? "1/1" : undefined);
                const cardWidthClass = effectiveAspect
                  ? ASPECT_CONFIG[effectiveAspect].carouselWidthClass
                  : "w-64";

                const descClampClass = "line-clamp-1";

                const itemTitle = (item.title as string) || "";
                const itemDesc = (item.description as string) || "";
                const itemHref =
                  (item.sourceLink as string) || (item.href as string);
                const itemClass = (item.className as string) || "";
                const itemFit =
                  (item.fit as "cover" | "contain" | "fill") ||
                  props.fit ||
                  "contain";
                const itemAlt = (item.alt as string) || "Carousel image";

                return (
                  <div
                    key={`carousel-item-${i}-${mediaSrc || itemTitle || i}`}
                    className={`shrink-0 ${cardWidthClass} rounded-none border border-border bg-card p-3 snap-start flex flex-col gap-2 transition-all ${itemClass}`.trim()}
                  >
                    {/* Media: Video or Image detected on the fly from src */}
                    {mediaSrc &&
                      (isVideo ? (
                        <div className="w-full rounded-none overflow-hidden">
                          <VideoPlayer
                            src={mediaSrc}
                            title={itemTitle || "Video"}
                            aspectRatio={itemAspect}
                          />
                        </div>
                      ) : (
                        <GenerativeUIImage
                          src={mediaSrc}
                          alt={itemTitle || itemAlt}
                          aspectRatio={itemAspect}
                          fit={itemFit}
                          className="!my-0 w-full"
                        />
                      ))}

                    {/* Content */}
                    <div className="flex flex-col gap-1.5 flex-1 pt-1.5 sm:pt-2">
                      {itemTitle &&
                        (itemHref ? (
                          <a
                            href={itemHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group/title inline-flex items-center gap-1.5 font-semibold text-sm sm:text-[15px] text-foreground hover:text-brand transition-colors leading-snug w-fit line-clamp-1"
                          >
                            <span className="line-clamp-1">{itemTitle}</span>
                            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover/title:text-brand transition-all shrink-0" />
                          </a>
                        ) : (
                          <h4 className="font-display font-semibold text-sm sm:text-[15px] text-foreground leading-snug line-clamp-1">
                            {itemTitle}
                          </h4>
                        ))}
                      {itemDesc && (
                        <p
                          className={`text-xs sm:text-[13px] text-muted-foreground leading-relaxed ${descClampClass}`}
                        >
                          {itemDesc}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    },
     
    Table: ({ props }: { props: any }) => {
      const rawCols = Array.isArray(props.columns) ? props.columns : [];
      const columns = rawCols.map(String);
      const rawRows = Array.isArray(props.rows) ? props.rows : [];
      const rows = rawRows.map((row: unknown) => {
        if (Array.isArray(row)) {
          return row.map((cell) => String(cell ?? ""));
        }
        if (typeof row === "object" && row !== null) {
          const r = row as Record<string, unknown>;
          return columns.length > 0
            ? columns.map((col: string) =>
                String(r[col] ?? r[col.toLowerCase()] ?? ""),
              )
            : Object.values(r).map((cell) => String(cell ?? ""));
        }
        return [String(row ?? "")];
      });

      const isDark = props.variant === "dark";

      return (
        <div
          className={`w-full overflow-x-auto rounded-none border ${
            isDark
              ? "border-brand-border/40 bg-brand-surface text-primary-foreground"
              : "border-border bg-card text-foreground"
          }`}
        >
          <table className="w-full text-left text-xs border-collapse">
            <thead
              className={`border-b font-mono font-semibold text-[10.5px] uppercase tracking-[0.14em] ${
                isDark
                  ? "bg-brand/40 border-brand-border/40 text-brand-muted"
                  : "bg-brand/5 border-brand/15 text-brand"
              }`}
            >
              <tr>
                {columns.map((col: string, i: number) => (
                  <th key={`col-${i}-${col}`} className="px-2.5 py-2 font-bold">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody
              className={`divide-y ${
                isDark
                  ? "divide-primary-foreground/10 text-primary-foreground/90"
                  : "divide-border text-foreground"
              }`}
            >
              {rows.map((row: string[], rowIdx: number) => (
                <tr
                  key={`tr-${rowIdx}`}
                  className={
                    isDark
                      ? "hover:bg-card/5 transition-colors"
                      : "hover:bg-brand/2 transition-colors"
                  }
                >
                  {row.map((cell: string, cellIdx: number) => (
                    <td
                      key={`td-${rowIdx}-${cellIdx}`}
                      className="px-2.5 py-2 align-top leading-relaxed break-words whitespace-normal max-w-[280px]"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    },
     
    Heading: ({ props }: { props: any }) => {
      const level = props.level ?? 2;
      const headingClasses: Record<number, string> = {
        1: "font-display text-lg sm:text-xl font-bold tracking-tight",
        2: "font-display text-base sm:text-lg font-semibold tracking-tight",
        3: "font-display text-sm sm:text-base font-semibold",
        4: "font-display text-xs sm:text-sm font-medium",
      };
      const baseClass = `${headingClasses[level] || headingClasses[2]} m-0`;
      const mergedClass = `${baseClass} ${props.className || ""}`.trim();

      switch (level) {
        case 1:
          return <h1 className={mergedClass}>{props.text}</h1>;
        case 2:
          return <h2 className={mergedClass}>{props.text}</h2>;
        case 3:
          return <h3 className={mergedClass}>{props.text}</h3>;
        case 4:
          return <h4 className={mergedClass}>{props.text}</h4>;
        default:
          return <h2 className={mergedClass}>{props.text}</h2>;
      }
    },
     
    Text: ({ props }: { props: any }) => {
      const containerContext = useContext(GenerativeUIContainerContext);
      const clampClass = containerContext?.isVertical
        ? "line-clamp-1"
        : containerContext?.isInCarousel
          ? "line-clamp-2"
          : "";

      const mergedClass =
        `text-sm font-medium leading-relaxed m-0 ${clampClass} ${props.className || ""}`.trim();

      return <p className={mergedClass}>{props.text}</p>;
    },
     
    Image: ({ props }: any) => {
      const containerContext = useContext(GenerativeUIContainerContext);
      return (
        <GenerativeUIImage
          src={props.src || "/images/placeholder.png"}
          alt={props.alt || "Image"}
          aspectRatio={props.aspectRatio}
          fit={props.fit}
          className={`${containerContext?.isInCard ? "w-full max-w-full" : ""} ${props.className || ""}`.trim()}
        />
      );
    },
     
    Video: ({ props }: any) => {
      const containerContext = useContext(GenerativeUIContainerContext);
      return (
        <div className="w-full my-1.5">
          <VideoPlayer
            src={props.src || ""}
            title={props.title || "Video"}
            aspectRatio={props.aspectRatio || containerContext?.aspectRatio}
            className={props.className}
          />
        </div>
      );
    },
     
    Audio: ({ props }: any) => {
      return (
        <div className="w-full">
          <AudioPlayer
            src={props.src || ""}
            title={props.title || "Audio"}
            className={props.className}
          />
        </div>
      );
    },
     
    Avatar: ({ props }: any) => {
      const size =
        props.size === "sm"
          ? "w-6 h-6 text-[10px]"
          : props.size === "lg"
            ? "w-10 h-10 text-sm"
            : "w-8 h-8 text-xs";
      const initials = (props.name || "AI")
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      return (
        <div
          className={`inline-flex items-center justify-center rounded-none bg-brand/10 border border-brand/20 text-brand font-semibold overflow-hidden shrink-0 ${size}`}
        >
          {props.src ? (
            <img
              src={props.src}
              alt={props.name || "Avatar"}
              className="w-full h-full object-cover"
            />
          ) : (
            <span>{initials}</span>
          )}
        </div>
      );
    },
     
    Badge: ({ props }: { props: any }) => {
      const isDark = props.variant === "dark" || props.variant === "brand";
      const isDestructive = props.variant === "destructive";
      const isSuccess = props.variant === "success";

      const badgeStyle = isDark
        ? "bg-brand text-primary-foreground border-brand-border/40"
        : isDestructive
          ? "bg-destructive-tint text-destructive border-destructive/25"
          : isSuccess
            ? "bg-success-tint text-success border-success/25"
            : "bg-secondary text-foreground border-border";

      return (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-none text-[10.5px] font-medium leading-tight border ${badgeStyle} ${props.className || ""}`.trim()}
        >
          {props.text}
        </span>
      );
    },
     
    Alert: ({ props }: any) => {
      const isDestructive =
        props.type === "destructive" || props.type === "error";
      const isWarning = props.type === "warning";
      const isSuccess = props.type === "success";

      const style = isDestructive
        ? "bg-destructive-tint border-destructive/25 text-destructive"
        : isWarning
          ? "bg-brand-accent/10 border-brand-accent/30 text-brand-accent-dark"
          : isSuccess
            ? "bg-brand-tint-hover border-brand/20 text-brand-dark"
            : "bg-brand/5 border-brand/20 text-brand";

      const Icon = isDestructive
        ? AlertCircle
        : isWarning
          ? AlertTriangle
          : isSuccess
            ? CheckCircle2
            : Info;

      return (
        <div
          className={`w-full rounded-none border p-2 sm:p-2.5 flex items-start gap-2.5 text-xs my-0.5 ${style} ${props.className || ""}`.trim()}
        >
          <Icon className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5 min-w-0">
            {props.title && (
              <span className="font-semibold text-xs">{props.title}</span>
            )}
            {props.message && (
              <span className="text-xs leading-relaxed opacity-90">
                {props.message}
              </span>
            )}
          </div>
        </div>
      );
    },
     
    Tooltip: ({ props, children }: any) => {
      const [visible, setVisible] = useState(false);
      return (
        <div
          className="relative inline-flex"
          onMouseEnter={() => setVisible(true)}
          onMouseLeave={() => setVisible(false)}
        >
          {children ?? (
            <span className="underline decoration-dotted cursor-help text-xs text-foreground">
              {props.text}
            </span>
          )}
          {visible && props.content && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 bg-foreground text-primary-foreground text-[11px] rounded-none whitespace-nowrap z-50">
              {props.content}
            </div>
          )}
        </div>
      );
    },
     
    Input: ({ props, bindings, emit }: any) => {
      const {
        isSubmitted = false,
        specValues,
        setFieldValue,
      } = useContext(GenerativeUIContext);
      const fieldName = useNormalizedFieldId(
        props.name || props.label,
        "input",
      );
      const [boundValue, setBoundValue] = useBoundProp(
        props.value,
        bindings?.value,
      );
      const [localValue, setLocalValue] = useState(props.value ?? "");
      const isBound = !!bindings?.value;

      const resolvedValue = getFieldValue(
        specValues,
        fieldName,
        props.name || props.label,
      );

      const value =
        resolvedValue !== undefined
          ? String(resolvedValue)
          : isBound
            ? (boundValue ?? "")
            : localValue;
      const setValue = isBound ? setBoundValue : setLocalValue;

      const isDisabled = Boolean(props.disabled || isSubmitted);

      return (
        <div className="w-full flex flex-col gap-1.5" data-name={fieldName}>
          {props.label && (
            <label
              htmlFor={fieldName}
              className="text-sm sm:text-[15px] font-semibold text-foreground"
            >
              {props.label}
            </label>
          )}
          <input
            id={fieldName}
            type={props.type || "text"}
            name={fieldName}
            placeholder={props.placeholder}
            value={value}
            disabled={isDisabled}
            readOnly={isSubmitted}
            onChange={(e) => {
              if (isSubmitted) return;
              setValue(e.target.value);
              setFieldValue?.(fieldName, e.target.value);
              emit?.("change");
            }}
            className={`w-full px-3.5 py-2.5 text-sm rounded-none border transition-all ${
              isDisabled
                ? "bg-muted text-foreground border-border cursor-not-allowed select-none focus:outline-none"
                : "bg-card text-foreground border-border placeholder:text-muted-foreground focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            }`}
          />
        </div>
      );
    },
     
    Textarea: ({ props, bindings, emit }: any) => {
      const {
        isSubmitted = false,
        specValues,
        setFieldValue,
      } = useContext(GenerativeUIContext);
      const fieldName = useNormalizedFieldId(
        props.name || props.label,
        "textarea",
      );
      const [boundValue, setBoundValue] = useBoundProp(
        props.value,
        bindings?.value,
      );
      const [localValue, setLocalValue] = useState(props.value ?? "");
      const isBound = !!bindings?.value;

      const resolvedValue = getFieldValue(
        specValues,
        fieldName,
        props.name || props.label,
      );

      const value =
        resolvedValue !== undefined
          ? String(resolvedValue)
          : isBound
            ? (boundValue ?? "")
            : localValue;
      const setValue = isBound ? setBoundValue : setLocalValue;

      const isDisabled = Boolean(props.disabled || isSubmitted);

      return (
        <div className="w-full flex flex-col gap-1.5" data-name={fieldName}>
          {props.label && (
            <label
              htmlFor={fieldName}
              className="text-sm sm:text-[15px] font-semibold text-foreground"
            >
              {props.label}
            </label>
          )}
          <textarea
            id={fieldName}
            name={fieldName}
            rows={props.rows ?? 3}
            placeholder={props.placeholder}
            value={value}
            disabled={isDisabled}
            readOnly={isSubmitted}
            onChange={(e) => {
              if (isSubmitted) return;
              setValue(e.target.value);
              setFieldValue?.(fieldName, e.target.value);
              emit?.("change");
            }}
            className={`w-full px-3.5 py-2.5 text-sm rounded-none border transition-all resize-none ${
              isDisabled
                ? "bg-muted text-foreground border-border cursor-not-allowed select-none focus:outline-none"
                : "bg-card text-foreground border-border placeholder:text-muted-foreground focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            }`}
          />
        </div>
      );
    },
     
    Select: ({ props, bindings, emit }: any) => {
      const {
        isSubmitted = false,
        specValues,
        setFieldValue,
      } = useContext(GenerativeUIContext);
      const fieldName = useNormalizedFieldId(
        props.name || props.label,
        "select",
      );
      const [boundValue, setBoundValue] = useBoundProp(
        props.value,
        bindings?.value,
      );
      const [localValue, setLocalValue] = useState(props.value ?? "");
      const isBound = !!bindings?.value;

      const resolvedValue = getFieldValue(
        specValues,
        fieldName,
        props.name || props.label,
      );

      const value =
        resolvedValue !== undefined
          ? String(resolvedValue)
          : isBound
            ? (boundValue ?? "")
            : localValue;
      const setValue = isBound ? setBoundValue : setLocalValue;

      const isDisabled = Boolean(props.disabled || isSubmitted);

      const [isOpen, setIsOpen] = useState(false);
      const [openUpward, setOpenUpward] = useState(false);
      const dropdownRef = useRef<HTMLDivElement>(null);

      useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
          if (
            dropdownRef.current &&
            !dropdownRef.current.contains(e.target as Node)
          ) {
            setIsOpen(false);
          }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            setIsOpen(false);
          }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("touchstart", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
          document.removeEventListener("mousedown", handleClickOutside);
          document.removeEventListener("touchstart", handleClickOutside);
          document.removeEventListener("keydown", handleKeyDown);
        };
      }, [isOpen]);

      const placeholderText = props.placeholder || "Choose one";

      const rawList = Array.isArray(props.options) ? props.options : [];
      const normPlaceholder = (props.placeholder || "choose one")
        .trim()
        .toLowerCase();

      const normalizedOptions: Array<{
        value: string;
        label: string;
        key: string;
      }> = rawList
        .map((opt: unknown, idx: number) => {
          if (typeof opt === "string" || typeof opt === "number") {
            const s = String(opt);
            return { value: s, label: s, key: `select-opt-${idx}-${s}` };
          }
          if (typeof opt === "object" && opt !== null) {
            const o = opt as { value?: unknown; label?: unknown };
            const val = String(o.value ?? o.label ?? "");
            const lbl = String(o.label ?? o.value ?? "");
            return {
              value: val,
              label: lbl,
              key: `select-opt-${idx}-${val}`,
            };
          }
          const s = String(opt ?? "");
          return { value: s, label: s, key: `select-opt-${idx}-${s}` };
        })
        .filter((opt: { value: string; label: string; key: string }) => {
          const trimmedLabel = opt.label.trim().toLowerCase();
          const trimmedVal = opt.value.trim().toLowerCase();
          if (!trimmedLabel && !trimmedVal) return false;
          if (
            trimmedLabel === normPlaceholder ||
            trimmedVal === normPlaceholder
          )
            return false;
          if (trimmedVal === "" && trimmedLabel.includes("choose"))
            return false;
          return true;
        });

      const selectedOption = normalizedOptions.find(
        (opt) => String(opt.value) === String(value),
      );
      const isPlaceholderVal =
        !value ||
        String(value).trim() === "" ||
        String(value).trim().toLowerCase() ===
          (props.placeholder || "choose one").trim().toLowerCase();

      const displayLabel = selectedOption
        ? selectedOption.label
        : !isPlaceholderVal
          ? String(value)
          : placeholderText;
      const isPlaceholder = !selectedOption && isPlaceholderVal;

      const toggleOpen = () => {
        if (isDisabled) return;
        if (!isOpen && dropdownRef.current) {
          const rect = dropdownRef.current.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          if (spaceBelow < 220 && rect.top > 220) {
            setOpenUpward(true);
          } else {
            setOpenUpward(false);
          }
        }
        setIsOpen((prev) => !prev);
      };

      const handleSelect = (val: string) => {
        if (isDisabled) return;
        setValue(val);
        setFieldValue?.(fieldName, val);
        const cleanK = fieldName.replace(/_[a-z0-9]+$/i, "");
        if (cleanK && cleanK !== fieldName) {
          setFieldValue?.(cleanK, val);
        }
        emit?.("change");
        setIsOpen(false);
      };

      return (
        <div className="w-full flex flex-col gap-1.5" data-name={fieldName}>
          {props.label && (
            <label
              htmlFor={fieldName}
              className="text-sm sm:text-[15px] font-semibold text-foreground"
            >
              {props.label}
            </label>
          )}

          <div ref={dropdownRef} className="relative w-full">
            <button
              type="button"
              id={fieldName}
              disabled={isDisabled}
              onClick={toggleOpen}
              aria-haspopup="listbox"
              aria-expanded={isOpen}
              className={`w-full flex items-center justify-between pl-3.5 pr-3 py-2.5 text-sm rounded-none border text-left transition-all ${
                isDisabled
                  ? "bg-muted text-muted-foreground border-border cursor-not-allowed select-none"
                  : isOpen
                    ? "bg-card text-foreground border-brand ring-2 ring-brand/20 cursor-pointer"
                    : "bg-card text-foreground border-border hover:border-input focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand cursor-pointer"
              }`}
            >
              <span
                className={`truncate ${
                  isPlaceholder
                    ? "text-muted-foreground font-normal"
                    : "text-foreground font-medium"
                }`}
              >
                {displayLabel}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0 ml-2 ${
                  isOpen ? "rotate-180 text-brand" : ""
                }`}
              />
            </button>

            {/* Hidden input to maintain DOM form compatibility */}
            <input type="hidden" name={fieldName} value={value} />

            {/* Custom Theme Dropdown Menu */}
            {isOpen && !isDisabled && (
              <div
                role="listbox"
                className={`absolute left-0 right-0 z-50 bg-card rounded-none border border-border py-1.5 px-1 max-h-64 overflow-y-auto animate-in fade-in-50 zoom-in-95 duration-100 ${
                  openUpward
                    ? "bottom-[calc(100%+6px)]"
                    : "top-[calc(100%+6px)]"
                }`}
              >
                {normalizedOptions.map((opt) => {
                  const isSelected = String(opt.value) === String(value);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(opt.value)}
                      className={`w-full text-left px-3 py-2 text-sm rounded-none flex items-center justify-between transition-colors ${
                        isSelected
                          ? "bg-brand/10 text-brand font-semibold"
                          : "text-foreground hover:bg-brand/5 hover:text-brand font-normal"
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && (
                        <Check className="w-4 h-4 text-brand shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    },
     
    Checkbox: ({ props, bindings, emit }: any) => {
      const {
        isSubmitted = false,
        specValues,
        setFieldValue,
      } = useContext(GenerativeUIContext);
      const fieldName = useNormalizedFieldId(
        props.name || props.label,
        "checkbox",
      );
      const [boundChecked, setBoundChecked] = useBoundProp(
        props.checked,
        bindings?.checked,
      );
      const [localChecked, setLocalChecked] = useState(props.checked ?? false);
      const isBound = !!bindings?.checked;

      const resolvedValue = getFieldValue(
        specValues,
        fieldName,
        props.name || props.label,
      );

      const checked =
        resolvedValue !== undefined
          ? Boolean(resolvedValue)
          : isBound
            ? (boundChecked ?? false)
            : localChecked;
      const setChecked = isBound ? setBoundChecked : setLocalChecked;

      const isDisabled = Boolean(props.disabled || isSubmitted);

      return (
        <label
          htmlFor={fieldName}
          className={`inline-flex items-center gap-2 text-xs text-foreground my-1 select-none ${
            isDisabled ? "cursor-not-allowed" : "cursor-pointer"
          }`}
          data-name={fieldName}
        >
          <button
            id={fieldName}
            type="button"
            name={fieldName}
            disabled={isDisabled}
            onClick={() => {
              if (isDisabled) return;
              const next = !checked;
              setChecked(next);
              setFieldValue?.(fieldName, next);
              emit?.("change");
            }}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-none border transition-all ${
              isDisabled ? "cursor-not-allowed opacity-80" : "cursor-pointer"
            } ${
              checked
                ? "border-brand bg-brand text-primary-foreground"
                : "border-input bg-card"
            }`}
          >
            {checked && <Check className="h-2.5 w-2.5 stroke-[2.5]" />}
          </button>
          {props.label && <span>{props.label}</span>}
        </label>
      );
    },
     
    Radio: ({ props, bindings, emit }: any) => {
      const {
        isSubmitted = false,
        specValues,
        setFieldValue,
      } = useContext(GenerativeUIContext);
      const fieldName = useNormalizedFieldId(
        props.name || props.label,
        "radio",
      );
      const rawOptions = Array.isArray(props.options) ? props.options : [];
      const [boundValue, setBoundValue] = useBoundProp(
        props.value,
        bindings?.value,
      );
      const [localValue, setLocalValue] = useState(props.value ?? "");
      const isBound = !!bindings?.value;

      const resolvedValue = getFieldValue(
        specValues,
        fieldName,
        props.name || props.label,
      );

      const value =
        resolvedValue !== undefined
          ? String(resolvedValue)
          : isBound
            ? (boundValue ?? "")
            : localValue;
      const setValue = isBound ? setBoundValue : setLocalValue;

      const isDisabled = Boolean(props.disabled || isSubmitted);

      const normalizedOptions: Array<{
        value: string;
        label: string;
        key: string;
      }> = rawOptions.map((opt: unknown, idx: number) => {
        if (typeof opt === "string" || typeof opt === "number") {
          const s = String(opt);
          return { value: s, label: s, key: `radio-opt-${idx}-${s}` };
        }
        if (typeof opt === "object" && opt !== null) {
          const o = opt as { value?: unknown; label?: unknown };
          const val = String(o.value ?? o.label ?? "");
          const lbl = String(o.label ?? o.value ?? "");
          return { value: val, label: lbl, key: `radio-opt-${idx}-${val}` };
        }
        const s = String(opt ?? "");
        return { value: s, label: s, key: `radio-opt-${idx}-${s}` };
      });

      return (
        <div
          className="w-full flex flex-col gap-1.5 my-1"
          data-name={fieldName}
        >
          {props.label && (
            <span className="text-sm font-semibold text-foreground">
              {props.label}
            </span>
          )}
          <div className="flex flex-col gap-2">
            {normalizedOptions.map((opt) => {
              const isSelected = String(value) === String(opt.value);
              return (
                <label
                  key={opt.key}
                  onClick={() => {
                    if (isDisabled) return;
                    setValue(opt.value);
                    setFieldValue?.(fieldName, opt.value);
                    if (props.name && props.name !== fieldName) {
                      setFieldValue?.(props.name, opt.value);
                    }
                    const cleanK = fieldName.replace(/_[a-z0-9]+$/i, "");
                    if (cleanK && cleanK !== fieldName) {
                      setFieldValue?.(cleanK, opt.value);
                    }
                    emit?.("change");
                  }}
                  className={`inline-flex items-center gap-2.5 text-sm text-foreground select-none py-0.5 ${
                    isDisabled
                      ? "cursor-not-allowed opacity-80"
                      : "cursor-pointer"
                  }`}
                >
                  <div
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-none border transition-all ${
                      isSelected
                        ? "border-brand bg-brand"
                        : "border-input bg-card"
                    }`}
                  >
                    {isSelected && (
                      <div className="h-1.5 w-1.5 rounded-none bg-card" />
                    )}
                  </div>
                  <span className="font-normal leading-snug">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      );
    },
     
    Switch: ({ props, bindings, emit }: any) => {
      const {
        isSubmitted = false,
        specValues,
        setFieldValue,
      } = useContext(GenerativeUIContext);
      const fieldName = useNormalizedFieldId(
        props.name || props.label,
        "switch",
      );
      const [boundChecked, setBoundChecked] = useBoundProp(
        props.checked,
        bindings?.checked,
      );
      const [localChecked, setLocalChecked] = useState(props.checked ?? false);
      const isBound = !!bindings?.checked;

      const resolvedValue = getFieldValue(
        specValues,
        fieldName,
        props.name || props.label,
      );

      const checked =
        resolvedValue !== undefined
          ? Boolean(resolvedValue)
          : isBound
            ? (boundChecked ?? false)
            : localChecked;
      const setChecked = isBound ? setBoundChecked : setLocalChecked;

      const isDisabled = Boolean(props.disabled || isSubmitted);

      return (
        <label
          htmlFor={fieldName}
          className={`inline-flex items-center gap-2 text-xs text-foreground my-1 select-none ${
            isDisabled ? "cursor-not-allowed" : "cursor-pointer"
          }`}
          data-name={fieldName}
        >
          <button
            id={fieldName}
            type="button"
            name={fieldName}
            disabled={isDisabled}
            onClick={() => {
              if (isDisabled) return;
              const next = !checked;
              setChecked(next);
              setFieldValue?.(fieldName, next);
              emit?.("change");
            }}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-none border-2 border-transparent transition-colors duration-200 ease-in-out ${
              isDisabled ? "cursor-not-allowed opacity-80" : "cursor-pointer"
            } ${checked ? "bg-brand" : "bg-muted"}`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-none bg-card ring-0 transition duration-200 ease-in-out ${
                checked ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
          {props.label && <span>{props.label}</span>}
        </label>
      );
    },
     
    Slider: ({ props, bindings, emit }: any) => {
      const {
        isSubmitted = false,
        specValues,
        setFieldValue,
      } = useContext(GenerativeUIContext);
      const fieldName = useNormalizedFieldId(
        props.name || props.label,
        "slider",
      );
      const [boundValue, setBoundValue] = useBoundProp(
        props.value,
        bindings?.value,
      );
      const [localValue, setLocalValue] = useState(
        props.value ?? props.min ?? 0,
      );
      const isBound = !!bindings?.value;

      const resolvedValue = getFieldValue(
        specValues,
        fieldName,
        props.name || props.label,
      );

      const value =
        resolvedValue !== undefined
          ? Number(resolvedValue)
          : isBound
            ? (boundValue ?? props.min ?? 0)
            : localValue;
      const setValue = isBound ? setBoundValue : setLocalValue;

      const isDisabled = Boolean(props.disabled || isSubmitted);

      return (
        <div
          className="w-full flex flex-col gap-1 my-0.5"
          data-name={fieldName}
        >
          <div className="flex justify-between text-[11px] font-medium text-foreground">
            {props.label && <span>{props.label}</span>}
            <span>{value}</span>
          </div>
          <input
            id={fieldName}
            type="range"
            name={fieldName}
            min={props.min ?? 0}
            max={props.max ?? 100}
            step={props.step ?? 1}
            value={value}
            disabled={isDisabled}
            onChange={(e) => {
              if (isDisabled) return;
              const num = Number(e.target.value);
              setValue(num);
              setFieldValue?.(fieldName, num);
              emit?.("change");
            }}
            className={`w-full accent-accent h-1.5 bg-muted rounded-none ${
              isDisabled ? "cursor-not-allowed opacity-80" : "cursor-pointer"
            }`}
          />
        </div>
      );
    },
     
    Button: ({
      props,
      emit,
    }: {
       
      props: any;
      emit: (name: string) => void;
    }) => {
      const isLight =
        props.variant === "light" ||
        props.variant === "secondary" ||
        props.variant === "outline";
      const isDanger =
        props.variant === "danger" || props.variant === "destructive";
      const isGhost = props.variant === "ghost";

      const btnStyle = isDanger
        ? "bg-destructive-strong hover:bg-destructive-strong text-primary-foreground"
        : isGhost
          ? "bg-transparent hover:bg-secondary text-foreground"
          : isLight
            ? "bg-card border border-border text-foreground hover:bg-muted font-medium"
            : "bg-accent hover:bg-accent-hover text-accent-foreground font-medium";

      return (
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => {
            emit("press");
          }}
          className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-none text-xs transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none ${btnStyle} ${props.className || ""}`.trim()}
        >
          {props.label}
        </button>
      );
    },
     
    Link: ({ props }: { props: any }) => {
      return (
        <a
          href={props.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover hover:underline"
        >
          <span>{props.label || props.href}</span>
          <ExternalLink className="w-3 h-3 text-accent" />
        </a>
      );
    },
     
    Chips: ({ props }: { props: any }) => {
      const {
        isSubmitted = false,
        specValues,
        setFieldValue,
      } = useContext(GenerativeUIContext);
      const rawItems = Array.isArray(props.items) ? props.items : [];
      const normalizedItems: Array<{
        label: string;
        value: string;
        key: string;
      }> = rawItems.map((item: unknown, i: number) => {
        if (typeof item === "string" || typeof item === "number") {
          const s = String(item);
          return { label: s, value: s, key: `chip-${i}-${s}` };
        }
        if (typeof item === "object" && item !== null) {
          const o = item as { label?: unknown; value?: unknown };
          const val = String(o.value ?? o.label ?? "");
          const lbl = String(o.label ?? o.value ?? "");
          return { label: lbl, value: val, key: `chip-${i}-${val}` };
        }
        const s = String(item ?? "");
        return { label: s, value: s, key: `chip-${i}-${s}` };
      });

      const isAmber = props.variant === "amber";
      const isSelectable =
        Boolean(props.selectable ?? props.interactive) && !isSubmitted;
      const chipName =
        toCamelCase(props.name || props.label) || "selectedChips";
      const multiSelect = props.multiSelect !== false;

      const rawSelected = getFieldValue(
        specValues,
        chipName,
        props.name || props.label,
      ) as string[] | string | undefined;

      const currentSelected: string[] = Array.isArray(rawSelected)
        ? rawSelected
        : typeof rawSelected === "string"
          ? [rawSelected]
          : [];

      const handleToggle = (itemVal: string) => {
        if (!isSelectable || isSubmitted) return;
        let nextSelected: string[];
        if (multiSelect) {
          nextSelected = currentSelected.includes(itemVal)
            ? currentSelected.filter((x) => x !== itemVal)
            : [...currentSelected, itemVal];
        } else {
          nextSelected = currentSelected.includes(itemVal) ? [] : [itemVal];
        }
        const finalVal = multiSelect ? nextSelected : nextSelected[0] || "";
        setFieldValue?.(chipName, finalVal);
        if (props.name && props.name !== chipName) {
          setFieldValue?.(props.name, finalVal);
        }
      };

      const tagClass = isAmber
        ? "bg-brand-accent/15 text-brand-accent-dark border-brand-accent/30"
        : "bg-brand/8 text-brand border-brand/15";

      return (
        <div
          className="flex items-center gap-1.5 flex-wrap my-1 text-xs"
          data-name={chipName}
        >
          {props.label && (
            <span className="text-muted-foreground font-medium mr-1 inline-flex items-center gap-1">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              {props.label}
            </span>
          )}
          {normalizedItems.map((item) => {
            const isSelected = currentSelected.includes(item.value);
            const activeClass = isSelected
              ? "bg-brand text-primary-foreground border-brand font-semibold ring-1 ring-brand/30"
              : tagClass;
            const cursorClass = isSelectable
              ? "cursor-pointer hover:opacity-80 transition-all select-none"
              : isSubmitted
                ? "cursor-default select-none opacity-90"
                : "";

            return (
              <span
                key={item.key}
                onClick={() => handleToggle(item.value)}
                className={`px-2 py-0.5 rounded-none text-[11px] font-medium border ${cursorClass} ${activeClass}`}
              >
                {item.label}
              </span>
            );
          })}
        </div>
      );
    },
     
    Columns: ({ props }: { props: any }) => {
      const rawCols = Array.isArray(props.columns) ? props.columns : [];
      const count = rawCols.length;
      if (count === 0) return null;

       
      const rows: any[][] = [];
      for (let i = 0; i < count; i += 3) {
        rows.push(rawCols.slice(i, i + 3));
      }

      return (
        <div className="flex flex-col my-1">
          {rows.map((row, rowIdx) => {
            const gridClass =
              count === 1
                ? "grid-cols-1"
                : count === 2
                  ? "grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x"
                  : "grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x";

            const rowBorderClass =
              rowIdx > 0 ? "border-t border-border pt-3.5 md:pt-4" : "";
            const rowPaddingBottom =
              rowIdx < rows.length - 1 ? "pb-3.5 md:pb-4" : "";

            return (
              <div
                key={`col-row-${rowIdx}`}
                className={`grid ${gridClass} divide-border gap-3 md:gap-0 ${rowBorderClass} ${rowPaddingBottom}`}
              >
                {row.map((col: any, colIdx: number) => {
                  const title =
                    typeof col === "string"
                      ? col
                      : String(
                          col?.title || `Column ${rowIdx * 3 + colIdx + 1}`,
                        );
                  const items = Array.isArray(col?.items)
                    ? col.items.map((it: unknown) => String(it ?? ""))
                    : [];

                  return (
                    <div
                      key={`col-${rowIdx}-${colIdx}-${title}`}
                      className="flex flex-col gap-2 px-0 md:px-3 first:pl-0 last:pr-0 py-2.5 md:py-0"
                    >
                      <h4 className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] opacity-70">
                        {title}
                      </h4>
                      {items.length > 0 && (
                        <ul className="space-y-1.5 text-xs opacity-90 leading-relaxed">
                          {items.map((item: string, j: number) => (
                            <li
                              key={`col-item-${rowIdx}-${colIdx}-${j}-${item}`}
                              className="leading-snug"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      );
    },
     
    BarChart: ({ props }: { props: any }) => {
      const [mounted, setMounted] = useState(false);
      useEffect(() => {
        setMounted(true);
      }, []);

      const data = props.data || [];
      const xKey = props.xKey || "name";
      const yKeys = Array.isArray(props.yKey)
        ? props.yKey
        : [props.yKey || "value"];
      const height = props.height || 220;
      const isHorizontal = props.layout === "horizontal";

      const colors =
        props.color === "amber"
          ? [CHART_PALETTE[0], CHART_PALETTE[3], CHART_PALETTE[0]]
          : CHART_PALETTE;

      let maxChars = 1;
      for (const row of data) {
        for (const k of yKeys) {
          const v = row?.[k];
          if (typeof v === "number" || typeof v === "string") {
            const s = String(v);
            if (s.length > maxChars) maxChars = s.length;
          }
        }
      }
      const yAxisWidth = Math.max(
        20,
        Math.min(54, Math.round(maxChars * 7.5 + 8)),
      );

      const chartMargin = {
        top: 8,
        right: Math.max(14, Math.round(yAxisWidth * 0.85)),
        left: 4,
        bottom: 2,
      };

      return (
        <div
          className={`w-full flex flex-col items-center justify-center gap-1.5 outline-none focus:outline-none focus-visible:outline-none [&_*]:outline-none ${props.className !== undefined ? props.className : "my-2"}`}
        >
          {props.title && (
            <h4 className="font-display text-[12.5px] font-semibold text-foreground tracking-tight text-center w-full">
              {props.title}
            </h4>
          )}
          <div
            style={{ width: "100%", height }}
            className="outline-none focus:outline-none focus-visible:outline-none [&_*]:outline-none"
          >
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart
                  data={data}
                  layout={isHorizontal ? "vertical" : "horizontal"}
                  margin={chartMargin}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  {isHorizontal ? (
                    <>
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      />
                      <YAxis
                        dataKey={xKey}
                        type="category"
                        tick={{ fontSize: 11, fill: "var(--foreground)" }}
                        width={70}
                      />
                    </>
                  ) : (
                    <>
                      <XAxis
                        dataKey={xKey}
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      />
                      <YAxis
                        width={yAxisWidth}
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      />
                    </>
                  )}
                  <RechartsTooltip content={<CustomChartTooltip />} />
                  {yKeys.map((key: string, idx: number) => (
                    <Bar
                      key={`bar-${idx}-${key}`}
                      dataKey={key}
                      fill={colors[idx % colors.length]}
                      radius={0}
                      maxBarSize={40}
                    />
                  ))}
                </RechartsBarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-muted rounded-none animate-pulse" />
            )}
          </div>
        </div>
      );
    },
     
    LineChart: ({ props }: { props: any }) => {
      const [mounted, setMounted] = useState(false);
      useEffect(() => {
        setMounted(true);
      }, []);

      const data = props.data || [];
      const xKey = props.xKey || "date";
      const series = props.series || [
        { key: props.yKey || "value", label: "Value" },
      ];
      const height = props.height || 220;

      let maxChars = 1;
      const keys = series?.map((s: any) => s.key) || [props.yKey || "value"];
      for (const row of data) {
        for (const k of keys) {
          const v = row?.[k];
          if (typeof v === "number" || typeof v === "string") {
            const s = String(v);
            if (s.length > maxChars) maxChars = s.length;
          }
        }
      }
      const yAxisWidth = Math.max(
        20,
        Math.min(54, Math.round(maxChars * 7.5 + 8)),
      );

      const chartMargin = {
        top: 8,
        right: Math.max(14, Math.round(yAxisWidth * 0.85)),
        left: 4,
        bottom: 2,
      };

      return (
        <div
          className={`w-full flex flex-col items-center justify-center gap-1.5 outline-none focus:outline-none focus-visible:outline-none [&_*]:outline-none ${props.className !== undefined ? props.className : "my-2"}`}
        >
          {props.title && (
            <h4 className="font-display text-[12.5px] font-semibold text-foreground tracking-tight text-center w-full">
              {props.title}
            </h4>
          )}
          <div
            style={{ width: "100%", height }}
            className="outline-none focus:outline-none focus-visible:outline-none [&_*]:outline-none"
          >
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={data} margin={chartMargin}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis
                    width={yAxisWidth}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <RechartsTooltip content={<CustomChartTooltip />} />
                  {series.map(
                    (
                      s: { key: string; label?: string; color?: string },
                      idx: number,
                    ) => (
                      <Line
                        key={s.key || `line-${idx}`}
                        type={props.curve === "linear" ? "linear" : "monotone"}
                        dataKey={s.key}
                        name={s.label || s.key}
                        stroke={resolveChartColor(s.color, idx)}
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: resolveChartColor(s.color, idx) }}
                        activeDot={{ r: 5 }}
                      />
                    ),
                  )}
                </RechartsLineChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-muted rounded-none animate-pulse" />
            )}
          </div>
        </div>
      );
    },
     
    AreaChart: ({ props }: { props: any }) => {
      const [mounted, setMounted] = useState(false);
      useEffect(() => {
        setMounted(true);
      }, []);

      const data = props.data || [];
      const xKey = props.xKey || "date";
      const series = props.series || [
        { key: props.yKey || "value", label: "Volume" },
      ];
      const height = props.height || 220;

      let maxChars = 1;
      const keys = series?.map((s: any) => s.key) || [props.yKey || "value"];
      for (const row of data) {
        for (const k of keys) {
          const v = row?.[k];
          if (typeof v === "number" || typeof v === "string") {
            const s = String(v);
            if (s.length > maxChars) maxChars = s.length;
          }
        }
      }
      const yAxisWidth = Math.max(
        20,
        Math.min(54, Math.round(maxChars * 7.5 + 8)),
      );

      const chartMargin = {
        top: 8,
        right: Math.max(14, Math.round(yAxisWidth * 0.85)),
        left: 4,
        bottom: 2,
      };

      return (
        <div
          className={`w-full flex flex-col items-center justify-center gap-1.5 outline-none focus:outline-none focus-visible:outline-none [&_*]:outline-none ${props.className !== undefined ? props.className : "my-2"}`}
        >
          {props.title && (
            <h4 className="font-display text-[12.5px] font-semibold text-foreground tracking-tight text-center w-full">
              {props.title}
            </h4>
          )}
          <div
            style={{ width: "100%", height }}
            className="outline-none focus:outline-none focus-visible:outline-none [&_*]:outline-none"
          >
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsAreaChart data={data} margin={chartMargin}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis
                    width={yAxisWidth}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <RechartsTooltip content={<CustomChartTooltip />} />
                  {series.map(
                    (
                      s: { key: string; label?: string; color?: string },
                      idx: number,
                    ) => {
                      const color = resolveChartColor(s.color, idx);
                      const safeKey = s.key || `area-${idx}`;
                      return (
                        <Area
                          key={safeKey}
                          type="monotone"
                          dataKey={s.key}
                          name={s.label || s.key}
                          stroke={color}
                          strokeWidth={2}
                          fillOpacity={0.12}
                          fill={color}
                        />
                      );
                    },
                  )}
                </RechartsAreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-muted rounded-none animate-pulse" />
            )}
          </div>
        </div>
      );
    },
     
    PieChart: ({ props }: { props: any }) => {
      const [mounted, setMounted] = useState(false);
      useEffect(() => {
        setMounted(true);
      }, []);

      const data = props.data || [];
      const height = props.height || 220;
      const isDonut = props.donut ?? true;
      const colors = CHART_PALETTE;

      return (
        <div
          className={`w-full flex flex-col items-center justify-center gap-1.5 outline-none focus:outline-none focus-visible:outline-none [&_*]:outline-none ${props.className !== undefined ? props.className : "my-2"}`}
        >
          {props.title && (
            <h4 className="font-display text-[12.5px] font-semibold text-foreground tracking-tight text-center w-full">
              {props.title}
            </h4>
          )}
          <div
            style={{ width: "100%", height }}
            className="outline-none focus:outline-none focus-visible:outline-none [&_*]:outline-none"
          >
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <RechartsTooltip content={<CustomChartTooltip />} />
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={isDonut ? 48 : 0}
                    outerRadius={75}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {data.map((entry: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={resolveChartColor(entry.color, index)}
                      />
                    ))}
                  </Pie>
                </RechartsPieChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-muted rounded-none animate-pulse" />
            )}
          </div>
          <div className="flex items-center justify-center flex-wrap gap-x-4 gap-y-1.5 pt-1 text-xs">
            {data.map((item: any, idx: number) => (
              <div
                key={`pie-legend-${idx}-${item.name || idx}`}
                className="flex items-center gap-1.5"
              >
                <span
                  className="w-2.5 h-2.5 rounded-none shrink-0"
                  style={{
                    backgroundColor: resolveChartColor(item.color, idx),
                  }}
                />
                <span className="text-muted-foreground">{item.name}:</span>
                <span className="font-semibold text-foreground">
                  {item.value}%
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    },
     
    RadarChart: ({ props }: { props: any }) => {
      const [mounted, setMounted] = useState(false);
      useEffect(() => {
        setMounted(true);
      }, []);

      const data = props.data || [];
      const keys = props.keys || [];
      const dimKey = props.dimensionKey || "subject";
      const height = props.height || 240;
      const colors = CHART_PALETTE;

      return (
        <div
          className={`w-full flex flex-col items-center justify-center gap-1.5 outline-none focus:outline-none focus-visible:outline-none [&_*]:outline-none ${props.className !== undefined ? props.className : "my-2"}`}
        >
          {props.title && (
            <h4 className="font-display text-[12.5px] font-semibold text-foreground tracking-tight text-center w-full">
              {props.title}
            </h4>
          )}
          <div
            style={{ width: "100%", height }}
            className="outline-none focus:outline-none focus-visible:outline-none [&_*]:outline-none"
          >
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsRadarChart
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  data={data}
                >
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis
                    dataKey={dimKey}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  />
                  {keys.map(
                    (
                      k: { key: string; label?: string; color?: string },
                      idx: number,
                    ) => (
                      <Radar
                        key={k.key || `radar-${idx}`}
                        name={k.label || k.key}
                        dataKey={k.key}
                        stroke={resolveChartColor(k.color, idx)}
                        fill={resolveChartColor(k.color, idx)}
                        fillOpacity={0.25}
                      />
                    ),
                  )}
                  <RechartsTooltip content={<CustomChartTooltip />} />
                </RechartsRadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-muted rounded-none animate-pulse" />
            )}
          </div>
        </div>
      );
    },
     
    Metric: ({ props }: { props: any }) => {
      const isDark = props.variant === "dark";

      const trend =
        props.trend ??
        (typeof props.change === "string" && props.change.trim().startsWith("-")
          ? "down"
          : typeof props.change === "string" && props.change.trim().startsWith("+")
            ? "up"
            : "neutral");

      const trendClass = isDark
        ? trend === "up"
          ? "bg-card text-success font-bold"
          : trend === "down"
            ? "bg-card text-destructive font-bold"
            : "bg-card text-foreground font-bold"
        : trend === "up"
          ? "bg-success-tint text-success border border-success/25 font-semibold"
          : trend === "down"
            ? "bg-destructive-tint text-destructive border border-destructive/25 font-semibold"
            : "bg-secondary text-foreground border border-border font-semibold";

      const surfaceClass = isDark
        ? "bg-brand text-primary-foreground border-brand-border/40"
        : "bg-card text-foreground border-border";

      return (
        <div
          className={`rounded-none border ${surfaceClass} p-3 sm:p-3.5 flex flex-col justify-between gap-1.5 transition-all ${
            props.className || ""
          }`}
        >
          <span className="font-mono text-[10.5px] font-medium opacity-70 tracking-[0.14em] uppercase">
            {props.label}
          </span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xl sm:text-2xl font-bold tracking-tight">
              {props.value}
            </span>
            {props.change && (
              <span
                className={`inline-flex items-center text-[10.5px] px-2 py-0.5 rounded-none leading-tight ${trendClass}`}
              >
                {props.change}
              </span>
            )}
          </div>
        </div>
      );
    },
     
    SubmitBar: ({ props }: { props: any }) => {
      const { isSubmitted = false } = useContext(GenerativeUIContext);
      const { execute } = useActions();

      const [isSubmitting, setIsSubmitting] = useState(false);

      const handleSubmit = async () => {
        if (isSubmitting || isSubmitted) return;
        setIsSubmitting(true);
        try {
          await execute({ action: "submit" });
        } finally {
          setIsSubmitting(false);
        }
      };

      const handleSecondary = async () => {
        if (isSubmitting || isSubmitted) return;
        setIsSubmitting(true);
        try {
          await execute({
            action: "submit",
            params: {
              _action: props.secondaryAction || "skip",
            },
          });
        } finally {
          setIsSubmitting(false);
        }
      };

      const isLight = props.variant === "light";
      const variantBg = isLight
        ? "bg-card hover:bg-muted text-foreground border border-border font-medium"
        : "bg-accent hover:bg-accent-hover text-accent-foreground font-semibold";

      if (isSubmitted) {
        return null;
      }

      return (
        <div className="w-full flex items-center justify-between gap-3 -mt-0.5 pt-2.5 border-t border-border">
          {props.statusText ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground font-medium">
              <Check className="w-4 h-4 text-success" /> {props.statusText}
            </span>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            {props.secondaryLabel && (
              <button
                type="button"
                disabled={isSubmitting || isSubmitted}
                onClick={handleSecondary}
                className="px-4 py-2.5 rounded-none border border-border bg-card hover:bg-muted text-foreground text-sm font-medium transition-colors disabled:opacity-50"
              >
                {props.secondaryLabel}
              </button>
            )}
            <button
              type="button"
              disabled={isSubmitting || props.disabled || isSubmitted}
              onClick={handleSubmit}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-none text-sm font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none ${variantBg}`}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {props.label}
            </button>
          </div>
        </div>
      );
    },
  },
});
