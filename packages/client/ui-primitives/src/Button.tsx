/**
 * Button atom. Variants map to this repository's semantic tokens; the
 * generated sheet sets every radius/shadow token to zero, so the control is
 * square by construction.
 */
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "./class-names";

/** Visual variant, each backed by semantic token utilities. */
export type ButtonVariant = "primary" | "ghost" | "outline";

/** Control size. */
export type ButtonSize = "md" | "sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-brand-hover",
  ghost: "bg-transparent text-foreground hover:bg-muted",
  outline: "border border-border bg-transparent text-foreground hover:bg-muted",
};

const SIZES: Record<ButtonSize, string> = {
  md: "h-9 px-4 text-sm",
  sm: "h-7 px-3 text-xs",
};

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string | undefined;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * Render a button.
 * @param props.variant - visual family (default 'ghost').
 * @param props.size - 'md' 36px control or 'sm' 28px control.
 * @param props.icon - optional leading icon node.
 * @param ref - native button for focus management and overlay anchors.
 * @returns the button element; native button attributes pass through.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "ghost", size = "md", icon, className, children, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "inline-flex select-none items-center justify-center gap-2 font-medium",
          "transition-colors disabled:pointer-events-none disabled:opacity-50",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...rest}
      >
        {icon != null && <span className="inline-flex shrink-0">{icon}</span>}
        {children}
      </button>
    );
  },
);
