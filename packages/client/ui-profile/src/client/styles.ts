export const shell = "mx-auto w-full max-w-[1264px] px-4";

export const displayFont = "[font-family:var(--font-syne)]";
export const monoFont = "[font-family:var(--font-jetbrains-mono)]";

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF4D1C]";

// The scroll offsets keep a clicked section clear of the top edge at each
// breakpoint. ProfileHeader is not sticky and the desktop rail is a sibling
// column, so there is no header height to subtract on top of the section's own
// top padding; these values add deliberate breathing room instead.
export const sectionClass =
  "flex min-w-0 flex-col gap-[18px] scroll-mt-8 border-b-2 border-[#0E0E0E] py-8 pl-8 last:border-b-0 last:pb-12 max-[900px]:scroll-mt-6 max-[900px]:py-7 max-[900px]:pl-0 max-[900px]:last:pb-10 max-[520px]:scroll-mt-4 max-[520px]:py-6 max-[520px]:last:pb-8";

export const sectionHeadRow =
  "flex flex-wrap items-baseline justify-between gap-3";
export const sectionHead = "flex min-w-0 flex-wrap items-baseline gap-3";
export const sectionNum = `shrink-0 ${displayFont} text-[clamp(30px,4vw,40px)] font-extrabold leading-none tracking-[-0.05em] text-[#FF4D1C] max-[400px]:text-[28px]`;
export const sectionTitle = `${displayFont} m-0 min-w-0 text-[clamp(22px,5vw,32px)] font-extrabold leading-[1.05] tracking-[-0.03em] [overflow-wrap:break-word]`;
export const optionalLabel = `ml-1 ${monoFont} whitespace-nowrap text-[13px] font-medium tracking-normal text-[#6B6657]`;
export const sectionNote = `${monoFont} text-xs text-[#6B6657] [overflow-wrap:anywhere]`;
export const sectionActions = "flex min-w-0 flex-wrap gap-2 max-[520px]:w-full";
export const sectionActionButton = "max-[520px]:flex-[1_1_160px]";

const buttonBase = `inline-flex min-h-11 cursor-pointer items-center justify-center px-3.5 text-center font-semibold [font:inherit] hover:opacity-85 ${focusRing}`;
export const buttonOutline = `${buttonBase} border-2 border-[#0E0E0E] bg-transparent text-[#0E0E0E]`;
export const buttonDark = `${buttonBase} border-0 bg-[#0E0E0E] font-bold text-[#F3EFE4]`;

export const fieldGrid =
  "grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-4";
export const fieldGridWide =
  "grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4";
export const fieldGridCompact =
  "grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4";
export const field = "flex min-w-0 flex-col gap-1.5";
export const fieldLabel = `${monoFont} text-[11px] text-[#6B6657] [overflow-wrap:anywhere]`;
export const input = `h-11 w-full min-w-0 border-2 border-[#0E0E0E] bg-white px-3 text-[#0E0E0E] [font:inherit] placeholder:text-[#6B6657] ${focusRing}`;
export const textarea = `w-full min-w-0 resize-y border-2 border-[#0E0E0E] bg-white px-3 py-2.5 leading-normal text-[#0E0E0E] [font:inherit] placeholder:text-[#6B6657] ${focusRing}`;
export const inputDanger = "border-[#B4402E]";

export const box = `min-w-0 border-2 border-[#0E0E0E] bg-[#FBF9F3] ${monoFont} text-[13px]`;
export const boxHead =
  "flex flex-wrap justify-between gap-2 border-b-2 border-[#0E0E0E] px-3.5 py-2.5";
export const boxRow =
  "flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1.5 border-b border-[#E9E4D6] px-3.5 py-2.5 last:border-b-0 max-[640px]:flex-col max-[640px]:items-start";
export const boxCell = "min-w-0 [overflow-wrap:anywhere]";
export const statusOk = "text-[#1FA463]";
export const statusWarn = "text-[#9A5B10]";
export const mutedText = "text-[#6B6657]";
export const muted2Text = "text-[#3A372F]";

export const chips = `flex min-w-0 flex-wrap gap-2 ${monoFont} text-xs`;
export const chip =
  "inline-flex max-w-full items-center border-[1.5px] border-[#0E0E0E] px-2.5 py-1.5 leading-[1.2] [overflow-wrap:anywhere]";
export const chipDark = `${chip} bg-[#0E0E0E] text-[#F3EFE4]`;
export const chipButton = `inline-flex min-h-8 cursor-pointer items-center border-[1.5px] border-dashed border-[#6B6657] bg-transparent px-2.5 py-1.5 [font:inherit] text-[#3A372F] hover:opacity-85 ${focusRing}`;

export const pills = "flex min-w-0 flex-wrap gap-2 text-sm";
export const pill =
  "inline-flex min-h-[38px] max-w-full items-center bg-[#0E0E0E] px-3 py-2 text-[#F3EFE4] [overflow-wrap:anywhere]";
export const pillOutline =
  "inline-flex min-h-[38px] max-w-full items-center border-[1.5px] border-[#0E0E0E] px-3 py-2 [overflow-wrap:anywhere]";
export const pillExcluded =
  "inline-flex min-h-[38px] max-w-full items-center border-[1.5px] border-[#B4402E] px-3 py-2 text-[#B4402E] line-through [overflow-wrap:anywhere]";
export const pillButton = `inline-flex min-h-[38px] max-w-full cursor-pointer items-center border-[1.5px] border-dashed border-[#6B6657] bg-transparent px-3 py-2 text-sm [font:inherit] text-[#3A372F] hover:opacity-85 ${focusRing}`;

export const toneSelected = `inline-flex max-w-full items-center bg-[#0E0E0E] px-2.5 py-[5px] text-[13px] text-[#F3EFE4] [overflow-wrap:anywhere]`;
export const toneOutline = `inline-flex max-w-full items-center border-[1.5px] border-[#0E0E0E] px-2.5 py-[5px] text-[13px] [overflow-wrap:anywhere]`;
