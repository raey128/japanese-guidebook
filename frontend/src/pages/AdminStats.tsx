import { useQuery } from "@tanstack/react-query";

import { api, unwrap } from "../api/client";
import AdminNav from "../components/AdminNav";
import ErrorState from "../components/ui/ErrorState";
import Loading from "../components/ui/Loading";
import { useMe } from "../hooks/auth";

const pct = (n: number, d: number) => (d === 0 ? "–" : `${Math.round((n / d) * 100)}%`);

/** Weekly first-visit funnel from anonymous, self-hosted events (R18.4). */
export default function AdminStats() {
  const me = useMe();
  const isAdmin = Boolean(me.data?.user?.is_admin);
  const q = useQuery({
    queryKey: ["stats"],
    enabled: isAdmin,
    queryFn: async () => unwrap(await api.GET("/api/admin/stats")),
  });
  if (me.isPending) return <Loading />;
  if (!isAdmin) return <p role="alert">Admins only.</p>;
  const weeks = q.data?.weeks ?? [];
  const latest = weeks[0];
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">Stats</h1>
      <AdminNav />
      <p className="hint">
        Anonymous counts from our own server (no third-party analytics). Each row is the group of browsers whose first visit was
        in that week.
      </p>
      {q.isPending ? <Loading /> : null}
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : null}
      {latest ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="First visits" value={String(latest.first_visits)} />
          <Tile label="Opened a place within 2 min" value={pct(latest.opened_within_2min, latest.first_visits)} />
          <Tile label="Saved a place" value={pct(latest.saved, latest.first_visits)} />
          <Tile label="Searches with no result" value={String(latest.searches_no_result)} />
        </div>
      ) : q.data ? (
        <p className="font-bold">No visits recorded yet.</p>
      ) : null}
      {weeks.length > 0 ? (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Weekly funnel</caption>
            <thead>
              <tr className="border-b-2 border-line text-left">
                <th scope="col" className="p-2">Week of</th>
                <th scope="col" className="p-2 text-right">First visits</th>
                <th scope="col" className="p-2 text-right">Opened a place</th>
                <th scope="col" className="p-2 text-right">Within 2 min</th>
                <th scope="col" className="p-2 text-right">Saved</th>
                <th scope="col" className="p-2 text-right">Ranked</th>
                <th scope="col" className="p-2 text-right">No-result searches</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.week} className="border-b border-line">
                  <th scope="row" className="p-2 text-left font-bold">{w.week}</th>
                  <td className="p-2 text-right">{w.first_visits}</td>
                  <td className="p-2 text-right">{w.opened_place} ({pct(w.opened_place, w.first_visits)})</td>
                  <td className="p-2 text-right">{w.opened_within_2min} ({pct(w.opened_within_2min, w.first_visits)})</td>
                  <td className="p-2 text-right">{w.saved} ({pct(w.saved, w.first_visits)})</td>
                  <td className="p-2 text-right">{w.ranked} ({pct(w.ranked, w.first_visits)})</td>
                  <td className="p-2 text-right">{w.searches_no_result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-3xl font-extrabold text-brand">{value}</p>
      <p className="text-sm font-bold text-muted">{label}</p>
    </div>
  );
}
