'use client';
import { REVIEW_THEME } from '@/scene/theme';
import { useApp } from '@/store/useApp';

/** CSS variables for reviews: every colour comes from scene/theme.ts. */
export function useReviewVars(): React.CSSProperties {
  const night = useApp((s) => s.night);
  return {
    '--r-star': night ? REVIEW_THEME.star : REVIEW_THEME.starDay,
    '--r-error': night ? REVIEW_THEME.error : REVIEW_THEME.errorDay,
  } as React.CSSProperties;
}

/** Read-only stars, e.g. "4.5 out of 5". */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const full = Math.round(value);
  return (
    <span className="rv-stars" role="img" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path
            d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
            className={n <= full ? 'rv-star-on' : 'rv-star-off'}
          />
        </svg>
      ))}
    </span>
  );
}

/** Five 44 px star buttons (radio group). */
export function StarInput({
  value,
  onChange,
  label,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="rv-star-input" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          disabled={disabled}
          onClick={() => onChange(n)}
          className="rv-star-btn"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
              className={n <= value ? 'rv-star-on' : 'rv-star-off'}
            />
          </svg>
        </button>
      ))}
    </div>
  );
}
