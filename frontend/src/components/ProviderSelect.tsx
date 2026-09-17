import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";

interface ProviderSelectOption {
  id: string;
  label: string;
  disabled?: boolean;
  hint?: string;
}

interface ProviderSelectProps {
  icon: ReactNode;
  prefix: string;
  ariaLabel: string;
  value: string;
  displayValue: string;
  placeholder?: boolean;
  options: ProviderSelectOption[];
  onChange: (value: string) => void;
}

export function ProviderSelect({
  icon,
  prefix,
  ariaLabel,
  value,
  displayValue,
  placeholder = false,
  options,
  onChange,
}: ProviderSelectProps) {
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
      className={`provider-summary__select${open ? " is-open" : ""}`}
      ref={rootRef}
    >
      {icon}
      <span>{prefix}</span>
      <span
        className={`provider-summary__select-value${
          placeholder ? " is-placeholder" : ""
        }`}
        aria-hidden="true"
      >
        {displayValue}
      </span>
      <select
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
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
        {options.map((option) => (
          <option
            disabled={option.disabled}
            key={option.id}
            value={option.id}
          >
            {option.hint ? `${option.label} ${option.hint}` : option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} />
      {open ? (
        <ul className="provider-summary__menu" id={listId} role="listbox">
          {options.map((option) => (
            <li key={option.id} role="none">
              <button
                aria-selected={option.id === value}
                className={option.id === value ? "is-selected" : undefined}
                disabled={option.disabled}
                role="option"
                type="button"
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {option.hint ? (
                  <span className="provider-summary__menu-hint">
                    {option.hint}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
