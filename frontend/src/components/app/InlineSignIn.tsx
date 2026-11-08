import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

import { api } from "../../api/client";
import { COPY } from "../../copy";
import { useMe } from "../../hooks/auth";
import Button from "../ui/Button";

/** Same rules as the backend (R1.2); the server stays the authority. */
export function usernameProblem(name: string): string | null {
  if (name.length < 3 || name.length > 20) return "Use 3–20 characters.";
  if (!/^[a-z0-9_]+$/.test(name)) return "Use lowercase letters, digits and underscores only.";
  return null;
}

type Action = () => void;
const Ctx = createContext<{ requireUser: (action: Action, reason?: string) => void } | null>(null);

/**
 * Lets any control run a signed-in action from a signed-out start without leaving the page (R17.3):
 * `requireUser(() => save())` runs at once when signed in, or opens a one-field username panel and
 * runs the action right after the account is created or signed in.
 */
export function InlineSignInProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const qc = useQueryClient();
  const [pending, setPending] = useState<{ action: Action; reason: string } | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const errId = useId();

  const requireUser = useCallback(
    (action: Action, reason: string = COPY.pickUsername) => {
      if (me.data?.user) action();
      else {
        setError(null);
        setPending({ action, reason });
      }
    },
    [me.data?.user],
  );

  useEffect(() => {
    if (pending) inputRef.current?.focus();
  }, [pending]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const username = name.trim().toLowerCase();
    const problem = usernameProblem(username);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Sign in if it exists, otherwise create it: one step, no confirmation screen.
      let res = await api.POST("/api/auth/sign-in", { body: { username, create: false } });
      if (!res.error && res.data?.status === "needs_confirmation") {
        res = await api.POST("/api/auth/sign-in", { body: { username, create: true } });
      }
      if (res.error) throw new Error((res.error as { detail?: string }).detail ?? "That didn't work. Try another name?");
      await qc.invalidateQueries();
      await qc.refetchQueries({ queryKey: ["me"] });
      const action = pending?.action;
      setPending(null);
      setName("");
      action?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Ctx.Provider value={{ requireUser }}>
      {children}
      {pending ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" onClick={() => setPending(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="card w-full max-w-sm space-y-3 rounded-b-none sm:rounded-b-(--radius-card)"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPending(null);
            }}
          >
            <p id={titleId} className="text-xl font-extrabold">
              <span aria-hidden="true">👋 </span>
              {pending.reason}
            </p>
            <p className="hint">No password or email. Just a name others will see on your rankings.</p>
            <form onSubmit={submit} className="space-y-2" noValidate>
              <label htmlFor={`${titleId}-u`} className="label">
                Username
              </label>
              <input
                id={`${titleId}-u`}
                ref={inputRef}
                className="field"
                autoCapitalize="none"
                autoComplete="username"
                spellCheck={false}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errId : undefined}
              />
              {error ? (
                <p id={errId} role="alert" className="text-sm font-bold text-danger">
                  {error}
                </p>
              ) : null}
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={busy || !name.trim()} className="flex-1">
                  Let's go
                </Button>
                <Button variant="ghost" onClick={() => setPending(null)}>
                  Not now
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}

const passthrough = { requireUser: (action: Action) => action() };

export function useInlineSignIn() {
  // Outside the provider (isolated component tests) actions just run.
  return useContext(Ctx) ?? passthrough;
}
