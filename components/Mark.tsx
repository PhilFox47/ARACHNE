/**
 * The ARACHNE mark.
 *
 * A real orb web is straight chords strung between radial spokes, not
 * concentric circles — that geometry is what makes this read as surveyed and
 * technical rather than decorative. Eight spokes, three chord rings, a crimson
 * tripod carrying the load, and one deliberately snapped outer sector.
 *
 * `compact` drops the inner ring and thickens everything for use at ≤48px.
 */
export function Mark({
  size = 32,
  compact = false,
  className,
  crimson = "#D42A3F",
  cobalt = "#2B5CB8",
  base = "#0A0D16",
}: {
  size?: number;
  compact?: boolean;
  className?: string;
  crimson?: string;
  cobalt?: string;
  base?: string;
}) {
  const auto = compact || size <= 48;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label="ARACHNE"
    >
      {auto ? (
        <>
          <g stroke={cobalt} strokeWidth={2.4} opacity={0.9}>
            <path d="M50 50 L81.11 18.89" />
            <path d="M50 50 L94 50" />
            <path d="M50 50 L50 94" />
            <path d="M50 50 L6 50" />
            <path d="M50 50 L18.89 18.89" />
          </g>
          <g stroke={cobalt} strokeWidth={2.8} opacity={0.8}>
            <path d="M50 6 L81.11 18.89 L94 50 L81.11 81.11" />
            <path d="M50 94 L18.89 81.11 L6 50 L18.89 18.89 L50 6" />
          </g>
          <g stroke={crimson} strokeWidth={4.6}>
            <path d="M50 50 L50 6" />
            <path d="M50 50 L81.11 81.11" />
            <path d="M50 50 L18.89 81.11" />
          </g>
          <g fill={crimson} stroke="none">
            <circle cx="50" cy="6" r="4" />
            <circle cx="81.11" cy="81.11" r="4" />
            <circle cx="18.89" cy="81.11" r="4" />
          </g>
          <path d="M50 39 L61 50 L50 61 L39 50 Z" fill={crimson} stroke="none" />
          <path d="M50 45.5 L54.5 50 L50 54.5 L45.5 50 Z" fill={base} stroke="none" />
        </>
      ) : (
        <>
          <g stroke={cobalt} strokeWidth={1.2} opacity={0.9}>
            <path d="M50 50 L81.11 18.89" />
            <path d="M50 50 L94 50" />
            <path d="M50 50 L50 94" />
            <path d="M50 50 L6 50" />
            <path d="M50 50 L18.89 18.89" />
          </g>
          <g stroke={cobalt} strokeWidth={1.6} opacity={0.75}>
            <path d="M50 6 L81.11 18.89" />
            <path d="M81.11 18.89 L94 50" />
            <path d="M94 50 L81.11 81.11" />
            <path d="M81.11 81.11 L74.27 83.95" />
            <path d="M50 94 L56.84 91.16" />
            <path d="M50 94 L18.89 81.11" />
            <path d="M18.89 81.11 L6 50" />
            <path d="M6 50 L18.89 18.89" />
            <path d="M18.89 18.89 L50 6" />
          </g>
          <g stroke={cobalt} strokeWidth={1.3} opacity={0.6}>
            <path d="M50 20.08 L71.16 28.84 L79.92 50 L71.16 71.16 L50 79.92 L28.84 71.16 L20.08 50 L28.84 28.84 Z" />
          </g>
          <g stroke={cobalt} strokeWidth={1.1} opacity={0.45}>
            <path d="M50 33.28 L61.82 38.18 L66.72 50 L61.82 61.82 L50 66.72 L38.18 61.82 L33.28 50 L38.18 38.18 Z" />
          </g>
          <g stroke={crimson} strokeWidth={2.6}>
            <path d="M50 50 L50 6" />
            <path d="M50 50 L81.11 81.11" />
            <path d="M50 50 L18.89 81.11" />
          </g>
          <g fill={cobalt} opacity={0.85} stroke="none">
            <circle cx="81.11" cy="18.89" r="1.5" />
            <circle cx="94" cy="50" r="1.5" />
            <circle cx="50" cy="94" r="1.5" />
            <circle cx="6" cy="50" r="1.5" />
            <circle cx="18.89" cy="18.89" r="1.5" />
          </g>
          <g fill={crimson} stroke="none">
            <circle cx="50" cy="6" r="2.4" />
            <circle cx="81.11" cy="81.11" r="2.4" />
            <circle cx="18.89" cy="81.11" r="2.4" />
            <circle cx="50" cy="20.08" r="1.9" />
            <circle cx="71.16" cy="71.16" r="1.9" />
            <circle cx="28.84" cy="71.16" r="1.9" />
          </g>
          <path d="M50 42.5 L57.5 50 L50 57.5 L42.5 50 Z" fill={crimson} stroke="none" />
          <path d="M50 46.6 L53.4 50 L50 53.4 L46.6 50 Z" fill={base} stroke="none" />
        </>
      )}
    </svg>
  );
}
