import type { ReactNode } from "react";
import { Container } from "./container";
import { Eyebrow } from "./ui";

function Chip({
  children,
  active = false,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={
        active
          ? "whitespace-nowrap bg-accent px-2 py-[5px] font-bold text-foreground"
          : "whitespace-nowrap border border-muted-foreground px-2 py-[5px]"
      }
    >
      {children}
    </span>
  );
}

function Handoff({ children }: { children: ReactNode }) {
  return (
    <span className="self-start border border-dashed border-muted-2 px-2.5 py-1.5 [font-family:var(--font-jetbrains-mono)] text-[12px] leading-[1.4] text-border-strong">
      {children}
    </span>
  );
}

function Agent({
  num,
  name,
  role,
  time,
  children,
  chips,
}: {
  num: string;
  name: string;
  role: string;
  time: string;
  children: ReactNode;
  chips: ReactNode;
}) {
  return (
    <article className="flex min-w-0 flex-col bg-primary">
      <div className="flex items-end justify-between gap-2.5 border-b border-info px-[18px] pb-3 pt-4 max-[600px]:px-4 max-[600px]:pb-2.5 max-[600px]:pt-3.5 max-[400px]:gap-1.5">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="[font-family:var(--font-syne)] text-[40px] font-extrabold leading-[0.9] tracking-[-0.05em] text-accent max-[600px]:text-[36px] max-[400px]:text-[32px]">
            {num}
          </span>
          <span className="[font-family:var(--font-syne)] text-[22px] font-bold leading-none tracking-[-0.03em] max-[400px]:text-[20px]">
            {name}
            <span className="mt-[3px] block [font-family:var(--font-jetbrains-mono)] text-[11px] font-normal leading-[1.4] tracking-normal text-muted-2">
              {role}
            </span>
          </span>
        </div>
        <span className="shrink-0 [font-family:var(--font-jetbrains-mono)] text-[11px] leading-[1.4] text-muted-2">
          {time}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 px-[18px] py-4 max-[600px]:px-4 max-[600px]:py-3.5">
        {children}
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-info px-[18px] pb-4 pt-3 [font-family:var(--font-jetbrains-mono)] text-[11px] leading-[1.4] max-[600px]:px-4 max-[600px]:pb-3.5 max-[600px]:pt-2.5">
        {chips}
      </div>
    </article>
  );
}

