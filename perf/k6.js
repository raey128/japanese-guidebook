// k6 load test (ticket 12). Run `make synthetic` first, then: k6 run perf/k6.js
// BASE_URL defaults to http://localhost:8000.
import http from "k6/http";
import { check } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:8000";

export const options = {
  scenarios: {
    load: { executor: "constant-vus", vus: 50, duration: "1m" },
  },
  thresholds: {
    "http_req_duration{name:search}": ["p(95)<300"],
    "http_req_duration{name:map}": ["p(95)<300"],
    "http_req_duration{name:duplicates}": ["p(95)<200"],
    http_req_failed: ["rate<0.01"],
  },
};

// Words used by app/synthetic.py to build place names.
const ADJECTIVES = ["Golden", "Quiet", "Little", "Old", "Hidden", "Grand", "Lucky", "Misty", "Red", "Blue",
  "Happy", "Sunny", "Secret", "Royal", "Tiny", "Eastern", "Northern", "Lazy", "Bright", "Calm"];
const NOUNS = ["Dragon", "Lantern", "Crane", "Bamboo", "Maple", "Koi", "Fox", "Tiger", "Sakura", "Fuji",
  "Harbor", "Garden", "Bridge", "Temple", "Pine", "River", "Moon", "Mountain", "Wave", "Lotus"];
const WORDS = ADJECTIVES.concat(NOUNS);

// Rough city bounding boxes (min_lat, min_lng, max_lat, max_lng) of the curated cities.
const CITIES = [
  [35.55, 139.55, 35.82, 139.92], // Tokyo
  [34.90, 135.65, 35.10, 135.85], // Kyoto
  [34.55, 135.35, 34.80, 135.65], // Osaka
  [34.60, 135.70, 34.75, 135.90], // Nara
  [34.30, 132.35, 34.48, 132.58], // Hiroshima
  [36.50, 136.55, 36.62, 136.75], // Kanazawa
  [33.50, 130.30, 33.70, 130.50], // Fukuoka
  [43.00, 141.25, 43.15, 141.45], // Sapporo
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function setup() {
  const jar = http.cookieJar();
  const res = http.post(
    `${BASE}/api/auth/sign-in`,
    JSON.stringify({ username: "k6_user", create: true }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, { "signed in": (r) => r.status === 200 && r.json("status") === "signed_in" });
  const cookies = jar.cookiesForURL(`${BASE}/`);
  const subs = http.get(`${BASE}/api/subcategories`).json();
  return { cookies, subcategoryIds: subs.map((s) => s.id) };
}

export default function (data) {
  const jar = http.cookieJar();
  for (const name of Object.keys(data.cookies)) jar.set(BASE, name, data.cookies[name][0]);

  const r = Math.random();
  if (r < 0.4) {
    const res = http.get(`${BASE}/api/search?q=${encodeURIComponent(pick(WORDS))}`, { tags: { name: "search" } });
    check(res, { "search 200": (x) => x.status === 200 });
  } else if (r < 0.8) {
    const [a, b, c, d] = pick(CITIES);
    const zoom = 8 + Math.floor(Math.random() * 8); // 8-15
    // Narrow the box as we zoom in, around a random point inside the city.
    const span = Math.max(0.005, (c - a) / Math.pow(2, Math.max(0, zoom - 10)));
    const lat = a + Math.random() * (c - a - span);
    const lng = b + Math.random() * (d - b - span);
    const q = `min_lat=${lat}&min_lng=${lng}&max_lat=${lat + span}&max_lng=${lng + span}&zoom=${zoom}`;
    const res = http.get(`${BASE}/api/map?${q}`, { tags: { name: "map" } });
    check(res, { "map 200": (x) => x.status === 200 });
  } else {
    const [a, b, c, d] = pick(CITIES);
    const body = {
      name: `${pick(ADJECTIVES)} ${pick(NOUNS)} Cafe`,
      lat: a + Math.random() * (c - a),
      lng: b + Math.random() * (d - b),
      subcategory_id: pick(data.subcategoryIds),
    };
    const res = http.post(`${BASE}/api/places/duplicates`, JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      tags: { name: "duplicates" },
    });
    check(res, { "duplicates 200": (x) => x.status === 200 });
  }
}
