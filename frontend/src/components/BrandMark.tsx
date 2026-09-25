interface BrandMarkProps {
  compact?: boolean;
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <div className="brand" aria-label="code.review">
      <img
        className="brand__mark"
        src="/favicon.ico"
        alt=""
        aria-hidden="true"
      />
      {!compact && (
        <span className="brand__name">
          code<span>.review</span>
        </span>
      )}
    </div>
  );
}
