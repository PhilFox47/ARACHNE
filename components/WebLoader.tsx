/**
 * Loading state: web-lines draw node to node. No spinners anywhere in this app.
 */
export function WebLoader({ size = 44, label }: { size?: number; label?: string }) {
  const spokes = [
    "M50 50 L50 8",
    "M50 50 L79.7 20.3",
    "M50 50 L92 50",
    "M50 50 L79.7 79.7",
    "M50 50 L50 92",
    "M50 50 L20.3 79.7",
    "M50 50 L8 50",
    "M50 50 L20.3 20.3",
  ];
  const nodes = [
    [50, 8],
    [79.7, 20.3],
    [92, 50],
    [79.7, 79.7],
    [50, 92],
    [20.3, 79.7],
    [8, 50],
    [20.3, 20.3],
  ];

  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <svg viewBox="0 0 100 100" width={size} height={size} fill="none" aria-hidden="true">
        {spokes.map((d, i) => (
          <path
            key={d}
            d={d}
            pathLength={1}
            stroke="#2B5CB8"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={1}
            style={{
              animation: `web-draw 1.4s ease-in-out ${i * 0.09}s infinite`,
            }}
          />
        ))}
        {nodes.map(([cx, cy], i) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r={1.6}
            fill="#D42A3F"
            style={{ animation: `node-pulse 1.4s ease-in-out ${i * 0.09}s infinite` }}
          />
        ))}
        <circle cx="50" cy="50" r="3" fill="#D42A3F" />
      </svg>
      {label ? <p className="label-xs">{label}</p> : null}
    </div>
  );
}
