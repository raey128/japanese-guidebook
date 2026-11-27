import type { Schemas } from "../../api/client";
import PlaceArt from "../ui/PlaceArt";

/** A list's card picture: its first place's photo or poster art, or a plain gradient. */
export default function ListCover({ cover, id, className = "" }: { cover: Schemas["PlaceSummary"] | null | undefined; id: number; className?: string }) {
  if (cover) {
    return (
      <PlaceArt id={cover.id} subcategorySlug={cover.subcategory.slug} topCategory={cover.subcategory.top_category} image={cover.image} className={className} />
    );
  }
  return <PlaceArt id={id} subcategorySlug="" topCategory={null} className={className} />;
}
