/**
 * Centered, body-portaled modal.
 *
 * Behavioral port of the reference primitive: Escape closes, the mask closes,
 * the dialog traps initial focus, and return focus is restored. Shortcut
 * scopes, nested-layer bookkeeping, and the icon package are intentionally
 * absent — this foundation has no shortcut registry yet.
 */
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEventHandler,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "./class-names";

interface ModalBaseProps {
  /** Whether the dialog is showing. */
  open: boolean;
  /** Application close command, Escape, or mask click. */
  onClose: () => void;
  /** Dialog heading; also the accessible name. */
  title: string;
  /** Optional supporting sentence under the title. */
  description?: string;
  /** Dialog body; mark its initial-focus control with data-modal-autofocus. */
  children?: ReactNode;
  /** Action row (Cancel / Create). */
  footer?: ReactNode;
  /** Extra classes for the dialog card. */
  className?: string;
  /** Extra classes for the scrollable content region. */
  contentClassName?: string;
  /** Handle a nested dialog's keys before the document Escape listener. */
  onKeyDownCapture?: KeyboardEventHandler<HTMLDivElement>;
  /** Render children directly in the card (no default header/close/body chrome). */
  headless?: boolean;
  /** Accessible close-button label (required unless headless). */
  closeLabel?: string;
}

export type ModalProps = ModalBaseProps &
  (
    | { headless: true; closeLabel?: never }
    | { headless?: false; closeLabel: string }
  );

/**
 * Render a centered, body-portaled modal over a blurred page mask.
 * @param props - see {@link ModalBaseProps}.
 * @returns null when closed; otherwise the overlay tree.
 */
export function Modal({
  open,
  onClose,
  title,
  closeLabel,
  description,
  children,
  footer,
  className,
  contentClassName,
  onKeyDownCapture,
  headless = false,
}: ModalProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const target =
      dialog.current?.querySelector<HTMLElement>("[data-modal-autofocus]") ??
      dialog.current;
    target?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onKeyDownCapture={onKeyDownCapture}
    >
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={dialog}
        tabIndex={-1}
        className={cn(
          "relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col",
          "border border-border bg-card text-card-foreground outline-none",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {headless ? (
          children
        ) : (
          <>
            <div className={cn("flex-1 overflow-y-auto p-5", contentClassName)}>
              <div className="flex items-start justify-between gap-4">
                <h2 id={titleId} className="font-heading text-lg font-semibold">
                  {title}
                </h2>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  aria-label={closeLabel}
                  onClick={onClose}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              {description !== undefined && description !== "" && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {description}
                </p>
              )}
              {children !== undefined && <div className="mt-4">{children}</div>}
            </div>
            {footer !== undefined && (
              <div className="flex items-center justify-end gap-2 border-t border-border p-4">
                {footer}
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
