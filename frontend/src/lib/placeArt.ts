/**
 * Poster art for places (decided 2026-11-27, "like Partiful"): every place gets a bold gradient
 * and a big emoji sticker from its kind, so cards look finished before anyone adds a photo.
 * Gradient stops are Tailwind 700-900 shades: white text on them is ≥ 4.5:1.
 */
export interface Art {
  from: string;
  to: string;
  emoji: string;
}

const KIND: Record<string, Art> = {
  // Food: warm
  ramen: { from: "#c2410c", to: "#be185d", emoji: "🍜" },
  sushi: { from: "#be123c", to: "#7e22ce", emoji: "🍣" },
  izakaya: { from: "#b91c1c", to: "#9a3412", emoji: "🏮" },
  yakitori: { from: "#a16207", to: "#b91c1c", emoji: "🍢" },
  tempura: { from: "#b45309", to: "#a16207", emoji: "🍤" },
  tonkatsu: { from: "#9a3412", to: "#be123c", emoji: "🐷" },
  udon_soba: { from: "#854d0e", to: "#c2410c", emoji: "🥢" },
  okonomiyaki: { from: "#c2410c", to: "#a21caf", emoji: "🥞" },
  kaiseki: { from: "#7c2d12", to: "#831843", emoji: "🍱" },
  cafe: { from: "#78350f", to: "#9d174d", emoji: "☕" },
  sweets: { from: "#be185d", to: "#a21caf", emoji: "🍰" },
  market: { from: "#0369a1", to: "#c2410c", emoji: "🐟" },
  // Sights: fresh
  temple: { from: "#0f766e", to: "#4d7c0f", emoji: "🛕" },
  shrine: { from: "#b91c1c", to: "#0f766e", emoji: "⛩️" },
  castle: { from: "#1e3a8a", to: "#0f766e", emoji: "🏯" },
  museum: { from: "#3730a3", to: "#0e7490", emoji: "🏛️" },
  garden_park: { from: "#15803d", to: "#be185d", emoji: "🌸" },
  viewpoint: { from: "#1d4ed8", to: "#7e22ce", emoji: "🗼" },
  neighborhood: { from: "#0e7490", to: "#a21caf", emoji: "🏘️" },
  landmark: { from: "#1e40af", to: "#0f766e", emoji: "📸" },
  // Stays: calm blues
  hotel: { from: "#1e3a8a", to: "#6d28d9", emoji: "🏨" },
  ryokan: { from: "#065f46", to: "#1e3a8a", emoji: "♨️" },
  hostel: { from: "#0369a1", to: "#4338ca", emoji: "🛏️" },
  // Experiences: night and neon
  onsen: { from: "#0e7490", to: "#6d28d9", emoji: "♨️" },
  bar: { from: "#581c87", to: "#be185d", emoji: "🍸" },
  shopping: { from: "#a21caf", to: "#4338ca", emoji: "🛍️" },
  activity: { from: "#6d28d9", to: "#c2410c", emoji: "🎯" },
};

const TOP: Record<string, Art> = {
  food: { from: "#c2410c", to: "#be185d", emoji: "🍽️" },
  sights: { from: "#0f766e", to: "#1d4ed8", emoji: "⛩️" },
  stays: { from: "#1e3a8a", to: "#6d28d9", emoji: "🏨" },
  experiences: { from: "#6d28d9", to: "#be185d", emoji: "🏮" },
};

/** Art for a place kind, falling back to its group (user-added kinds) and then the brand. */
export function artFor(subcategorySlug: string | null | undefined, topCategory?: string | null): Art {
  return (
    (subcategorySlug ? KIND[subcategorySlug] : undefined) ??
    (topCategory ? TOP[topCategory] : undefined) ?? { from: "#a82a13", to: "#be185d", emoji: "📍" }
  );
}

/** A small stable tilt (-6° to 6°) per id, so stickers look hand-placed but don't jump around. */
export function tiltFor(id: number | string): number {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (Math.abs(h) % 13) - 6;
}
