import { Container } from "./container";
import { LandingButton } from "./ui";

export function Header() {
  return (
    <header className="border-b-2 border-[#0E0E0E]">
      <Container className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-[18px] max-[1100px]:gap-x-4 max-[1100px]:gap-y-2.5 max-[600px]:py-3.5">
        <a
          href="#top"
          className="flex shrink-0 items-baseline gap-2.5 text-[#0E0E0E] hover:text-[#0E0E0E]"
        >
          <span className="[font-family:var(--font-syne)] text-[30px] font-extrabold leading-none tracking-[-0.04em] max-[600px]:text-[28px]">
            Uno
          </span>
        </a>

        <span className="flex min-w-0 flex-wrap items-center gap-x-[18px] gap-y-1.5 [font-family:var(--font-jetbrains-mono)] text-[12px] leading-normal text-[#6B6657] max-[1100px]:order-3 max-[1100px]:w-full max-[1100px]:flex-none max-[1100px]:gap-x-3 max-[1100px]:gap-y-1 max-[1100px]:border-t max-[1100px]:border-[#D9D3C3] max-[1100px]:pt-2.5 max-[1100px]:text-[11px] max-[600px]:gap-x-2.5 max-[600px]:text-[10.5px]">
          <span>ACCOUNT READ 06:00</span>
          <span
            aria-hidden="true"
            className="text-[#6B6657] max-[600px]:hidden"
          >
            ·
          </span>
          <span>3 MOVES READY</span>
          <span
            aria-hidden="true"
            className="text-[#6B6657] max-[600px]:hidden"
          >
            ·
          </span>
          <span className="text-[#FF4D1C]">₹1,84,000 PROTECTED / 28D</span>
        </span>

        <nav
          aria-label="Main"
          className="ml-auto flex min-w-0 items-center gap-6 text-[15px] font-medium max-[600px]:gap-3"
        >
          <a
            href="#one"
            className="text-[#0E0E0E] hover:text-[#FF4D1C] max-[1100px]:hidden"
          >
            The one
          </a>
          <a
            href="#team"
            className="text-[#0E0E0E] hover:text-[#FF4D1C] max-[1100px]:hidden"
          >
            The team
          </a>
          <LandingButton href="/c" variant="nav">
            Start now
          </LandingButton>
        </nav>
      </Container>
    </header>
  );
}
