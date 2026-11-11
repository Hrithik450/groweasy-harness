import { displayFont, focusRing, monoFont, shell } from "./styles";

export function ProfileHeader() {
  return (
    <header className="border-b-2 border-[#0E0E0E]">
      <div
        className={`${shell} flex flex-wrap items-center gap-4 py-2.5 max-[820px]:gap-x-4 max-[820px]:gap-y-2.5`}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 max-[820px]:flex-[1_1_100%] max-[820px]:flex-nowrap">
          <a
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 no-underline hover:text-[#FF4D1C] ${focusRing}`}
            href="UnoApp.dc.html"
          >
            <svg
              aria-hidden="true"
              className="h-[18px] w-[18px]"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.2}
              viewBox="0 0 24 24"
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span
              className={`${displayFont} text-[26px] font-extrabold leading-none tracking-[-0.04em] max-[400px]:text-2xl`}
            >
              Uno
            </span>
          </a>
          <span
            className={`min-w-0 ${monoFont} text-xs text-[#6B6657] [overflow-wrap:anywhere] max-[820px]:flex-[1_1_auto]`}
          >
            / PROFILE · what all three agents know about you
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2 max-[820px]:ml-0 max-[820px]:flex-[1_1_100%] max-[820px]:justify-between">
          <span
            className={`whitespace-nowrap ${monoFont} text-xs text-[#6B6657]`}
          >
            SAVED · 2 MIN AGO
          </span>
          <a
            className={`inline-flex min-h-11 items-center justify-center whitespace-nowrap bg-[#0E0E0E] px-4 font-bold text-[#F3EFE4] no-underline hover:text-[#FF4D1C] max-[400px]:px-3 ${focusRing}`}
            href="UnoApp.dc.html"
          >
            Back to agents →
          </a>
        </div>
      </div>
    </header>
  );
}
