/**
 * User-facing copy (R16.4). Friendly, second person, plain words, no jargon.
 * Never say "pin" to users (R17.1): saving is "Save ♡", creating is "Add a place".
 */
export const COPY = {
  appName: "Japanese Guidebook",
  searchPlaceholder: "Where to?",
  loading: "Loading…",
  loadError: "Hmm, that didn't load. Try again?",
  retry: "Try again",
  notFound: "We couldn't find that page.",

  save: "Save",
  saved: "Saved",
  addPlace: "Add a place",
  rank: "Rank it",
  reRank: "Re-rank",
  directions: "Directions",
  viewDetails: "View details",
  nearMe: "Near me",

  emptyRanked: "Nothing ranked here yet. Be the first!",
  emptySaved: "No saved spots yet. Tap the bookmark on any place to save it.",
  emptyMine: "You haven't ranked anything yet. Find a place you've been and rank it!",
  signInToSee: "to see your lists.",
  pickUsername: "Pick a username to save places",

  topPicks: "Top picks here",
  teamPicks: "Team picks",
  nearbyPicks: "Places to explore",
  locationDenied: "We couldn't get your location. You can still explore by moving the map.",
} as const;
