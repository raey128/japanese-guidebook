import { useState } from "react";
import { Link, useSearchParams } from "react-router";

import { useInlineSignIn } from "../components/app/InlineSignIn";
import CommunityLists from "../components/lists/CommunityLists";
import CreateListDialog from "../components/lists/CreateListDialog";
import MySharedLists from "../components/lists/MySharedLists";
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

export type ListsTab = "all" | "community" | "mine" | "want_to_go" | "shared";

const TABS: { value: ListsTab; label: string }[] = [
  { value: "all", label: "Rankings" },
  { value: "community", label: "Community" },
  { value: "mine", label: "Been there" },
  { value: "want_to_go", label: "Want to go" },
  { value: "shared", label: "Shared lists" },
];

export function parseTab(v: string | null): ListsTab {
  return v === "mine" || v === "want_to_go" || v === "shared" || v === "community" ? v : "all";
}

/** One Beli-style Lists tab: public lists, my rankings and want-to-go in one place (R14). */
export default function Lists() {
  const wheelRow = useWheelScrollX<HTMLDivElement>();
  const [sp, setSp] = useSearchParams();
  const tab = parseTab(sp.get("tab"));
  const me = useMe();
  const signedIn = !!me.data?.user;
  const { requireUser } = useInlineSignIn();
  const [creating, setCreating] = useState(false);
  const newList = () => requireUser(() => setCreating(true), "Pick a username to make a list");

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
      {/* The two things you do here, big and bright (decided 2026-11-27). */}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={newList} className="btn btn-primary min-h-16 text-lg shadow-md">
          <PlusIcon className="size-5" /> New list
        </button>
        {/* Adding happens on the map; this opens it with the Add panel ready (R14.8). */}
        <ButtonLink to="/?add=1" variant="success" className="min-h-16 text-lg shadow-md">
          <span aria-hidden="true">📍</span> {COPY.addPlace}
        </ButtonLink>
      </div>
      <div ref={wheelRow} role="group" aria-label="List" className="flex gap-2 overflow-x-auto py-1">
        {TABS.map((t) => (
          <Chip key={t.value} pressed={tab === t.value} onClick={() => select(t.value)}>
            {t.label}
          </Chip>
        ))}
      </div>
      {creating ? <CreateListDialog onClose={() => setCreating(false)} /> : null}

      <section aria-label={label}>
        {tab === "all" ? (
          <AllLists />
        ) : tab === "community" ? (
          <CommunityLists onNew={newList} />
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
        ) : tab === "shared" ? (
          <MySharedLists onNew={newList} />
        ) : (
          <WantToGoList />
        )}
      </section>
    </div>
  );
}
