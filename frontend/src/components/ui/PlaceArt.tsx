import type { ReactNode } from "react";

import type { Schemas } from "../../api/client";

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
  /** A real photo (a user's, or Wikimedia with its credit); without one, the poster art. */
  image?: Schemas["PlaceImage"] | null;
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
  image = null,
}: Props) {
  const Name = nameAs;
  const art = artFor(subcategorySlug, topCategory);
  const tilt = tiltFor(id);
  const style = {
    backgroundImage: `radial-gradient(rgb(255 255 255 / 0.14) 1.5px, transparent 1.5px), linear-gradient(135deg, ${art.from}, ${art.to})`,
    backgroundSize: "14px 14px, 100% 100%",
  };
  if (variant === "tile" && image) {
    return (
      <span aria-hidden="true" className={`relative block shrink-0 overflow-hidden rounded-2xl bg-stone-200 ${className}`}>
        <img src={image.thumb_url} alt="" loading="lazy" title={image.credit ?? undefined} className="size-full object-cover" />
      </span>
    );
  }
  if (variant === "tile") {
    return (
      <span aria-hidden="true" className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl ${className}`} style={style}>
        <span className="text-[2em] drop-shadow-[0_2px_2px_rgba(0,0,0,0.3)]" style={{ transform: `rotate(${tilt}deg)` }}>
          {art.emoji}
        </span>
      </span>
    );
  }
  if (image) {
    // Photo poster: the picture, a dark fade at the bottom so the name stays readable, and the
    // photographer's credit for Wikimedia photos (their licences require it).
    return (
      <div className={`relative overflow-hidden rounded-(--radius-card) bg-stone-800 text-white ${className}`}>
        <img src={image.url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-3 select-none text-4xl drop-shadow-[0_3px_4px_rgba(0,0,0,0.45)]"
          style={{ transform: `rotate(${tilt + 8}deg)` }}
        >
          {art.emoji}
        </span>
        <div className="relative flex h-full min-h-[inherit] flex-col justify-end gap-1 p-4 pb-6">
          {name ? (
            <Name className="font-display text-2xl font-black leading-tight text-white [text-shadow:0_2px_8px_rgb(0_0_0/0.5)]">{name}</Name>
          ) : null}
          {caption ? <div className="text-sm font-bold text-white/95">{caption}</div> : null}
          {children}
        </div>
        {image.credit ? (
          <a
            href={image.credit_url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-1 right-2 max-w-[70%] truncate text-[10px] font-bold text-white/90 underline-offset-2 hover:underline"
          >
            {image.credit} · Wikimedia Commons
          </a>
        ) : null}
      </div>
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
