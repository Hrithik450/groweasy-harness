"use client";

import React, { useContext, useState, useEffect, useRef, useMemo } from "react";
import { defineRegistry, useBoundProp, useActions } from "@json-render/react";
import {
  catalog,
  toCamelCase,
  useNormalizedFieldId,
  getStoreFieldValue,
} from "@/lib/generative.ui";
import { useInteractiveStore } from "@/store";
import { GenerativeUIContext } from "./renderer";
import { GenerativeUIImage } from "@/components/image/system.image.viewer";
import { VideoPlayer } from "@/components/video/system.video.viewer";
import { AudioPlayer } from "@/components/audio/system.audio.viewer";
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

import {
  ASPECT_CONFIG,
  normalizeAspectRatio,
  type StandardAspectRatio,
} from "@/components/image/utils";

export const GenerativeUIContainerContext = React.createContext<{
  isInGrid?: boolean;
  isInCard?: boolean;
  isInCarousel?: boolean;
  isVertical?: boolean;
  aspectRatio?: StandardAspectRatio;
}>({});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomChartTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-border bg-card/95 backdrop-blur-xs p-2.5 shadow-lg text-xs min-w-[120px]">
        {label && (
          <p className="font-semibold text-foreground mb-1 border-b border-border-subtle pb-1">
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
              <span className="font-medium text-foreground/80">
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Card: ({ props, children }: { props: any; children?: React.ReactNode }) => {
      const {
        scopeId = "default",
        isSubmitted = false,
        specValues,
      } = useContext(GenerativeUIContext);
      const containerContext = useContext(GenerativeUIContainerContext);

      const isSelectable = Boolean(props.selectable);
      const cardValue = props.value || props.title || "card";
      const group = toCamelCase(props.name) || "cardSelection";
      const cardDomId = useNormalizedFieldId(
        props.title || props.value,
        "card",
      );

      const selectedInStore = useInteractiveStore((s) =>
        getStoreFieldValue(s.values[scopeId], group, props.name),
      );
      const fallbackSelected = getStoreFieldValue(
        specValues,
        group,
        props.name,
      );
      const resolvedSelection =
        selectedInStore !== undefined ? selectedInStore : fallbackSelected;
      const isSelected = isSelectable
        ? resolvedSelection !== undefined &&
          String(resolvedSelection) === String(cardValue)
        : false;

      const handleCardClick = () => {
        if (!isSelectable || isSubmitted) return;
        useInteractiveStore.getState().setValue(scopeId, group, cardValue);
      };

      const hasChildren = Boolean(
        children &&
        (Array.isArray(children)
          ? children.some(Boolean)
          : children !== null && children !== undefined),
      );

      // Caller-supplied class names, not rendered colours: a dark surface needs
      // light text, so detect the utilities that paint one.
      const hasDarkBgOrWhiteText =
        /\btext-background\b/i.test(props.className || "") ||
        /\bbg-foreground\b/i.test(props.className || "") ||
        /\bbg-brand-(dark|surface|primary)\b/i.test(props.className || "") ||
        /\bbg-brand(?![a-zA-Z0-9_\-\/])/i.test(props.className || "");

      const isCustomBg =
        /(bg-(brand|white|black|transparent|gray|zinc|slate|emerald|amber|red|blue|purple|rose|neutral))/i.test(
          props.className || "",
        );
      const isCustomBorder =
        /(border-(brand|white|black|transparent|none|gray|zinc|slate|emerald|amber|red|blue|purple|rose|neutral))/i.test(
          props.className || "",
        );
      const isCustomShadow = /(shadow-(none|2xs|xs|sm|md|lg|xl|2xl))/i.test(
        props.className || "",
      );

      // Background never changes when selected - only highlight the border!
      const baseBg = isCustomBg ? "" : "bg-card";

      const baseBorder =
        isSelectable && isSelected
          ? hasDarkBgOrWhiteText
            ? "border-2 border-primary-foreground ring-2 ring-primary-foreground/30"
            : "border-2 border-brand ring-2 ring-brand/20"
          : isCustomBorder
            ? ""
            : "border border-border";

      const baseShadow = isCustomShadow ? "" : "shadow-xs";

      const baseCardStyle = `${baseBg} ${baseBorder} ${baseShadow}`.trim();

      const titleColor = hasDarkBgOrWhiteText ? "text-primary-foreground" : "text-foreground";
      const eyebrowColor = hasDarkBgOrWhiteText
        ? "text-primary-foreground/70"
        : "text-muted-foreground";
      const descColor = hasDarkBgOrWhiteText
        ? "text-primary-foreground/80"
        : "text-muted-foreground";
      const dividerColor = hasDarkBgOrWhiteText
        ? "border-primary-foreground/15"
        : "border-border-subtle";

      const effectiveBadge =
        props.badge || (isSelectable && isSelected ? "SELECTED" : undefined);

      const badgeClass =
        isSelectable && isSelected
          ? hasDarkBgOrWhiteText
            ? "bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30"
            : "bg-brand/10 text-brand border-brand/20"
          : hasDarkBgOrWhiteText
            ? "bg-primary-foreground/15 text-primary-foreground border-primary-foreground/20"
            : "bg-muted text-foreground/80 border-border";

      const cursorClass =
        isSelectable && !isSubmitted
          ? "cursor-pointer hover:border-brand/40 select-none"
          : isSelectable && isSubmitted
            ? "cursor-default select-none"
            : "";

      let cleanClassName = (props.className || "")
        .replace(
          /\b([pP][xytblr]?-\d+(\.\d+)?|sm:[pP][xytblr]?-\d+(\.\d+)?|[mM][xytblr]?-\d+(\.\d+)?|space-[xy]?-\d+(\.\d+)?|gap-\d+(\.\d+)?)\b/g,
          "",
        )
        .trim();

      if (isSelectable && isSelected) {
        cleanClassName = cleanClassName
          .replace(/\b(border(-\w+)*|ring(-\w+)*)\b/g, "")
          .trim();
      }

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

      // All asset cards and carousel slides strictly clamp to 1 line; only plain text cards get 2 lines
      const hasAsset = Boolean(aspect) || hasChildren || isInsideCarousel;
      const descClampClass = hasAsset ? "line-clamp-1" : "line-clamp-2";

      return (
        <div
          id={cardDomId}
          onClick={handleCardClick}
          data-name={group}
          data-value={cardValue}
          className={`${maxWidthClass} ${cursorClass} h-full flex flex-col justify-between rounded-2xl ${baseCardStyle} p-3 sm:p-3.5 ${
            hasDarkBgOrWhiteText ? "text-primary-foreground" : "text-foreground"
          } transition-all ${cleanClassName}`}
        >
          <div className="flex flex-col flex-1">
            {(props.eyebrow ||
              props.title ||
              props.description ||
              effectiveBadge) && (
              <div
                className={`flex items-start justify-between gap-2 ${
                  hasChildren ? `mb-2.5 pb-2 border-b ${dividerColor}` : ""
                }`}
              >
                <div className="flex flex-col gap-1.5 min-w-0">
                  {props.eyebrow && (
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${eyebrowColor}`}
                    >
                      {props.eyebrow}
                    </span>
                  )}
                  {props.title && (
                    <h3
                      className={`font-semibold ${titleColor} text-sm sm:text-[15px] tracking-tight leading-snug line-clamp-1`}
                    >
                      {props.title}
                    </h3>
                  )}
                  {props.description && (
                    <p
                      className={`text-xs ${descColor} leading-relaxed ${descClampClass}`}
                    >
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Stack: ({
      props,
      children,
    }: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // Cards in 768px chat container must be capped at 2 columns max to prevent crushing copy
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
            className={`grid ${gridClass} ${stretchClass} gap-3 [&>*]:min-w-0 [&:has([data-system-image])]:w-fit w-full max-w-full my-1 items-stretch ${
              props.className || ""
            }`}
          >
            {children}
          </div>
        </GenerativeUIContainerContext.Provider>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Tabs: ({ props, children, bindings, emit }: any) => {
      const rawTabs = Array.isArray(props.tabs) ? props.tabs : [];
      const tabs = useMemo((): Array<{
        value: string;
        label: string;
        key: string;
      }> => {
        return rawTabs.map((tab: unknown, idx: number) => {
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
      }, [rawTabs]);
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
          <div className="flex items-center gap-1 p-1 bg-muted rounded-xl overflow-x-auto">
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-card text-foreground shadow-2xs font-semibold"
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Accordion: ({ props }: any) => {
      const rawItems = Array.isArray(props.items) ? props.items : [];
      const normalizedItems = useMemo((): Array<{
        title: string;
        content: string;
        key: string;
      }> => {
        return rawItems.map((item: unknown, i: number) => {
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
      }, [rawItems]);
      const isMultiple = props.type === "multiple";
      const [openIndex, setOpenIndex] = useState<number | null>(0);
      const [openSet, setOpenSet] = useState<Set<number>>(new Set([0]));

      return (
        <div className="w-full divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden my-1 shadow-2xs">
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
                  className="flex items-center justify-between px-4 py-3 text-left text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <span className="min-w-0 truncate">{item.title}</span>
                  <ChevronDown
                    className={`shrink-0 w-3.5 h-3.5 text-muted-2 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-foreground" : ""
                    }`}
                  />
                </button>
                {isOpen && item.content && (
                  <div className="px-4 pb-3.5 pt-1 text-xs text-muted-foreground leading-relaxed border-t border-border-subtle bg-muted/40">
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
              className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 z-30 w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center rounded-none bg-card hover:bg-card text-foreground shadow-sm hover:shadow border border-border transition-all opacity-95 hover:opacity-100 hover:scale-105 active:scale-95 cursor-pointer"
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
              className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-30 w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center rounded-none bg-card hover:bg-card text-foreground shadow-sm hover:shadow border border-border transition-all opacity-95 hover:opacity-100 hover:scale-105 active:scale-95 cursor-pointer"
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const childProps = (child as any)?.props || {};
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const childEl = (child as any)?.props?.element;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                    className={`shrink-0 ${cardWidthClass} rounded-2xl border border-border bg-card p-3 shadow-2xs snap-start flex flex-col gap-2 transition-all hover:shadow-xs ${itemClass}`.trim()}
                  >
                    {/* Media: Video or Image detected on the fly from src */}
                    {mediaSrc &&
                      (isVideo ? (
                        <div className="w-full rounded-xl overflow-hidden">
                          <VideoPlayer
                            src={mediaSrc}
                            title={itemTitle || "Video"}
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
                          // `itemHref` stays data, never a redirect: the reader
                          // stays on our surface.
                          <h4 className="font-semibold text-sm sm:text-[15px] text-foreground leading-snug line-clamp-1">
                            {itemTitle}
                          </h4>
                        ) : (
                          <h4 className="font-semibold text-sm sm:text-[15px] text-foreground leading-snug line-clamp-1">
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      const cleanClassName = (props.className || "")
        .replace(
          /\b([pP][xytblr]?-\d+(\.\d+)?|sm:[pP][xytblr]?-\d+(\.\d+)?|[mM][xytblr]?-\d+(\.\d+)?|space-[xy]-\d+(\.\d+)?|gap-\d+(\.\d+)?)\b/g,
          "",
        )
        .trim();

      return (
        <div
          className={`w-full overflow-x-auto rounded-xl border border-border bg-card shadow-2xs ${cleanClassName}`.trim()}
        >
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-brand/5 border-b border-brand/15 text-brand font-semibold text-[11px] uppercase tracking-wider">
              <tr>
                {columns.map((col: string, i: number) => (
                  <th key={`col-${i}-${col}`} className="px-2.5 py-2 font-bold">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle text-foreground/80">
              {rows.map((row: string[], rowIdx: number) => (
                <tr
                  key={`tr-${rowIdx}`}
                  className="hover:bg-brand/2 transition-colors"
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
            {props.caption && (
              <caption className="p-2 text-[11px] text-muted-2 text-left">
                {props.caption}
              </caption>
            )}
          </table>
        </div>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Heading: ({ props }: { props: any }) => {
      const level = props.level ?? 2;
      const headingClasses: Record<number, string> = {
        1: "text-lg sm:text-xl font-bold tracking-tight text-foreground",
        2: "text-base sm:text-lg font-semibold tracking-tight text-foreground",
        3: "text-sm sm:text-base font-semibold text-foreground",
        4: "text-xs sm:text-sm font-medium text-foreground/80",
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Text: ({ props }: { props: any }) => {
      const containerContext = useContext(GenerativeUIContainerContext);
      const clampClass = containerContext?.isVertical
        ? "line-clamp-1"
        : containerContext?.isInCarousel
          ? "line-clamp-2"
          : "";

      const mergedClass =
        `text-sm text-foreground font-medium leading-relaxed m-0 ${clampClass} ${props.className || ""}`.trim();

      return <p className={mergedClass}>{props.text}</p>;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Video: ({ props }: any) => {
      return (
        <div className="w-full my-1.5">
          <VideoPlayer
            src={props.src || ""}
            title={props.title || "Video"}
            className={props.className}
          />
        </div>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // eslint-disable-next-line @next/next/no-img-element
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Badge: ({ props }: { props: any }) => {
      const hasCustomBg =
        /(bg-(brand|white|black|transparent|gray|zinc|slate|emerald|amber|red|blue|purple|rose|neutral))/i.test(
          props.className || "",
        );
      const hasCustomText =
        /(text-(brand|white|black|transparent|gray|zinc|slate|emerald|amber|red|blue|purple|rose|neutral))/i.test(
          props.className || "",
        );
      const hasCustomBorder =
        /(border-(brand|white|black|transparent|none|gray|zinc|slate|emerald|amber|red|blue|purple|rose|neutral))/i.test(
          props.className || "",
        );

      const baseClasses = `${hasCustomBorder ? "" : "border border-border"} ${
        hasCustomBg ? "" : "bg-muted"
      } ${hasCustomText ? "" : "text-foreground/80"}`.trim();

      const cleanClassName = (props.className || "")
        .replace(
          /\b([pP][xytblr]?-\d+(\.\d+)?|sm:[pP][xytblr]?-\d+(\.\d+)?|[mM][xytblr]?-\d+(\.\d+)?)\b/g,
          "",
        )
        .trim();

      return (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-none text-[10.5px] font-medium leading-tight ${baseClasses} ${cleanClassName}`.trim()}
        >
          {props.text}
        </span>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Alert: ({ props }: any) => {
      const isDestructive =
        props.type === "destructive" || props.type === "error";
      const isWarning = props.type === "warning";
      const isSuccess = props.type === "success";

      const style = isDestructive
        ? "bg-destructive-tint border-destructive-border text-destructive"
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

      const cleanClassName = (props.className || "")
        .replace(
          /\b([pP][xytblr]?-\d+(\.\d+)?|sm:[pP][xytblr]?-\d+(\.\d+)?|[mM][xytblr]?-\d+(\.\d+)?|space-[xy]-\d+(\.\d+)?|gap-\d+(\.\d+)?)\b/g,
          "",
        )
        .trim();

      return (
        <div
          className={`w-full rounded-xl border p-2 sm:p-2.5 flex items-start gap-2.5 text-xs my-0.5 ${style} ${cleanClassName}`.trim()}
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Tooltip: ({ props, children }: any) => {
      const [visible, setVisible] = useState(false);
      return (
        <div
          className="relative inline-flex"
          onMouseEnter={() => setVisible(true)}
          onMouseLeave={() => setVisible(false)}
        >
          {children ?? (
            <span className="underline decoration-dotted cursor-help text-xs text-foreground/80">
              {props.text}
            </span>
          )}
          {visible && props.content && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 bg-foreground text-primary-foreground text-[11px] rounded-lg shadow-lg whitespace-nowrap z-50">
              {props.content}
            </div>
          )}
        </div>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Input: ({ props, bindings, emit }: any) => {
      const {
        scopeId = "default",
        isSubmitted = false,
        specValues,
      } = useContext(GenerativeUIContext);
      const fieldName = useNormalizedFieldId(
        props.name || props.label,
        "input",
      );
      const storeValue = useInteractiveStore((s) =>
        getStoreFieldValue(
          s.values[scopeId],
          fieldName,
          props.name || props.label,
        ),
      );
      const [boundValue, setBoundValue] = useBoundProp(
        props.value,
        bindings?.value,
      );
      const [localValue, setLocalValue] = useState(props.value ?? "");
      const isBound = !!bindings?.value;

      const fallbackValue = getStoreFieldValue(
        specValues,
        fieldName,
        props.name || props.label,
      );
      const resolvedValue =
        storeValue !== undefined ? storeValue : fallbackValue;

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
              useInteractiveStore
                .getState()
                .setValue(scopeId, fieldName, e.target.value);
              emit?.("change");
            }}
            className={`w-full px-3.5 py-2.5 text-sm rounded-xl border transition-all ${
              isDisabled
                ? "bg-muted/75 text-foreground border-border cursor-not-allowed select-none focus:outline-none"
                : "bg-card text-foreground border-border placeholder:text-muted-2 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            }`}
          />
        </div>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Textarea: ({ props, bindings, emit }: any) => {
      const {
        scopeId = "default",
        isSubmitted = false,
        specValues,
      } = useContext(GenerativeUIContext);
      const fieldName = useNormalizedFieldId(
        props.name || props.label,
        "textarea",
      );
      const storeValue = useInteractiveStore((s) =>
        getStoreFieldValue(
          s.values[scopeId],
          fieldName,
          props.name || props.label,
        ),
      );
      const [boundValue, setBoundValue] = useBoundProp(
        props.value,
        bindings?.value,
      );
      const [localValue, setLocalValue] = useState(props.value ?? "");
      const isBound = !!bindings?.value;

      const fallbackValue = getStoreFieldValue(
        specValues,
        fieldName,
        props.name || props.label,
      );
      const resolvedValue =
        storeValue !== undefined ? storeValue : fallbackValue;

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
              useInteractiveStore
                .getState()
                .setValue(scopeId, fieldName, e.target.value);
              emit?.("change");
            }}
            className={`w-full px-3.5 py-2.5 text-sm rounded-xl border transition-all resize-none ${
              isDisabled
                ? "bg-muted/75 text-foreground border-border cursor-not-allowed select-none focus:outline-none"
                : "bg-card text-foreground border-border placeholder:text-muted-2 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            }`}
          />
        </div>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Select: ({ props, bindings, emit }: any) => {
      const {
        scopeId = "default",
        isSubmitted = false,
        specValues,
      } = useContext(GenerativeUIContext);
      const fieldName = useNormalizedFieldId(
        props.name || props.label,
        "select",
      );
      const storeValue = useInteractiveStore((s) =>
        getStoreFieldValue(
          s.values[scopeId],
          fieldName,
          props.name || props.label,
        ),
      );
      const [boundValue, setBoundValue] = useBoundProp(
        props.value,
        bindings?.value,
      );
      const [localValue, setLocalValue] = useState(props.value ?? "");
      const isBound = !!bindings?.value;

      const fallbackValue = getStoreFieldValue(
        specValues,
        fieldName,
        props.name || props.label,
      );
      const resolvedValue =
        storeValue !== undefined ? storeValue : fallbackValue;

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

      // Close dropdown on outside click or Escape key
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

      // Normalize options into a uniform array of { value, label, key }
      const normalizedOptions = useMemo((): Array<{
        value: string;
        label: string;
        key: string;
      }> => {
        const rawList = Array.isArray(props.options) ? props.options : [];
        const normPlaceholder = (props.placeholder || "choose one")
          .trim()
          .toLowerCase();

        return rawList
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
      }, [props.options, props.placeholder]);

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
        useInteractiveStore.getState().setValue(scopeId, fieldName, val);
        const cleanK = fieldName.replace(/_[a-z0-9]+$/i, "");
        if (cleanK && cleanK !== fieldName) {
          useInteractiveStore.getState().setValue(scopeId, cleanK, val);
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
              className={`w-full flex items-center justify-between pl-3.5 pr-3 py-2.5 text-sm rounded-xl border text-left transition-all shadow-2xs ${
                isDisabled
                  ? "bg-muted/75 text-muted-2 border-border cursor-not-allowed select-none"
                  : isOpen
                    ? "bg-card text-foreground border-brand ring-2 ring-brand/20 cursor-pointer"
                    : "bg-card text-foreground border-border hover:border-border-strong focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand cursor-pointer"
              }`}
            >
              <span
                className={`truncate ${
                  isPlaceholder
                    ? "text-muted-2 font-normal"
                    : "text-foreground font-medium"
                }`}
              >
                {displayLabel}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-muted-2 transition-transform duration-200 shrink-0 ml-2 ${
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
                className={`absolute left-0 right-0 z-50 bg-card rounded-xl border border-border shadow-xl py-1.5 px-1 max-h-64 overflow-y-auto animate-in fade-in-50 zoom-in-95 duration-100 ${
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
                      className={`w-full text-left px-3 py-2 text-sm rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Checkbox: ({ props, bindings, emit }: any) => {
      const {
        scopeId = "default",
        isSubmitted = false,
        specValues,
      } = useContext(GenerativeUIContext);
      const fieldName = useNormalizedFieldId(
        props.name || props.label,
        "checkbox",
      );
      const storeValue = useInteractiveStore((s) =>
        getStoreFieldValue(
          s.values[scopeId],
          fieldName,
          props.name || props.label,
        ),
      );
      const [boundChecked, setBoundChecked] = useBoundProp(
        props.checked,
        bindings?.checked,
      );
      const [localChecked, setLocalChecked] = useState(props.checked ?? false);
      const isBound = !!bindings?.checked;

      const fallbackValue = getStoreFieldValue(
        specValues,
        fieldName,
        props.name || props.label,
      );
      const resolvedValue =
        storeValue !== undefined ? storeValue : fallbackValue;

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
          className={`inline-flex items-center gap-2 text-xs text-foreground/80 my-1 select-none ${
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
              useInteractiveStore.getState().setValue(scopeId, fieldName, next);
              emit?.("change");
            }}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${
              isDisabled ? "cursor-not-allowed opacity-80" : "cursor-pointer"
            } ${
              checked
                ? "border-brand bg-brand text-primary-foreground"
                : "border-border-strong bg-card"
            }`}
          >
            {checked && <Check className="h-2.5 w-2.5 stroke-[2.5]" />}
          </button>
          {props.label && <span>{props.label}</span>}
        </label>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Radio: ({ props, bindings, emit }: any) => {
      const {
        scopeId = "default",
        isSubmitted = false,
        specValues,
      } = useContext(GenerativeUIContext);
      const fieldName = useNormalizedFieldId(
        props.name || props.label,
        "radio",
      );
      const rawOptions = Array.isArray(props.options) ? props.options : [];
      const storeValue = useInteractiveStore((s) =>
        getStoreFieldValue(
          s.values[scopeId],
          fieldName,
          props.name || props.label,
        ),
      );
      const [boundValue, setBoundValue] = useBoundProp(
        props.value,
        bindings?.value,
      );
      const [localValue, setLocalValue] = useState(props.value ?? "");
      const isBound = !!bindings?.value;

      const fallbackValue = getStoreFieldValue(
        specValues,
        fieldName,
        props.name || props.label,
      );
      const resolvedValue =
        storeValue !== undefined ? storeValue : fallbackValue;

      const value =
        resolvedValue !== undefined
          ? String(resolvedValue)
          : isBound
            ? (boundValue ?? "")
            : localValue;
      const setValue = isBound ? setBoundValue : setLocalValue;

      const isDisabled = Boolean(props.disabled || isSubmitted);

      // Normalize options to support strings, numbers, and { value, label } objects with guaranteed unique keys
      const normalizedOptions = useMemo((): Array<{
        value: string;
        label: string;
        key: string;
      }> => {
        return rawOptions.map((opt: unknown, idx: number) => {
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
      }, [rawOptions]);

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
                    useInteractiveStore
                      .getState()
                      .setValue(scopeId, fieldName, opt.value);
                    const cleanK = fieldName.replace(/_[a-z0-9]+$/i, "");
                    if (cleanK && cleanK !== fieldName) {
                      useInteractiveStore
                        .getState()
                        .setValue(scopeId, cleanK, opt.value);
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
                        : "border-border-strong bg-card"
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Switch: ({ props, bindings, emit }: any) => {
      const {
        scopeId = "default",
        isSubmitted = false,
        specValues,
      } = useContext(GenerativeUIContext);
      const fieldName = useNormalizedFieldId(
        props.name || props.label,
        "switch",
      );
      const storeValue = useInteractiveStore((s) =>
        getStoreFieldValue(
          s.values[scopeId],
          fieldName,
          props.name || props.label,
        ),
      );
      const [boundChecked, setBoundChecked] = useBoundProp(
        props.checked,
        bindings?.checked,
      );
      const [localChecked, setLocalChecked] = useState(props.checked ?? false);
      const isBound = !!bindings?.checked;

      const fallbackValue = getStoreFieldValue(
        specValues,
        fieldName,
        props.name || props.label,
      );
      const resolvedValue =
        storeValue !== undefined ? storeValue : fallbackValue;

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
          className={`inline-flex items-center gap-2 text-xs text-foreground/80 my-1 select-none ${
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
              useInteractiveStore.getState().setValue(scopeId, fieldName, next);
              emit?.("change");
            }}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-none border-2 border-transparent transition-colors duration-200 ease-in-out ${
              isDisabled ? "cursor-not-allowed opacity-80" : "cursor-pointer"
            } ${checked ? "bg-brand" : "bg-muted"}`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-none bg-card shadow-sm ring-0 transition duration-200 ease-in-out ${
                checked ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
          {props.label && <span>{props.label}</span>}
        </label>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Slider: ({ props, bindings, emit }: any) => {
      const {
        scopeId = "default",
        isSubmitted = false,
        specValues,
      } = useContext(GenerativeUIContext);
      const fieldName = useNormalizedFieldId(
        props.name || props.label,
        "slider",
      );
      const storeValue = useInteractiveStore((s) =>
        getStoreFieldValue(
          s.values[scopeId],
          fieldName,
          props.name || props.label,
        ),
      );
      const [boundValue, setBoundValue] = useBoundProp(
        props.value,
        bindings?.value,
      );
      const [localValue, setLocalValue] = useState(
        props.value ?? props.min ?? 0,
      );
      const isBound = !!bindings?.value;

      const fallbackValue = getStoreFieldValue(
        specValues,
        fieldName,
        props.name || props.label,
      );
      const resolvedValue =
        storeValue !== undefined ? storeValue : fallbackValue;

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
          <div className="flex justify-between text-[11px] font-medium text-foreground/80">
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
              useInteractiveStore.getState().setValue(scopeId, fieldName, num);
              emit?.("change");
            }}
            className={`w-full accent-brand h-1.5 bg-muted rounded-lg ${
              isDisabled ? "cursor-not-allowed opacity-80" : "cursor-pointer"
            }`}
          />
        </div>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Button: ({
      props,
      emit,
    }: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      props: any;
      emit: (name: string) => void;
    }) => {
      const isSecondary =
        props.variant === "secondary" || props.variant === "outline";
      const isDanger =
        props.variant === "danger" || props.variant === "destructive";
      const isAmber = props.variant === "amber";

      const btnStyle = isDanger
        ? "bg-destructive-strong hover:bg-destructive-strong/90 text-primary-foreground"
        : isAmber
          ? "bg-brand-accent hover:bg-brand-accent-hover text-brand-surface font-semibold shadow-xs"
          : isSecondary
            ? "bg-card border border-border-strong text-foreground/80 hover:bg-muted hover:border-border-strong"
            : "bg-brand hover:bg-brand-hover text-primary-foreground shadow-xs font-medium";

      return (
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => {
            emit("press");
          }}
          className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none ${btnStyle} ${props.className || ""}`.trim()}
        >
          {props.label}
        </button>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Link: ({ props }: { props: any }) => {
      // A block never navigates away: show the reference, not a redirect.
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-brand">
          {props.label || props.href}
        </span>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Chips: ({ props }: { props: any }) => {
      const {
        scopeId = "default",
        isSubmitted = false,
        specValues,
      } = useContext(GenerativeUIContext);
      const rawItems = Array.isArray(props.items) ? props.items : [];
      const normalizedItems = useMemo((): Array<{
        label: string;
        value: string;
        key: string;
      }> => {
        return rawItems.map((item: unknown, i: number) => {
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
      }, [rawItems]);

      const isAmber = props.variant === "amber";
      // The catalogue names this `selectable`; older specs used `interactive`.
      const isInteractive =
        Boolean(props.selectable || props.interactive) && !isSubmitted;
      const chipName =
        toCamelCase(props.name || props.label) || "selectedChips";
      const multiSelect = props.multiSelect !== false;

      const storeSelected = useInteractiveStore((s) =>
        getStoreFieldValue(
          s.values[scopeId],
          chipName,
          props.name || props.label,
        ),
      ) as string[] | string | undefined;

      const fallbackSelected = getStoreFieldValue(
        specValues,
        chipName,
        props.name || props.label,
      ) as string[] | string | undefined;

      const rawSelected =
        storeSelected !== undefined ? storeSelected : fallbackSelected;

      const currentSelected: string[] = Array.isArray(rawSelected)
        ? rawSelected
        : typeof rawSelected === "string"
          ? [rawSelected]
          : props.selected || [];

      const handleToggle = (itemVal: string) => {
        if (!isInteractive || isSubmitted) return;
        let nextSelected: string[];
        if (multiSelect) {
          nextSelected = currentSelected.includes(itemVal)
            ? currentSelected.filter((x) => x !== itemVal)
            : [...currentSelected, itemVal];
        } else {
          nextSelected = currentSelected.includes(itemVal) ? [] : [itemVal];
        }
        useInteractiveStore
          .getState()
          .setValue(
            scopeId,
            chipName,
            multiSelect ? nextSelected : nextSelected[0] || "",
          );
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
              <Search className="w-3.5 h-3.5 text-muted-2" />
              {props.label}
            </span>
          )}
          {normalizedItems.map((item) => {
            const isSelected = currentSelected.includes(item.value);
            const activeClass = isSelected
              ? "bg-brand text-primary-foreground border-brand shadow-xs font-semibold ring-1 ring-brand/30"
              : tagClass;
            const cursorClass = isInteractive
              ? "cursor-pointer hover:opacity-80 transition-all select-none"
              : isSubmitted
                ? "cursor-default select-none opacity-90"
                : "";

            return (
              <span
                key={item.key}
                onClick={() => handleToggle(item.value)}
                className={`px-2 py-0.5 rounded-none text-[11px] font-medium border shadow-2xs ${cursorClass} ${activeClass}`}
              >
                {item.label}
              </span>
            );
          })}
        </div>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Columns: ({ props }: { props: any }) => {
      const rawCols = Array.isArray(props.columns) ? props.columns : [];
      const count = rawCols.length;
      if (count === 0) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
              rowIdx > 0 ? "border-t border-border-subtle pt-3.5 md:pt-4" : "";
            const rowPaddingBottom =
              rowIdx < rows.length - 1 ? "pb-3.5 md:pb-4" : "";

            return (
              <div
                key={`col-row-${rowIdx}`}
                className={`grid ${gridClass} divide-border-subtle gap-3 md:gap-0 ${rowBorderClass} ${rowPaddingBottom}`}
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
                  const text = col?.text ? String(col.text) : "";

                  return (
                    <div
                      key={`col-${rowIdx}-${colIdx}-${title}`}
                      className="min-w-0 flex flex-col gap-2 px-0 md:px-3 first:pl-0 last:pr-0 py-2.5 md:py-0"
                    >
                      <h4 className="text-[11px] font-bold text-foreground/80 uppercase tracking-wider">
                        {title}
                      </h4>
                      {items.length > 0 && (
                        <ul className="space-y-1.5 text-xs text-foreground/80 leading-relaxed">
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
                      {text && (
                        <p className="text-xs text-foreground/80 leading-relaxed">
                          {text}
                        </p>
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          ? ["var(--chart-4)", "var(--chart-5)", "var(--chart-1)"]
          : props.color === "multi"
            ? ["var(--chart-2)", "var(--chart-4)", "var(--chart-3)", "var(--chart-1)", "var(--chart-5)"]
            : ["var(--chart-2)", "var(--chart-4)", "var(--chart-3)"];

      const yAxisWidth = useMemo(() => {
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
        return Math.max(20, Math.min(54, Math.round(maxChars * 7.5 + 8)));
      }, [data, yKeys]);

      const chartMargin = useMemo(() => {
        const rightMargin = Math.max(14, Math.round(yAxisWidth * 0.85));
        return {
          top: 8,
          right: rightMargin,
          left: 4,
          bottom: 2,
        };
      }, [yAxisWidth]);

      return (
        <div
          className={`w-full flex flex-col items-center justify-center gap-1.5 outline-none focus:outline-none focus-visible:outline-none [&_*]:outline-none ${props.className !== undefined ? props.className : "my-2"}`}
        >
          {props.title && (
            <h4 className="text-[12.5px] font-semibold text-foreground tracking-tight text-center w-full">
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
                    stroke="var(--border-subtle)"
                    vertical={false}
                  />
                  {isHorizontal ? (
                    <>
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: "var(--muted-2)" }}
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
                        tick={{ fontSize: 11, fill: "var(--muted-2)" }}
                      />
                    </>
                  )}
                  <RechartsTooltip content={<CustomChartTooltip />} />
                  {yKeys.map((key: string, idx: number) => (
                    <Bar
                      key={`bar-${idx}-${key}`}
                      dataKey={key}
                      fill={colors[idx % colors.length]}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  ))}
                </RechartsBarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-muted/50 rounded-xl animate-pulse" />
            )}
          </div>
        </div>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    LineChart: ({ props }: { props: any }) => {
      const [mounted, setMounted] = useState(false);
      useEffect(() => {
        setMounted(true);
      }, []);

      const data = props.data || [];
      const xKey = props.xKey || "date";
      const series = props.series || [
        { key: props.yKey || "value", label: "Value", color: "var(--chart-2)" },
      ];
      const height = props.height || 220;

      const yAxisWidth = useMemo(() => {
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
        return Math.max(20, Math.min(54, Math.round(maxChars * 7.5 + 8)));
      }, [data, series, props.yKey]);

      const chartMargin = useMemo(() => {
        const rightMargin = Math.max(14, Math.round(yAxisWidth * 0.85));
        return {
          top: 8,
          right: rightMargin,
          left: 4,
          bottom: 2,
        };
      }, [yAxisWidth]);

      return (
        <div
          className={`w-full flex flex-col items-center justify-center gap-1.5 outline-none focus:outline-none focus-visible:outline-none [&_*]:outline-none ${props.className !== undefined ? props.className : "my-2"}`}
        >
          {props.title && (
            <h4 className="text-[12.5px] font-semibold text-foreground tracking-tight text-center w-full">
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
                    stroke="var(--border-subtle)"
                    vertical={false}
                  />
                  <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis
                    width={yAxisWidth}
                    tick={{ fontSize: 11, fill: "var(--muted-2)" }}
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
                        stroke={s.color || (idx === 0 ? "var(--chart-2)" : "var(--chart-4)")}
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: s.color || "var(--chart-2)" }}
                        activeDot={{ r: 5 }}
                      />
                    ),
                  )}
                </RechartsLineChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-muted/50 rounded-xl animate-pulse" />
            )}
          </div>
        </div>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AreaChart: ({ props }: { props: any }) => {
      const [mounted, setMounted] = useState(false);
      useEffect(() => {
        setMounted(true);
      }, []);

      const data = props.data || [];
      const xKey = props.xKey || "date";
      const series = props.series || [
        { key: props.yKey || "value", label: "Volume", color: "var(--chart-2)" },
      ];
      const height = props.height || 220;

      const yAxisWidth = useMemo(() => {
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
        return Math.max(20, Math.min(54, Math.round(maxChars * 7.5 + 8)));
      }, [data, series, props.yKey]);

      const chartMargin = useMemo(() => {
        const rightMargin = Math.max(14, Math.round(yAxisWidth * 0.85));
        return {
          top: 8,
          right: rightMargin,
          left: 4,
          bottom: 2,
        };
      }, [yAxisWidth]);

      return (
        <div
          className={`w-full flex flex-col items-center justify-center gap-1.5 outline-none focus:outline-none focus-visible:outline-none [&_*]:outline-none ${props.className !== undefined ? props.className : "my-2"}`}
        >
          {props.title && (
            <h4 className="text-[12.5px] font-semibold text-foreground tracking-tight text-center w-full">
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
                  <defs>
                    {series.map(
                      (s: { key: string; color?: string }, idx: number) => {
                        const color =
                          s.color || (idx === 0 ? "var(--chart-2)" : "var(--chart-4)");
                        const safeKey = s.key || `area-${idx}`;
                        return (
                          <linearGradient
                            key={`grad-${idx}-${safeKey}`}
                            id={`gradient-${safeKey}`}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor={color}
                              stopOpacity={0.25}
                            />
                            <stop
                              offset="95%"
                              stopColor={color}
                              stopOpacity={0.0}
                            />
                          </linearGradient>
                        );
                      },
                    )}
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border-subtle)"
                    vertical={false}
                  />
                  <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis
                    width={yAxisWidth}
                    tick={{ fontSize: 11, fill: "var(--muted-2)" }}
                  />
                  <RechartsTooltip content={<CustomChartTooltip />} />
                  {series.map(
                    (
                      s: { key: string; label?: string; color?: string },
                      idx: number,
                    ) => {
                      const color =
                        s.color || (idx === 0 ? "var(--chart-2)" : "var(--chart-4)");
                      const safeKey = s.key || `area-${idx}`;
                      return (
                        <Area
                          key={safeKey}
                          type="monotone"
                          dataKey={s.key}
                          name={s.label || s.key}
                          stroke={color}
                          strokeWidth={2}
                          fillOpacity={1}
                          fill={`url(#gradient-${safeKey})`}
                        />
                      );
                    },
                  )}
                </RechartsAreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-muted/50 rounded-xl animate-pulse" />
            )}
          </div>
        </div>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    PieChart: ({ props }: { props: any }) => {
      const [mounted, setMounted] = useState(false);
      useEffect(() => {
        setMounted(true);
      }, []);

      const data = props.data || [];
      const height = props.height || 220;
      const isDonut = props.donut ?? true;
      const colors = [
        "var(--chart-2)",
        "var(--chart-4)",
        "var(--chart-3)",
        "var(--chart-5)",
        "var(--chart-1)",
        "var(--chart-5)",
      ];

      return (
        <div
          className={`w-full flex flex-col items-center justify-center gap-1.5 outline-none focus:outline-none focus-visible:outline-none [&_*]:outline-none ${props.className !== undefined ? props.className : "my-2"}`}
        >
          {props.title && (
            <h4 className="text-[12.5px] font-semibold text-foreground tracking-tight text-center w-full">
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
                        fill={entry.color || colors[index % colors.length]}
                      />
                    ))}
                  </Pie>
                </RechartsPieChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-muted/50 rounded-xl animate-pulse" />
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
                    backgroundColor: item.color || colors[idx % colors.length],
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    RadarChart: ({ props }: { props: any }) => {
      const [mounted, setMounted] = useState(false);
      useEffect(() => {
        setMounted(true);
      }, []);

      const data = props.data || [];
      const keys = props.keys || [];
      const dimKey = props.dimensionKey || "subject";
      const height = props.height || 240;
      const colors = ["var(--chart-2)", "var(--chart-4)", "var(--chart-3)"];

      return (
        <div
          className={`w-full flex flex-col items-center justify-center gap-1.5 outline-none focus:outline-none focus-visible:outline-none [&_*]:outline-none ${props.className !== undefined ? props.className : "my-2"}`}
        >
          {props.title && (
            <h4 className="text-[12.5px] font-semibold text-foreground tracking-tight text-center w-full">
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
                    tick={{ fontSize: 9, fill: "var(--muted-2)" }}
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
                        stroke={k.color || colors[idx % colors.length]}
                        fill={k.color || colors[idx % colors.length]}
                        fillOpacity={0.25}
                      />
                    ),
                  )}
                  <RechartsTooltip content={<CustomChartTooltip />} />
                </RechartsRadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-muted/50 rounded-xl animate-pulse" />
            )}
          </div>
        </div>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Metric: ({ props }: { props: any }) => {
      const isUp = props.trend === "up";
      const isDown = props.trend === "down";

      const cleanClassName = (props.className || "")
        .replace(
          /\b([pP][xytblr]?-\d+(\.\d+)?|sm:[pP][xytblr]?-\d+(\.\d+)?|[mM][xytblr]?-\d+(\.\d+)?|space-[xy]-\d+(\.\d+)?|gap-\d+(\.\d+)?)\b/g,
          "",
        )
        .trim();

      return (
        <div
          className={`rounded-2xl border border-border bg-card shadow-2xs p-3 sm:p-3.5 flex flex-col justify-between gap-1.5 transition-all ${cleanClassName}`}
        >
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">
            {props.label}
          </span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {props.value}
            </span>
            {props.change && (
              <span
                className={`shrink-0 inline-flex items-center text-[10.5px] font-semibold px-1.5 py-0.5 rounded-none leading-tight ${
                  isUp
                    ? "bg-success-tint text-success"
                    : isDown
                      ? "bg-warning-tint text-warning"
                      : "bg-muted text-foreground/80"
                }`}
              >
                {props.change}
              </span>
            )}
          </div>
        </div>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      const variantBg =
        props.variant === "amber"
          ? "bg-brand-accent hover:bg-brand-accent-hover text-brand-surface"
          : props.variant === "neutral"
            ? "bg-foreground hover:bg-foreground/90 text-primary-foreground"
            : "bg-brand hover:bg-brand-hover text-primary-foreground";

      if (isSubmitted) {
        return null;
      }

      return (
        <div className="w-full flex flex-wrap items-center justify-between gap-3 -mt-0.5 pt-2.5 border-t border-border-subtle">
          {props.statusText ? (
            <span className="min-w-0 truncate inline-flex items-center gap-1.5 text-sm text-muted-foreground font-medium">
              <Check className="w-4 h-4 text-brand shrink-0" /> {props.statusText}
            </span>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isSubmitting || props.disabled || isSubmitted}
              onClick={handleSubmit}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${variantBg}`}
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
