import type { Schemas } from "../../api/client";
import type { PlaceFlagInput } from "../../hooks/moderation";

type Place = Pick<Schemas["PlaceSummary"], "name" | "name_ja" | "subcategory" | "location">;
export type FlagType = PlaceFlagInput["flag_type"];

export interface FlagForm {
  type: FlagType | null;
  lat: string;
  lng: string;
  name: string;
  nameJa: string;
  subcategoryId: string;
  locationId: string;
  duplicateId: number | null;
}

/** Builds the request body, or an error message when the form is incomplete. */
export function buildFlagBody(place: Place, form: FlagForm): { body: PlaceFlagInput } | { error: string } {
  switch (form.type) {
    case null:
      return { error: "Choose what is wrong." };
    case "closed":
    case "spam":
      return { body: { flag_type: form.type } };
    case "wrong_location": {
      const lat = Number(form.lat);
      const lng = Number(form.lng);
      if (form.lat.trim() === "" || form.lng.trim() === "" || !Number.isFinite(lat) || !Number.isFinite(lng))
        return { error: "Enter a latitude and longitude." };
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { error: "Coordinates are out of range." };
      return { body: { flag_type: "wrong_location", payload: { lat, lng } } };
    }
    case "wrong_info": {
      const payload: { name?: string; name_ja?: string; subcategory_id?: number; location_id?: number } = {};
      if (form.name.trim() && form.name.trim() !== place.name) payload.name = form.name.trim();
      if (form.nameJa.trim() !== (place.name_ja ?? "")) payload.name_ja = form.nameJa.trim();
      if (form.subcategoryId && Number(form.subcategoryId) !== place.subcategory.id)
        payload.subcategory_id = Number(form.subcategoryId);
      if (form.locationId && Number(form.locationId) !== place.location.id)
        payload.location_id = Number(form.locationId);
      if (Object.keys(payload).length === 0) return { error: "Suggest a correction to at least one field." };
      return { body: { flag_type: "wrong_info", payload } };
    }
    case "duplicate":
      if (form.duplicateId === null) return { error: "Pick the place this duplicates." };
      return { body: { flag_type: "duplicate", payload: { other_place_id: form.duplicateId } } };
  }
}
