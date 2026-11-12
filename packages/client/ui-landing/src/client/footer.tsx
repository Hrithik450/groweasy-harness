import { Container } from "./container";

const links = ["DOCS", "PRIVACY", "TERMS", "CONTACT"];

export function Footer() {
  return (
    <footer className="border-t-2 border-[#0E0E0E] [font-family:var(--font-jetbrains-mono)] text-[13px] leading-normal text-[#6B6657] max-[600px]:text-[12px]">
      <Container className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-6 max-[600px]:flex-col max-[600px]:items-start max-[600px]:gap-y-2 max-[600px]:py-[18px]">
        <span>UNO</span>
        <span className="flex flex-wrap gap-x-5 gap-y-1 max-[600px]:gap-x-[18px] max-[600px]:gap-y-0">
          {links.map((link) => (
            <a
              key={link}
              href="#top"
              className="inline-flex min-h-8 items-center text-[#6B6657] hover:text-[#FF4D1C]"
            >
              {link}
            </a>
          ))}
        </span>
      </Container>
    </footer>
  );
}
