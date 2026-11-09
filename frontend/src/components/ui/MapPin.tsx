import type { ReactNode } from "react";

/**
 * The app's map pin (R16.3): a chunky teardrop with a thick white outline and a darker "3D"
 * bottom edge, like the buttons. Decorative; the button around it carries the name.
 */
export default function MapPin({
  color,
  colorDark,
  size = 40,
  children,
  ring = false,
}: {
  color: string;
  colorDark: string;
  size?: number;
  /** Shown in the round head: an emoji, a dot, a "+". */
  children?: ReactNode;
  /** A dark outline for the selected pin. */
  ring?: boolean;
}) {
  const h = size * 1.25;
  return (
    <span aria-hidden="true" className="relative block" style={{ width: size, height: h }}>
      <svg viewBox="0 0 40 50" width={size} height={h} className="absolute inset-0 overflow-visible drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)]">
        {/* darker edge, nudged down: the "chunky" look */}
        <path d="M20 49C20 49 4 31.5 4 19.5a16 16 0 0 1 32 0C36 31.5 20 49 20 49z" fill={colorDark} transform="translate(0 2.5)" />
        <path
          d="M20 47C20 47 4 30 4 18.5a16 16 0 0 1 32 0C36 30 20 47 20 47z"
          fill={color}
          stroke={ring ? "var(--color-ink)" : "white"}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <circle cx="20" cy="18.5" r="10.5" fill="white" opacity={0.95} />
      </svg>
      <span
        className="absolute flex items-center justify-center leading-none"
        style={{ left: 0, width: size, top: size * 0.2, height: size * 0.53, fontSize: size * 0.4 }}
      >
        {children}
      </span>
    </span>
  );
}

/** The app's pin as a small inline icon, the same ★ pin used when adding a place (R16.3). */
export function PinIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center ${className}`}>
      <MapPin color="var(--color-brand)" colorDark="var(--color-brand-dark)" size={size}>
        <span className="font-extrabold text-brand">★</span>
      </MapPin>
    </span>
  );
}
