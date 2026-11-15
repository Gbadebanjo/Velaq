"use client";

import { useId } from "react";
import { MONTH_NAMES } from "../../../lib/profile";

/*
 * Form fields for the profile editor. Each one is controlled: the editor holds every value, so
 * the whole profile can be checked and saved together.
 */

interface TextProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  optional?: boolean;
}

export function TextField({ label, value, onChange, error, hint, optional, className, ...input }: TextProps) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`field ${className ?? ""}`}>
      <label htmlFor={id}>{label}{optional ? <span className="optional"> (optional)</span> : null}</label>
      {hint ? <p id={`${id}-hint`} className="field-hint">{hint}</p> : null}
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {error ? <p id={`${id}-error`} className="field-error">{error}</p> : null}
    </div>
  );
}

export function TextArea({ label, value, onChange, error, hint, optional, maxLength, rows = 4 }: {
  label: string; value: string; onChange: (value: string) => void; error?: string; hint?: string; optional?: boolean; maxLength: number; rows?: number;
}) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, `${id}-count`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className="field">
      <label htmlFor={id}>{label}{optional ? <span className="optional"> (optional)</span> : null}</label>
      {hint ? <p id={`${id}-hint`} className="field-hint">{hint}</p> : null}
      <textarea
        id={id}
        rows={rows}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      <p id={`${id}-count`} className="field-count" aria-live="polite">{value.length > maxLength * 0.8 ? `${maxLength - value.length} characters left` : ""}</p>
      {error ? <p id={`${id}-error`} className="field-error">{error}</p> : null}
    </div>
  );
}

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: thisYear + 6 - 1950 }, (_, i) => String(thisYear + 5 - i));

/**
 * A month picked as month name plus year. Works the same in every browser, unlike type="month".
 * Gives "YYYY-MM" once both are chosen, or "" while either is blank.
 */
export function MonthField({ label, value, onChange, error, optional, disabled }: {
  label: string; value: string; onChange: (value: string) => void; error?: string; optional?: boolean; disabled?: boolean;
}) {
  const id = useId();
  // Keep a half-chosen month (year without month, or the reverse) visible until both are picked.
  const year = value.slice(0, 4);
  const month = value.slice(5, 7);
  const set = (y: string, m: string) => onChange(y || m ? `${y || "0000"}-${m || "00"}` : "");
  return (
    <fieldset className="field month-field" disabled={disabled} aria-describedby={error ? `${id}-error` : undefined}>
      <legend>{label}{optional ? <span className="optional"> (optional)</span> : null}</legend>
      <div className="month-pair">
        <select aria-label={`${label}: month`} value={disabled ? "" : month === "00" ? "" : month} onChange={(e) => set(year === "0000" ? "" : year, e.target.value)} aria-invalid={error ? true : undefined}>
          <option value="">Month</option>
          {MONTH_NAMES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
        </select>
        <select aria-label={`${label}: year`} value={disabled ? "" : year === "0000" ? "" : year} onChange={(e) => set(e.target.value, month === "00" ? "" : month)} aria-invalid={error ? true : undefined}>
          <option value="">Year</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {error ? <p id={`${id}-error`} className="field-error">{error}</p> : null}
    </fieldset>
  );
}

export function Checkbox({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="check">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}{hint ? <span className="check-hint">{hint}</span> : null}</label>
    </div>
  );
}
