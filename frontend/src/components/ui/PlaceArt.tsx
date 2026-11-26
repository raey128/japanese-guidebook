import type { ReactNode } from "react";

import { artFor, tiltFor } from "../../lib/placeArt";

type Props = {
  id: number | string;
  subcategorySlug: string;
  topCategory?: string | null;
  /** "banner": a wide poster with the name on it; "tile": a square thumbnail. */
  variant?: "banner" | "tile";
  name?: string;
  /** The element the name renders as on a banner (it's often the card's heading). */
  nameAs?: "h2" | "h3" | "p";
  /** Extra line under the name on a banner (area, kind…). */
  caption?: ReactNode;
  className?: string;
  children?: ReactNode;
};

/**
 * Poster art for a place (Partiful-style): its kind's gradient, a soft dotted texture, a big
 * tilted emoji sticker and, on banners, the name in the display font. Purely visual: the name
 * is also in the surrounding text for screen readers, so the art is aria-hidden unless it
 * carries the only heading (banners pass the name as real text).
 */
export default function PlaceArt({
  id,
  subcategorySlug,
  topCategory,
  variant = "tile",
  name,
  nameAs = "p",
  caption,
  className = "",
  children,
}: Props) {
  const Name = nameAs;
  const art = artFor(subcategorySlug, topCategory);
  const tilt = tiltFor(id);
  const style = {
    backgroundImage: `radial-gradient(rgb(255 255 255 / 0.14) 1.5px, transparent 1.5px), linear-gradient(135deg, ${art.from}, ${art.to})`,
    backgroundSize: "14px 14px, 100% 100%",
  };
  if (variant === "tile") {
    return (
      <span aria-hidden="true" className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl ${className}`} style={style}>
        <span className="text-[2em] drop-shadow-[0_2px_2px_rgba(0,0,0,0.3)]" style={{ transform: `rotate(${tilt}deg)` }}>
          {art.emoji}
        </span>
      </span>
    );
  }
  return (
    <div className={`relative overflow-hidden rounded-(--radius-card) text-white ${className}`} style={style}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 -top-3 select-none text-[5.5rem] leading-none drop-shadow-[0_4px_6px_rgba(0,0,0,0.35)]"
        style={{ transform: `rotate(${tilt + 8}deg)` }}
      >
        {art.emoji}
      </span>
      <div className="relative flex h-full flex-col justify-end gap-1 p-4 pr-24">
        {name ? (
          <Name className="font-display text-2xl font-black leading-tight text-white [text-shadow:0_2px_8px_rgb(0_0_0/0.35)]">{name}</Name>
        ) : null}
        {caption ? <div className="text-sm font-bold text-white/90">{caption}</div> : null}
        {children}
      </div>
    </div>
  );
}
