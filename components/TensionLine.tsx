/**
 * Dividers are drawn as tensioned lines with anchor points, never as plain
 * rules. The off-centre node is what stops it reading as an `<hr>`.
 */
export function TensionLine({ accent = false }: { accent?: boolean }) {
  return (
    <svg
      viewBox="0 0 400 9"
      preserveAspectRatio="none"
      className="h-[9px] w-full overflow-visible"
      aria-hidden="true"
    >
      <line x1="2" y1="4.5" x2="398" y2="4.5" stroke="#243050" strokeWidth="1" />
      <circle cx="2" cy="4.5" r="2.5" fill="#243050" />
      <circle cx="398" cy="4.5" r="2.5" fill="#243050" />
      <circle cx="286" cy="4.5" r="2" fill={accent ? "#D42A3F" : "#243050"} />
    </svg>
  );
}
