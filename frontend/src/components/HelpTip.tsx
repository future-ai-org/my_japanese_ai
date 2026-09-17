import type { ReactNode } from "react";

interface HelpTipProps {
  id: string;
  help: string;
  children: ReactNode;
  className?: string;
  tabIndex?: number;
}

export function HelpTip({
  id,
  help,
  children,
  className,
  tabIndex,
}: HelpTipProps) {
  return (
    <span
      className={["parameter-help", className].filter(Boolean).join(" ")}
      tabIndex={tabIndex}
      aria-describedby={tabIndex === 0 ? id : undefined}
    >
      <span className="parameter-help__label">{children}</span>
      <span className="parameter-help__tip" id={id} role="tooltip">
        {help}
      </span>
    </span>
  );
}
