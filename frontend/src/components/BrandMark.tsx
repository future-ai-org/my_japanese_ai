interface BrandMarkProps {
  compact?: boolean;
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <div className="brand" aria-label="my japanese AI">
      <svg
        className="brand__mark"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="40" height="40" rx="10" fill="#6b5ce7" />
        <path
          d="M20 9 22.9 16.6 31 17.4 24.7 22.4 26.4 30.5 20 26.2 13.6 30.5 15.3 22.4 9 17.4 17.1 16.6Z"
          fill="#fff"
        />
      </svg>
      {!compact && (
        <span className="brand__name">
          my <span>japanese AI</span>
        </span>
      )}
    </div>
  );
}
