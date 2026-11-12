import { Container } from "./container";
import { Eyebrow, LandingButton } from "./ui";

export function Hero() {
  return (
    <section id="top">
      <Container className="flex flex-col gap-[clamp(28px,4vw,40px)] pt-[clamp(40px,7vw,64px)] pb-[clamp(28px,4vw,40px)] max-[600px]:gap-7 max-[600px]:pt-9 max-[600px]:pb-7">
        <div className="flex min-w-0 flex-col gap-5">
          <Eyebrow>FOR PERFORMANCE MARKETERS ON META · APP INSTALLS · D2C</Eyebrow>
          <h1 className="m-0 max-w-[1400px] break-words [font-family:var(--font-syne)] text-[clamp(54px,11vw,168px)] font-extrabold leading-[0.92] tracking-[-0.05em] [text-wrap:balance] max-[355px]:text-[48px]">
            AI that finds <span className="text-[#FF4D1C]">winning</span> ads.
          </h1>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6 max-[980px]:flex-col max-[980px]:items-stretch max-[980px]:gap-y-6 max-[600px]:gap-y-5">
          <p className="m-0 min-w-0 max-w-[560px] flex-[1_1_420px] text-[clamp(18px,2vw,22px)] font-medium leading-[1.35] max-[980px]:flex-[0_1_auto]">
            Nine of your ten ads are tax. Uno finds the one that isn&apos;t,
            hours after Meta does, and tells you what it&apos;s worth before you
            touch anything.
          </p>
          <div className="flex min-w-0 flex-wrap gap-3 max-[980px]:w-full max-[600px]:flex-col max-[600px]:items-stretch max-[600px]:gap-2.5">
            <LandingButton
              href="/c"
              variant="primary"
              className="flex-auto max-[980px]:flex-1 max-[600px]:w-full max-[600px]:flex-none"
            >
              Start now
            </LandingButton>
            <LandingButton
              href="#one"
              variant="outline"
              className="flex-auto max-[980px]:flex-1 max-[600px]:w-full max-[600px]:flex-none"
            >
              Watch it find one
            </LandingButton>
          </div>
        </div>
      </Container>
    </section>
  );
}
