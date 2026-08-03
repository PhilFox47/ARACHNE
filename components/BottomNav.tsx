"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "HQ", match: (p: string) => p === "/" },
  { href: "/patrol", label: "PATROL", match: (p: string) => p.startsWith("/patrol") },
  { href: "/fuel", label: "FUEL", match: (p: string) => p.startsWith("/fuel") },
  { href: "/vitals", label: "VITALS", match: (p: string) => p.startsWith("/vitals") },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-edge bg-base/95 backdrop-blur">
      <ul className="pad-safe-b mx-auto grid max-w-lg grid-cols-4">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`tap flex flex-col items-center justify-center gap-1.5 pt-2.5 ${
                  active ? "text-crimson" : "text-muted-dim"
                }`}
              >
                <Icon name={item.label} />
                <span className="text-[0.5625rem] uppercase tracking-[0.16em]">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Icon({ name }: { name: string }) {
  const common = {
    viewBox: "0 0 100 100",
    width: 18,
    height: 18,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  // HQ carries the mark's own tripod-over-lattice geometry.
  if (name === "HQ")
    return (
      <svg {...common}>
        <path d="M50 50 L50 10" />
        <path d="M50 50 L81 81" />
        <path d="M50 50 L19 81" />
        <path d="M50 10 L84 27 L92 62 L50 90 L8 62 L16 27 Z" strokeWidth={4} opacity={0.55} />
      </svg>
    );

  // A bar between two uprights — the pull-up bar.
  if (name === "PATROL")
    return (
      <svg {...common}>
        <path d="M18 50 H82" />
        <path d="M30 30 V70" />
        <path d="M70 30 V70" />
      </svg>
    );

  // Aperture: this is a camera-first screen.
  if (name === "FUEL")
    return (
      <svg {...common}>
        <circle cx="50" cy="54" r="25" />
        <path d="M33 27 H67" />
      </svg>
    );

  // A trace with a spike.
  return (
    <svg {...common}>
      <path d="M14 56 H34 L44 30 L58 74 L68 56 H86" />
    </svg>
  );
}