export function TeamSection() {
  return (
    <section
      id="team"
      className="bg-primary py-[clamp(48px,8vw,96px)] text-background"
    >
      <Container className="flex flex-col gap-[clamp(28px,4vw,40px)]">
        <div className="flex flex-wrap items-end justify-between gap-6 max-[600px]:gap-3">
          <div className="flex max-w-[760px] min-w-0 flex-col gap-4">
            <Eyebrow tone="accent">YOUR AI AD TEAM</Eyebrow>
            <h2 className="m-0 break-words [font-family:var(--font-syne)] text-[clamp(36px,5vw,72px)] font-extrabold leading-[0.95] tracking-[-0.045em] [text-wrap:balance]">
              Three agents. One screen. They talk to each other.
            </h2>
            <p className="m-0 max-w-[640px] text-[clamp(17px,2vw,19px)] leading-normal text-border-strong">
              A manager, a creator and a strategist, each with its own chat,
              side by side. When one finds something, it hands it to the next.
              You see every handoff and approve what matters.
            </p>
          </div>
          <span className="[font-family:var(--font-jetbrains-mono)] text-[12px] leading-normal text-muted-2 max-[600px]:text-[11px]">
            EXAMPLE · ONE MORNING
          </span>
        </div>

        <div className="grid min-w-0 grid-cols-3 gap-0.5 border-2 border-info bg-info max-[980px]:grid-cols-1">
          <Agent
            num="03"
            name="Strategist"
            role="WATCHES THE MARKET"
            time="06:04"
            chips={
              <>
                <Chip>Research competitor</Chip>
                <Chip>New brief</Chip>
                <Chip>Weekly report</Chip>
              </>
            }
          >
            <span className="break-words text-[16px] leading-normal max-[600px]:text-[15px]">
              A competitor&apos;s freshness video has run 34 days at #2 by
              impressions. We have no freshness ad.
            </span>
            <Handoff>↳ TO CREATOR · 2 ideas</Handoff>
          </Agent>

          <Agent
            num="02"
            name="Creator"
            role="MAKES YOUR ADS"
            time="06:52"
            chips={
              <>
                <Chip>Variants of winner</Chip>
                <Chip>Image → video</Chip>
                <Chip>Remix competitor</Chip>
              </>
            }
          >
            <span className="break-words text-[16px] leading-normal max-[600px]:text-[15px]">
              4 versions of your winning video, one change each: two new hooks,
              a new visual, and a static.
            </span>
            <div className="grid min-w-0 grid-cols-4 gap-0.5 bg-info [font-family:var(--font-jetbrains-mono)] text-[10px] leading-[1.2]">
              <span className="flex aspect-[9/14] min-w-0 items-end break-words bg-accent p-1.5 font-bold text-foreground">
                HOOK A
              </span>
              <span className="flex aspect-[9/14] min-w-0 items-end break-words bg-brand-hover p-1.5 font-bold">
                HOOK B
              </span>
              <span className="flex aspect-[9/14] min-w-0 items-end break-words bg-info p-1.5 font-bold">
                VISUAL
              </span>
              <span className="flex aspect-[9/14] min-w-0 items-end break-words bg-secondary p-1.5 font-bold text-foreground">
                STATIC
              </span>
            </div>
            <Handoff>↳ TO MANAGER · awaiting your approval</Handoff>
          </Agent>

          <Agent
            num="01"
            name="Manager"
            role="RUNS YOUR ADS"
            time="07:00"
            chips={
              <>
                <Chip active>Edit campaign</Chip>
                <Chip>New campaign</Chip>
                <Chip>Stop losers</Chip>
              </>
            }
          >
            <span className="break-words text-[16px] leading-normal max-[600px]:text-[15px]">
              Approve the 4 versions, stop 2 losers, and move their budget to
              the winner?
            </span>
            <div className="min-w-0 border border-info [font-family:var(--font-jetbrains-mono)] text-[12px] leading-normal max-[600px]:text-[11.5px]">
              <div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 border-b border-info px-2.5 py-2">
                <span>3 changes · Diwali gift box</span>
                <span className="shrink-0 text-accent">≈ ₹4,700/wk</span>
              </div>
              <div className="flex flex-wrap gap-1.5 px-2.5 py-2">
                <span className="bg-accent px-2.5 py-1.5 font-bold text-foreground">
                  Apply 3 changes
                </span>
                <span className="border border-muted-foreground px-2.5 py-1.5">
                  Edit
                </span>
              </div>
            </div>
          </Agent>
        </div>

        <div className="grid grid-cols-2 gap-x-12 gap-y-8 border-t border-info pt-6 max-[820px]:grid-cols-1 max-[820px]:gap-y-6">
          <div className="flex min-w-0 flex-col gap-2">
            <Eyebrow tone="accent">APP INSTALLS</Eyebrow>
            <b className="text-[clamp(19px,2.4vw,22px)] leading-[1.3] max-[400px]:text-[18px]">
              Cheaper installs, ad by ad.
            </b>
            <span className="break-words text-border-strong">
              Finds the creatives Meta is pushing, cuts the placements, devices
              and hours wasting spend, and multiplies the winners for your other
              features before they tire.
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Eyebrow tone="accent">D2C · WEBSITE SALES</Eyebrow>
            <b className="text-[clamp(19px,2.4vw,22px)] leading-[1.3] max-[400px]:text-[18px]">
              More revenue per rupee.
            </b>
            <span className="break-words text-border-strong">
              ROAS by ad, product, region and hour. Stops what doesn&apos;t
              sell, scales what does, and takes your winning ad to your other
              products.
            </span>
          </div>
        </div>
      </Container>
    </section>
  );
}
