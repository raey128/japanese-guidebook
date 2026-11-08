import { useState } from "react";
import { Link } from "react-router";

import { ApiError } from "../api/client";
import { adminErrorMessage } from "../components/moderation/errors";
import { useSeeds, useSetSeedReviewed } from "../hooks/moderation";

export default function SeedReview() {
  const [city, setCity] = useState("");
  const q = useSeeds(city);
  const toggle = useSetSeedReviewed();
  const err = q.error instanceof ApiError ? q.error : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">Seed review</h1>
        <Link to="/admin" className="underline">
          Moderation queue
        </Link>
      </div>

      {err?.status === 401 ? (
        <p role="alert">
          Please <Link to="/sign-in?next=/admin/seeds" className="underline">sign in</Link> to continue.
        </p>
      ) : err?.status === 403 ? (
        <p role="alert">Admins only.</p>
      ) : (
        <>
          {q.isPending && <p>Loading…</p>}
          {q.error && !err && <p role="alert">Couldn't load seed places.</p>}
          {q.data && (
            <>
              <label className="mb-3 block text-sm">
                City
                <select
                  className="ml-2 rounded border border-stone-400 px-2 py-1.5"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                >
                  <option value="">All cities</option>
                  {q.data.counts.map((c) => (
                    <option key={c.city.slug} value={c.city.slug}>
                      {c.city.name}
                    </option>
                  ))}
                </select>
              </label>

              <table className="mb-4 w-full text-left text-sm">
                <caption className="sr-only">Seed places per city</caption>
                <thead>
                  <tr className="border-b border-stone-400">
                    <th scope="col" className="py-1">City</th>
                    <th scope="col" className="py-1 text-right">Total</th>
                    <th scope="col" className="py-1 text-right">Unreviewed</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.counts.map((c) => (
                    <tr key={c.city.slug} className="border-b border-stone-200">
                      <th scope="row" className="py-1 font-normal">{c.city.name}</th>
                      <td className="py-1 text-right">{c.total}</td>
                      <td className="py-1 text-right">{c.unreviewed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div aria-live="polite">
                {toggle.error && (
                  <p role="alert" className="mb-2 text-red-800">
                    {adminErrorMessage(toggle.error)}
                  </p>
                )}
              </div>
              {q.data.items.length === 0 && <p>No seed places.</p>}
              <ul className="divide-y divide-stone-200">
                {q.data.items.map(({ place, reviewed }) => (
                  <li key={place.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <Link to={`/places/${place.id}`} className="font-medium underline">
                        {place.name}
                      </Link>
                      {place.name_ja && (
                        <span lang="ja" className="ml-2">
                          {place.name_ja}
                        </span>
                      )}
                      <p className="text-sm text-stone-700">
                        {place.subcategory.name} · {place.location.name}, {place.city.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Link to={`/places/${place.id}/edit`} className="text-sm underline">
                        Edit<span className="sr-only"> {place.name}</span>
                      </Link>
                      <label className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={reviewed}
                          disabled={toggle.isPending}
                          onChange={(e) => toggle.mutate({ placeId: place.id, reviewed: e.target.checked })}
                        />
                        Reviewed<span className="sr-only"> {place.name}</span>
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
