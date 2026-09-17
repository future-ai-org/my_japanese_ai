import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { LANGUAGE_LABELS } from "../data/examples";
import { LANGUAGE_EXTENSIONS } from "../data/languages";
import { LANGUAGES, type Language } from "../types/review";

interface LanguageSelectProps {
  value: Language;
  ariaLabel: string;
  onChange: (language: Language) => void;
}

export function LanguageSelect({
  value,
  ariaLabel,
  onChange,
}: LanguageSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className={`language-select${open ? " is-open" : ""}`}
      data-language={value}
      ref={rootRef}
    >
      <span className="language-select__pip" data-language={value} />
      <span className="language-select__value" aria-hidden="true">
        {LANGUAGE_LABELS[value]}
      </span>
      <select
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value as Language)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" ||
            event.key === " " ||
            event.key === "ArrowDown"
          ) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        onMouseDown={(event) => {
          event.preventDefault();
          event.currentTarget.focus();
          setOpen((current) => !current);
        }}
      >
        {LANGUAGES.map((option) => (
          <option key={option} value={option}>
            {LANGUAGE_LABELS[option]}
          </option>
        ))}
      </select>
      <ChevronDown size={13} />
      {open ? (
        <ul className="language-select__menu" id={listId} role="listbox">
          {LANGUAGES.map((option) => (
            <li key={option} role="none">
              <button
                aria-selected={option === value}
                className={option === value ? "is-selected" : undefined}
                role="option"
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                <span className="language-select__pip" data-language={option} />
                <span className="language-select__option-label">
                  {LANGUAGE_LABELS[option]}
                </span>
                <span className="language-select__extension">
                  {LANGUAGE_EXTENSIONS[option]}
                </span>
                {option === value ? (
                  <Check
                    aria-hidden="true"
                    className="language-select__check"
                    size={13}
                  />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
