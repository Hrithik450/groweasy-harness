import type { ReactNode } from "react";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const featureSectionClass =
  "border-b-2 border-foreground py-[clamp(48px,8vw,96px)]";

export const splitClass =
  "grid grid-cols-2 items-center gap-x-16 gap-y-10 max-[980px]:grid-cols-1 max-[980px]:gap-y-7";

export function LandingButton({
  href,
  variant,
  className,
  children,
}: {
  href: string;
  variant: "primary" | "outline" | "dark" | "nav";
  className?: string;
  children: ReactNode;
}) {
  const variantClass =
    variant === "primary"
      ? "min-h-14 bg-accent px-7 text-foreground hover:text-foreground max-[600px]:px-5 max-[600px]:text-[17px]"
      : variant === "outline"
        ? "min-h-14 border-2 border-foreground px-6 text-foreground hover:text-accent max-[600px]:px-5 max-[600px]:text-[17px]"
        : variant === "nav"
          ? "min-h-11 whitespace-nowrap bg-primary px-[18px] text-background hover:text-accent max-[600px]:px-3.5 max-[600px]:text-[14px]"
          : "min-h-[60px] bg-primary px-8 text-[19px] text-background hover:text-accent max-[600px]:min-h-14 max-[600px]:w-full max-[600px]:px-5 max-[600px]:text-[18px]";

  return (
    <a
      href={href}
      className={cn(
        "inline-flex items-center justify-center text-center font-bold leading-tight",
        variantClass,
        className,
      )}
    >
      {children}
    </a>
  );
}

export function Eyebrow({
  children,
  variant = "muted",
  className,
}: {
  children: ReactNode;
  variant?: "muted" | "accent";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "[font-family:var(--font-jetbrains-mono)] text-[13px] leading-[1.6] max-[600px]:text-[12px]",
        variant === "accent" ? "text-accent" : "text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SectionCopy({
  id,
  num,
  title,
  children,
}: {
  id: string;
  num: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <span className="[font-family:var(--font-jetbrains-mono)] text-[13px] leading-[1.4] text-accent">
        {num}
      </span>
      <h2
        id={id}
        className="m-0 break-words [font-family:var(--font-syne)] text-[clamp(40px,6vw,88px)] font-extrabold leading-[0.95] tracking-[-0.045em] [text-wrap:balance]"
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

export function SectionParagraph({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 max-w-[520px] break-words text-[clamp(17px,2vw,19px)] leading-normal max-[600px]:text-[17px]">
      {children}
    </p>
  );
}

export function MockPanel({
  dark = false,
  className,
  children,
}: {
  dark?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-w-0 break-words border-2 border-foreground [font-family:var(--font-jetbrains-mono)] text-[14px] leading-[1.7] max-[1100px]:text-[13px] max-[1100px]:leading-[1.6] max-[400px]:text-[12.5px]",
        dark ? "bg-primary text-background" : "bg-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MockHead({
  title,
  dark = false,
}: {
  title: ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3 max-[600px]:px-3 max-[600px]:py-2.5",
        dark
          ? "border-b border-info"
          : "border-b-2 border-foreground",
      )}
    >
      <span>{title}</span>
      <span
        className={cn(
          "whitespace-nowrap",
          dark ? "text-muted-2" : "text-muted-foreground",
        )}
      >
        example
      </span>
    </div>
  );
}

export function MockRow({
  children,
  value,
  dark = false,
  stack = false,
  wrapOnMobile = false,
  bold = false,
  plainValue = false,
}: {
  children: ReactNode;
  value?: ReactNode;
  dark?: boolean;
  stack?: boolean;
  wrapOnMobile?: boolean;
  bold?: boolean;
  plainValue?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 gap-3 border-b px-4 py-3 last:border-b-0 max-[600px]:px-3 max-[600px]:py-2.5",
        dark ? "border-info" : "border-border",
        stack ? "flex-col" : "justify-between",
        wrapOnMobile &&
          "max-[600px]:flex-col max-[600px]:items-start max-[600px]:gap-1",
        bold && "font-bold",
      )}
    >
      {value !== undefined ? (
        <>
          <span className="min-w-0">{children}</span>
          <span
            className={cn(
              "shrink-0 whitespace-nowrap",
              plainValue ? "text-inherit" : "text-accent",
              wrapOnMobile && "max-[600px]:whitespace-normal",
            )}
          >
            {value}
          </span>
        </>
      ) : (
        children
      )}
    </div>
  );
}

export function MockSub({
  children,
  dark = false,
}: {
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <span
      className={cn(
        "block break-words",
        dark ? "text-muted-2" : "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
