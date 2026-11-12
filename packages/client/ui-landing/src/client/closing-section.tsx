import { Container } from "./container";
import { LandingButton } from "./ui";

export function ClosingSection() {
  return (
    <section id="start">
      <Container className="flex flex-col items-start gap-8 pt-[clamp(56px,10vw,120px)] pb-[clamp(56px,8vw,96px)] max-[600px]:gap-[26px]">
        <span className="[font-family:var(--font-syne)] text-[clamp(120px,26vw,360px)] font-extrabold leading-[0.8] tracking-[-0.08em] text-[#FF4D1C]">
          1
        </span>
        <h2 className="m-0 max-w-[1000px] break-words [font-family:var(--font-syne)] text-[clamp(36px,5vw,72px)] font-extrabold leading-[0.95] tracking-[-0.045em] [text-wrap:balance]">
          Your best ad is already running. Uno names it by 9 am tomorrow.
        </h2>
        <p className="m-0 max-w-[620px] break-words text-[clamp(17px,2vw,19px)] leading-normal text-[#3A372F]">
          Connect your ad account tonight. Wake up to your winners, the ads
          wasting money, and what your competitors launched overnight.
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-3 max-[600px]:w-full max-[600px]:flex-col max-[600px]:items-stretch">
          <LandingButton href="/c" variant="dark">
            Start now
          </LandingButton>
          <span className="break-words [font-family:var(--font-jetbrains-mono)] text-[13px] leading-[1.6] text-[#6B6657] max-[600px]:text-[12px]">
            read-only · 2 min · [PRICING / TRIAL LINE] · agencies:
            [MULTI-ACCOUNT LINE]
          </span>
        </div>
      </Container>
    </section>
  );
}
