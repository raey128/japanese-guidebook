import { Link, useSearchParams } from "react-router";

import AllLists from "../components/lists/AllLists";
import MyRankingsList from "../components/lists/MyRankingsList";
import WantToGoList from "../components/lists/WantToGoList";
import { ButtonLink } from "../components/ui/Button";
import Chip from "../components/ui/Chip";
import { PlusIcon } from "../components/ui/icons";
import Loading from "../components/ui/Loading";
import { COPY } from "../copy";
import { useMe } from "../hooks/auth";
import { useWheelScrollX } from "../lib/useWheelScrollX";

export type ListsTab = "all" | "mine" | "want_to_go";

const TABS: { value: ListsTab; label: string }[] = [
  { value: "all", label: "Rankings" },
  { value: "mine", label: "My ratings" },
  { value: "want_to_go", label: "Saved" },
];

export function parseTab(v: string | null): ListsTab {
  return v === "mine" || v === "want_to_go" ? v : "all";
}

/** One Beli-style Lists tab: public lists, my rankings and want-to-go in one place (R14). */
export default function Lists() {
  const wheelRow = useWheelScrollX<HTMLDivElement>();
  const [sp, setSp] = useSearchParams();
  const tab = parseTab(sp.get("tab"));
  const me = useMe();
  const signedIn = !!me.data?.user;

  const select = (t: ListsTab) => {
    // Each segment owns its own params; drop the others' so URLs stay clean.
    const next = new URLSearchParams();
    if (t !== "all") next.set("tab", t);
    else {
      for (const k of ["city", "category"]) {
        const v = sp.get(k);
        if (v) next.set(k, v);
      }
    }
    setSp(next, { replace: true });
  };

  const label = TABS.find((t) => t.value === tab)!.label;

  return (
    <div className="space-y-4">
      {/* The tab bar already says "Lists": the heading is for screen readers only. */}
      <h1 className="sr-only">Lists</h1>
      {/* Segments on the left, Add a place on the right, on one line. */}
      <div className="flex items-center gap-3">
        <div ref={wheelRow} role="group" aria-label="List" className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
          {TABS.map((t) => (
            <Chip key={t.value} pressed={tab === t.value} onClick={() => select(t.value)}>
              {t.label}
            </Chip>
          ))}
        </div>
        {/* Adding happens on the map; this opens it with the Add panel ready (R14.8). */}
        <ButtonLink to="/?add=1" size="sm" className="shrink-0">
          <PlusIcon /> {COPY.addPlace}
        </ButtonLink>
      </div>

      <section aria-label={label}>
        {tab === "all" ? (
          <AllLists />
        ) : me.isPending ? (
          <Loading />
        ) : !signedIn ? (
          <p>
            <Link className="link" to={`/sign-in?next=${encodeURIComponent(`/lists?tab=${tab}`)}`}>
              Sign in
            </Link>{" "}
            {COPY.signInToSee}
          </p>
        ) : tab === "mine" ? (
          <MyRankingsList />
        ) : (
          <WantToGoList />
        )}
      </section>
    </div>
  );
}
