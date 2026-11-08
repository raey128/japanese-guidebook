/** Top categories with their emoji and colour tokens (R11.6, R16.3). Single source for chips, pins and legend. */
export type TopCategory = "food" | "sights" | "stays" | "experiences";

export interface TopCategoryInfo {
  slug: TopCategory;
  name: string;
  emoji: string;
  color: string;
  colorDark: string;
}

export const TOP_CATEGORY_INFO: TopCategoryInfo[] = [
  { slug: "food", name: "Food", emoji: "🍜", color: "var(--color-food)", colorDark: "var(--color-food-dark)" },
  { slug: "sights", name: "Sights", emoji: "⛩️", color: "var(--color-sights)", colorDark: "var(--color-sights-dark)" },
  { slug: "stays", name: "Stays", emoji: "🏨", color: "var(--color-stays)", colorDark: "var(--color-stays-dark)" },
  {
    slug: "experiences",
    name: "Experiences & Nightlife",
    emoji: "🏮",
    color: "var(--color-experiences)",
    colorDark: "var(--color-experiences-dark)",
  },
];

const BY_SLUG = new Map(TOP_CATEGORY_INFO.map((c) => [c.slug, c]));

export function topCategoryInfo(slug: string | null | undefined): TopCategoryInfo | undefined {
  return slug ? BY_SLUG.get(slug as TopCategory) : undefined;
}

export function isTopCategory(slug: string): slug is TopCategory {
  return BY_SLUG.has(slug as TopCategory);
}
