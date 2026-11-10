/**
 * Transient top-center banner.
 *
 * Behavioral port of the reference primitive: slide/hold/fade lifecycle,
 * body portal, optional anchor-centered placement, success glyph, and inline
 * actions. Styling uses this repository's Tailwind tokens rather than the
 * reference stylesheet.
 */
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "./class-names";

/** Full-opacity hold before the fade starts, when the owner names none. */
const HOLD_MS = 3000;
/** Fade duration. Must agree with the transition class below. */
const FADE_MS = 1000;

/** One inline continuation action. */
export interface ToastAction {
  /** Clickable text. */
  label: string;
  /** Connective text rendered before the label (e.g. "or"). */
  prefix?: string;
  /** Owner handler; unmounting is still the owner's responsibility. */
  onClick: () => void;
}

export interface ToastProps {
  /** Resolved banner copy; the owner passes localized text. */
  text: string;
  /** Optional leading glyph; ignored under `tone="success"`. */
  icon?: ReactNode;
  /** 'success' renders a circled check instead of `icon`. */
  tone?: "success";
  /** Optional element whose horizontal center the banner follows. */
  anchor?: HTMLElement | null;
  /** Full-opacity hold before the fade; defaults to 3000ms. */
  holdMs?: number;
  /** Optional inline actions continuing the sentence. */
  actions?: readonly ToastAction[];
  /** Called once the fade completes; unmount the toast here. */
  onDone: () => void;
}

/**
 * Render a floating banner.
 * @param props - see {@link ToastProps}.
 * @returns the portaled banner.
 */
export function Toast({
  text,
  icon,
  tone,
  anchor,
  holdMs = HOLD_MS,
  actions,
  onDone,
}: ToastProps) {
  const latestOnDone = useRef(onDone);
  useLayoutEffect(() => {
    latestOnDone.current = onDone;
  }, [onDone]);

  const [fading, setFading] = useState(false);
  useEffect(() => {
    setFading(false);
    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, holdMs);
    const doneTimer = setTimeout(() => {
      latestOnDone.current();
    }, holdMs + FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [holdMs]);

  // Anchor-centered placement re-measures on window resizes; the banner lives
  // a few seconds, so sub-window layout drift within that span stays out of
  // scope.
  const [left, setLeft] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (anchor == null) {
      setLeft(null);
      return;
    }
    const measure = (): void => {
      const rect = anchor.getBoundingClientRect();
      setLeft(rect.left + rect.width / 2);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
    };
  }, [anchor]);

  return createPortal(
    <div
      className={cn(
        "fixed top-4 z-[60] flex max-w-[min(32rem,calc(100vw-2rem))] items-start gap-2",
        "border border-border bg-card px-4 py-3 text-sm text-card-foreground",
        "shadow-none transition-opacity duration-1000 ease-out",
        fading ? "opacity-0" : "opacity-100",
        left === null && "left-1/2 -translate-x-1/2",
      )}
      role="alert"
      style={
        {
          ...(left === null ? {} : { left, transform: "translateX(-50%)" }),
          "--toast-hold": `${String(holdMs)}ms`,
        } as CSSProperties
      }
    >
      {tone === "success" ? (
        <span className="text-success" aria-hidden="true">
          &#10003;
        </span>
      ) : (
        icon !== undefined && (
          <span className="shrink-0" aria-hidden="true">
            {icon}
          </span>
        )
      )}
      <span>
        {text}
        {actions?.map((action) => (
          <Fragment key={action.label}>
            {action.prefix}
            <button
              type="button"
              className="text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          </Fragment>
        ))}
      </span>
    </div>,
    document.body,
  );
}
