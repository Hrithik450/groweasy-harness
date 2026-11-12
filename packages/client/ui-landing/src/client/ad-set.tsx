import { Container } from "./container";

function AdTile({
  name,
  value,
  stopped = false,
  prominent = false,
}: {
  name: string;
  value: string;
  stopped?: boolean;
  prominent?: boolean;
}) {
  return (
    <div className="flex h-full min-h-[150px] min-w-0 flex-col justify-between gap-2 bg-[#E9E4D6] p-3 [font-family:var(--font-jetbrains-mono)] text-[12px] leading-[1.4] text-[#6B6657] max-[600px]:min-h-[148px] max-[600px]:p-2.5 max-[600px]:text-[11.5px] max-[400px]:text-[11px]">
      <span className={`break-words${stopped ? " line-through" : ""}`}>
        {name}
      </span>
      <span
        className={
          prominent ? "break-words text-[#0E0E0E]" : "break-words"
        }
      >
        {value}
      </span>
    </div>
  );
}

function WinningTile() {
  return (
    <div className="flex h-full min-h-[150px] min-w-0 flex-col justify-between gap-2 bg-[#FF4D1C] p-3 [font-family:var(--font-jetbrains-mono)] text-[12px] leading-[1.4] text-[#0E0E0E] max-[600px]:min-h-[148px] max-[600px]:p-2.5 max-[600px]:text-[11.5px] max-[400px]:text-[11px]">
      <span className="break-words font-bold">UGC_unboxing_v3</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="[font-family:var(--font-syne)] text-[40px] font-extrabold leading-none tracking-[-0.04em]">
          1
        </span>
        <span className="font-bold">PROVEN · DAY 4</span>
        <span className="break-words">46% imp · CPA ₹412</span>
      </span>
    </div>
  );
}

export function AdSet() {
  return (
    <section id="one" aria-label="Ten ads, one winner">
      <Container className="flex flex-col gap-4 pt-6 pb-[clamp(40px,6vw,64px)] max-[600px]:pt-5 max-[600px]:pb-10">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2 [font-family:var(--font-jetbrains-mono)] text-[13px] leading-normal text-[#6B6657] max-[600px]:text-[11px] max-[600px]:leading-[1.6]">
          <span>AD SET · &quot;launch_oct&quot; · 10 ADS · 7 DAYS</span>
          <span>EXAMPLE DATA</span>
        </div>

        <div className="grid min-w-0 auto-rows-[1fr] grid-cols-5 gap-0.5 border-2 border-[#0E0E0E] bg-[#0E0E0E] max-[740px]:grid-cols-2">
          <AdTile name="static_shelf_v1" value="₹2,100 · 0" stopped />
          <AdTile name="carousel_sku_v2" value="₹1,650 · 1" stopped />
          <AdTile name="founder_30s" value="₹3,200 · 3" stopped />
          <WinningTile />
          <AdTile name="static_price_v1" value="₹980 · 1" stopped />
          <AdTile name="lastchance_9x16" value="₹2,400 · 2" stopped />
          <AdTile name="broll_vo_hindi" value="₹1,100 · 1" stopped />
          <AdTile name="static_shelf_v2" value="₹760 · 0" stopped />
          <AdTile name="testimonial_1x1" value="₹1,300 · 2" stopped />
          <AdTile name="offer_emi_v1" value="UNTESTED · 4% imp" prominent />
        </div>

        <p className="m-0 max-w-[820px] break-words text-[clamp(16px,1.8vw,17px)] leading-normal text-[#3A372F] max-[600px]:text-[16px]">
          Meta moved 46% of this ad set&apos;s impressions to one ad by day two.
          Uno saw the vote, confirmed hook rate and CTR on day three, confirmed
          CPA at 82% confidence on day four, and had four variants drafted
          before the weekly report would have mentioned it. The grey ones are
          stopped, redeployed or rewritten. The last one isn&apos;t a loser:
          Meta never served it. It gets its own test.
        </p>
      </Container>
    </section>
  );
}
