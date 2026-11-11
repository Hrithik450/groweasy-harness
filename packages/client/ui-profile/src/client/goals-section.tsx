import { SectionHeading } from "./section-heading";
import {
  field,
  fieldGridCompact,
  fieldLabel,
  input,
  optionalLabel,
  sectionClass,
} from "./styles";

export function GoalsSection() {
  return (
    <section aria-labelledby="h6x" className={sectionClass} id="p6">
      <SectionHeading
        headingId="h6x"
        number="06"
        title={
          <>
            Goals <span className={optionalLabel}>OPTIONAL</span>
          </>
        }
      />

      <p className="m-0 max-w-[640px] text-[#3A372F]">
        Leave these blank and Uno compares everything with your usual: last 7
        days and your account&apos;s average. Fill them in only if you know
        them.
      </p>

      <div className={fieldGridCompact}>
        <div className={field}>
          <label className={fieldLabel} htmlFor="g-cpa">
            TARGET CPA
          </label>
          <input
            className={input}
            id="g-cpa"
            placeholder="usual ₹412"
            type="text"
          />
        </div>
        <div className={field}>
          <label className={fieldLabel} htmlFor="g-roas">
            TARGET ROAS
          </label>
          <input
            className={input}
            id="g-roas"
            placeholder="usual 2.4"
            type="text"
          />
        </div>
        <div className={field}>
          <label className={fieldLabel} htmlFor="g-margin">
            MARGIN PER ORDER · for profit
          </label>
          <input
            className={input}
            id="g-margin"
            placeholder="e.g. 35%"
            type="text"
          />
        </div>
        <div className={field}>
          <label className={fieldLabel} htmlFor="g-budget">
            MONTHLY BUDGET
          </label>
          <input
            className={input}
            defaultValue="₹4,50,000"
            id="g-budget"
            type="text"
          />
        </div>
      </div>
    </section>
  );
}
