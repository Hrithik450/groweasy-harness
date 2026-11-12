import { Container } from "./container";
import {
  SectionCopy,
  SectionParagraph,
  featureSectionClass,
  splitClass,
} from "./ui";

const chips = [
  "Multiply winner",
  "Reuse ad type",
  "Increase budget",
  "Optimise copy",
  "Refresh creatives",
  "Redo audience",
  "Stop ads",
  "Stop campaign",
  "Multiply to other products",
  "Run at peak hours",
  "Retarget",
  "Shift budget",
];

function Action({
  title,
  meta,
  cta,
}: {
  title: string;
  meta: string;
  cta: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 bg-[#FBF9F3] px-5 py-4 [font-family:var(--font-jetbrains-mono)] text-[14px] leading-normal max-[1100px]:text-[13px] max-[600px]:flex-col max-[600px]:items-start max-[600px]:gap-2.5 max-[600px]:px-4 max-[600px]:py-3.5">
      <span className="flex min-w-0 flex-col gap-0.5">
        <b className="break-words">{title}</b>
        <span className="break-words text-[#6B6657]">{meta}</span>
      </span>
      <span className="inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap bg-[#0E0E0E] px-3.5 py-2.5 font-bold text-[#F3EFE4] max-[600px]:self-start">
        {cta}
      </span>
    </div>
  );
}

export function IncreaseRoasSection() {
  return (
    <section aria-labelledby="c3" className={featureSectionClass}>
      <Container className={splitClass}>
        <SectionCopy id="c3" num="03" title="Increase ROAS">
          <SectionParagraph>
            Twelve moves. Each one arrives with a ₹/week number computed from
            your own account, a confidence word, and an Undo. Budget steps are
            capped at +20% per 72 hours so learning never resets. Every applied
            move is re-measured at 48 hours and 7 days. The tally shows the
            misses too, because a tally that doesn&apos;t is marketing.
          </SectionParagraph>
          <div className="flex flex-wrap gap-2 [font-family:var(--font-jetbrains-mono)] text-[13px] leading-[1.4] max-[600px]:gap-1.5 max-[600px]:text-[12px]">
            {chips.map((chip) => (
              <span
                key={chip}
                className="break-words border-[1.5px] border-[#0E0E0E] px-2.5 py-1.5 max-[600px]:px-2 max-[600px]:py-[5px]"
              >
                {chip}
              </span>
            ))}
          </div>
        </SectionCopy>

        <div className="flex min-w-0 flex-col gap-0.5 border-2 border-[#0E0E0E] bg-[#0E0E0E]">
          <div className="flex min-w-0 flex-col gap-1.5 bg-[#FF4D1C] p-6 text-[#0E0E0E] max-[600px]:p-[18px]">
            <span className="break-words [font-family:var(--font-jetbrains-mono)] text-[12px] font-bold leading-normal">
              RETURN ON AI · 28 DAYS · EXAMPLE
            </span>
            <span className="break-words [font-family:var(--font-syne)] text-[clamp(48px,7vw,96px)] font-extrabold leading-[0.9] tracking-[-0.05em]">
              2.3 → 3.1
            </span>
            <span className="break-words [font-family:var(--font-jetbrains-mono)] text-[13px] leading-[1.6] max-[600px]:text-[12px]">
              ROAS · ₹1,84,000 saved · 3 winners multiplied · 11 applied · 2
              undone · 1 missed
            </span>
          </div>

          <Action
            title="Shift ₹5,000/day · broad → Mumbai + Pune"
            meta="+₹95,000 rev/wk · CPA ₹610 → ₹520 · Likely"
            cta="Apply"
          />
          <Action
            title="Redo audience · exclude 18–24"
            meta="17% of spend at 2.6× CPA · +₹4,100/wk · Probable"
            cta="Apply"
          />
          <Action
            title="Multiply winner · UGC_unboxing_v3 · 4 variants"
            meta="protects ~₹2.1L/wk · chance of ₹380 CPA · Probable"
            cta="Approve"
          />
        </div>
      </Container>
    </section>
  );
}
