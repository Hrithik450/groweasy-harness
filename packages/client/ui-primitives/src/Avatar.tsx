/**
 * Avatar atom: an image when `src` is present, otherwise initials.
 *
 * The reference harness has no standalone Avatar in its primitives package
 * (its account settings screen renders a local avatar), so this component is
 * authored against our token sheet rather than ported.
 */
import { cn } from "./class-names";

/** Avatar size. */
export type AvatarSize = "sm" | "md" | "lg";

export interface AvatarProps {
  /** Image source; when absent the fallback initials render. */
  src?: string | undefined;
  /** Accessible name; also the initials source when no image is supplied. */
  name?: string | undefined;
  /** Image alternative text; defaults to `name`. */
  alt?: string | undefined;
  /** Size preset. */
  size?: AvatarSize;
  /** Extra classes for the square frame. */
  className?: string | undefined;
}

const SIZES: Record<AvatarSize, string> = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const initials = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return initials === "" ? "?" : initials;
}

/**
 * Render an avatar.
 * @param props.src - image source.
 * @param props.name - accessible name and initials source.
 * @param props.alt - image alternative text.
 * @param props.size - size preset.
 * @param props.className - extra frame classes.
 * @returns the square avatar frame.
 */
export function Avatar({
  src,
  name,
  alt,
  size = "md",
  className,
}: AvatarProps) {
  const label = alt ?? name ?? "Avatar";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden",
        "border border-border bg-muted font-medium text-muted-foreground",
        SIZES[size],
        className,
      )}
      role={src === undefined ? "img" : undefined}
      aria-label={src === undefined ? label : undefined}
    >
      {src === undefined ? (
        <span aria-hidden="true">{initialsOf(name ?? "")}</span>
      ) : (
        <img
          src={src}
          alt={label}
          className="h-full w-full object-cover"
          draggable={false}
        />
      )}
    </span>
  );
}
