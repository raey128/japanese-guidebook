import { detectPlatform, directionsUrl, walkLabel, walkMinutes } from "./walk";

const asakusa = { lat: 35.712, lng: 139.796 };

test("walk minutes = straight line × 1.3 ÷ 80 m/min, rounded up, at least 1", () => {
  expect(walkMinutes(asakusa, asakusa)).toBe(1);
  const oneKmNorth = { lat: asakusa.lat + 1000 / 111_195, lng: asakusa.lng };
  expect(walkMinutes(asakusa, oneKmNorth)).toBe(Math.ceil((1000 * 1.3) / 80)); // 17
});

test("over 30 minutes shows the distance instead", () => {
  const threeKm = { lat: asakusa.lat + 3000 / 111_195, lng: asakusa.lng };
  expect(walkLabel(asakusa, threeKm)).toBe("3.0 km");
});

test.each([
  ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5, "ios"],
  ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5, "ios"], // iPadOS desktop UA
  ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0, "desktop"],
  ["Mozilla/5.0 (Linux; Android 14; Pixel 8)", 5, "android"],
  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0, "desktop"],
] as const)("detectPlatform(%s, %d) = %s", (ua, touch, expected) => {
  expect(detectPlatform(ua, touch)).toBe(expected);
});

test("directions never point at Google", () => {
  const place = { lat: 35.7148, lng: 139.7967, name: "Senso-ji & Co" };
  const ios = directionsUrl(place, "ios");
  const android = directionsUrl(place, "android");
  const desktop = directionsUrl(place, "desktop");
  expect(ios).toBe("https://maps.apple.com/?daddr=35.714800,139.796700&q=Senso-ji%20%26%20Co");
  expect(android).toBe("geo:35.714800,139.796700?q=35.714800,139.796700(Senso-ji%20%26%20Co)");
  expect(desktop).toBe(
    "https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=%3B35.714800%2C139.796700#map=17/35.714800/139.796700",
  );
  for (const u of [ios, android, desktop]) expect(u).not.toMatch(/google/i);
});
