import { buildFlagBody } from "./flagBody";

const place = {
  name: "Ramen Ya",
  name_ja: null,
  subcategory: { id: 1, slug: "ramen", name: "Ramen", top_category: "food" as const },
  location: { id: 5, slug: "asakusa", name: "Asakusa", name_ja: null, city_id: 1, is_catch_all: false, lat: null, lng: null },
};
const base = { type: null, lat: "35.7", lng: "139.8", name: "Ramen Ya", nameJa: "", subcategoryId: "1", locationId: "5", duplicateId: null };

describe("buildFlagBody", () => {
  it("requires a type", () => {
    expect("error" in buildFlagBody(place, base)).toBe(true);
  });
  it("closed has no payload", () => {
    expect(buildFlagBody(place, { ...base, type: "closed" })).toEqual({ body: { flag_type: "closed" } });
  });
  it("wrong_location validates and parses coordinates", () => {
    expect(buildFlagBody(place, { ...base, type: "wrong_location" })).toEqual({
      body: { flag_type: "wrong_location", payload: { lat: 35.7, lng: 139.8 } },
    });
    expect("error" in buildFlagBody(place, { ...base, type: "wrong_location", lat: "95" })).toBe(true);
    expect("error" in buildFlagBody(place, { ...base, type: "wrong_location", lng: "" })).toBe(true);
  });
  it("wrong_info sends only changed fields and rejects no change", () => {
    expect("error" in buildFlagBody(place, { ...base, type: "wrong_info" })).toBe(true);
    expect(
      buildFlagBody(place, { ...base, type: "wrong_info", name: "Ramen Yaa", nameJa: "ラーメン屋", locationId: "6" }),
    ).toEqual({
      body: { flag_type: "wrong_info", payload: { name: "Ramen Yaa", name_ja: "ラーメン屋", location_id: 6 } },
    });
  });
  it("duplicate needs a pick", () => {
    expect("error" in buildFlagBody(place, { ...base, type: "duplicate" })).toBe(true);
    expect(buildFlagBody(place, { ...base, type: "duplicate", duplicateId: 9 })).toEqual({
      body: { flag_type: "duplicate", payload: { other_place_id: 9 } },
    });
  });
});
