import { useEffect, useId, useState } from "react";

import { useAddressSearch } from "../../hooks/places";
import type { LatLng } from "./geo";

export default function AddressSearch({ onPick }: { onPick: (p: LatLng, label: string) => void }) {
  const id = useId();
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 400);
    return () => clearTimeout(t);
  }, [text]);
  const search = useAddressSearch(debounced);
  const active = debounced.trim().length >= 2 && debounced === text;

  let status = "";
  if (active && search.isFetching) status = "Searching…";
  else if (active && search.isError) status = "Address search is unavailable. Tap the map instead.";
  else if (active && search.data) status = search.data.results.length ? `${search.data.results.length} results` : "No results found.";

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        Search for an address
      </label>
      <input
        id={id}
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        autoComplete="off"
        className="mt-1 w-full rounded border border-stone-400 px-2 py-1.5"
      />
      <p aria-live="polite" className="mt-1 text-sm text-stone-700">
        {status}
      </p>
      {active && search.data && search.data.results.length > 0 && (
        <ul className="mt-1 divide-y divide-stone-200 rounded border border-stone-300">
          {search.data.results.map((r, i) => (
            <li key={`${r.lat},${r.lng},${i}`}>
              <button
                type="button"
                className="w-full px-2 py-2 text-left text-sm hover:bg-stone-100"
                onClick={() => {
                  onPick({ lat: r.lat, lng: r.lng }, r.label);
                  setText("");
                  setDebounced("");
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
