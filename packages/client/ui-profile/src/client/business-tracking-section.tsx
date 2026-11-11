import { SectionHeading } from "./section-heading";
import {
  box,
  boxCell,
  boxHead,
  boxRow,
  field,
  fieldGrid,
  fieldLabel,
  focusRing,
  input,
  monoFont,
  muted2Text,
  mutedText,
  sectionClass,
  statusOk,
  statusWarn,
} from "./styles";

type Connection = {
  label: string;
  status: string;
  statusClass?: string;
  muted?: boolean;
};

const connections: Connection[] = [
  {
    label: "Meta ad account · Oil & Co. Ads",
    status: "✓ CONNECTED · read + apply",
    statusClass: statusOk,
  },
  {
    label: "Pixel · purchases with value",
    status: "✓ FIRING · last event 4 min ago",
    statusClass: statusOk,
  },
  {
    label: "Conversions API",
    status: "NOT SET · fewer purchases seen",
    statusClass: statusWarn,
  },
  {
    label: "App store links · app events",
    status: "Only for App installs",
    statusClass: undefined,
    muted: true,
  },
];

export function BusinessTrackingSection() {
  return (
    <section aria-labelledby="h1x" className={sectionClass} id="p1">
      <SectionHeading
        headingId="h1x"
        number="01"
        title="Business & tracking"
      />

      <div
        aria-label="What you advertise"
        className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-0.5 border-2 border-[#0E0E0E] bg-[#0E0E0E]"
        role="radiogroup"
      >
        <button
          aria-checked={true}
          className={`flex min-h-11 w-full min-w-0 cursor-pointer flex-col items-start gap-1 border-0 bg-[#FF4D1C] p-4 text-left text-[#0E0E0E] [font:inherit] ${focusRing}`}
          role="radio"
          type="button"
        >
          <span
            className={`${monoFont} text-[11px] font-bold [overflow-wrap:anywhere]`}
          >
            ● SELECTED
          </span>
          <b className="text-lg leading-[1.2] [overflow-wrap:anywhere]">
            Website sales / D2C
          </b>
          <span className="text-[13px] [overflow-wrap:anywhere]">
            Judged on purchases, CPA and ROAS
          </span>
        </button>
        <button
          aria-checked={false}
          className={`flex min-h-11 w-full min-w-0 cursor-pointer flex-col items-start gap-1 border-0 bg-[#F3EFE4] p-4 text-left text-[#0E0E0E] [font:inherit] ${focusRing}`}
          role="radio"
          type="button"
        >
          <span
            className={`${monoFont} text-[11px] font-bold ${mutedText} [overflow-wrap:anywhere]`}
          >
            ○
          </span>
          <b className="text-lg leading-[1.2] [overflow-wrap:anywhere]">
            App installs
          </b>
          <span
            className={`text-[13px] ${muted2Text} [overflow-wrap:anywhere]`}
          >
            Judged on installs and CPI
          </span>
        </button>
      </div>

      <div className={fieldGrid}>
        <div className={field}>
          <label className={fieldLabel} htmlFor="biz-name">
            BUSINESS NAME
          </label>
          <input
            autoComplete="organization"
            className={input}
            defaultValue="Oil & Co."
            id="biz-name"
            type="text"
          />
        </div>
        <div className={field}>
          <label className={fieldLabel} htmlFor="biz-site">
            WEBSITE
          </label>
          <input
            autoComplete="url"
            className={input}
            defaultValue="oilandco.in"
            id="biz-site"
            type="text"
          />
        </div>
      </div>

      <div className={box}>
        <div className={boxHead}>
          <b>CONNECTIONS</b>
          <span className={mutedText}>checked 06:00</span>
        </div>
        {connections.map((connection) => (
          <div
            className={`${boxRow} ${connection.muted ? mutedText : ""}`}
            key={connection.label}
          >
            <span className={boxCell}>{connection.label}</span>
            <span className={`${boxCell} ${connection.statusClass ?? ""}`}>
              {connection.status}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
