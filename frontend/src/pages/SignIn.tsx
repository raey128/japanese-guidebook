import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { api } from "../api/client";
import LicenceNotice from "../components/LicenceNotice";

type Pending = { username: string } | null;

export default function SignIn() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Pending>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const inputId = useId();
  const errorId = useId();

  const signIn = useMutation({
    mutationFn: async (vars: { username: string; create: boolean }) => {
      const { data, error } = await api.POST("/api/auth/sign-in", { body: vars });
      if (error) throw new Error((error as { detail?: string }).detail ?? "Sign-in failed.");
      return data!;
    },
    onSuccess: async (data) => {
      if (data.status === "needs_confirmation") {
        setConfirm({ username: data.username });
        return;
      }
      await qc.invalidateQueries();
      navigate(params.get("next") || "/");
    },
    onError: (e: Error) => setError(e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirm(null);
    signIn.mutate({ username, create: false });
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-3xl font-extrabold">Sign in</h1>
      <p className="hint">
        Just pick a username. No password or email is needed.
      </p>
      <form onSubmit={submit} className="space-y-2" noValidate>
        <label htmlFor={inputId} className="label">
          Username
        </label>
        <input
          id={inputId}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className="field"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <p className="text-xs text-muted">3–20 characters: lowercase letters, digits, underscores.</p>
        {error && (
          <p id={errorId} role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={signIn.isPending || !username.trim()}
          className="btn btn-primary w-full"
        >
          Continue
        </button>
      </form>

      {confirm && (
        <div role="dialog" aria-labelledby="confirm-title" className="card space-y-3">
          <p id="confirm-title" className="font-medium">
            Create account <strong>{confirm.username}</strong>?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              autoFocus
              className="btn btn-primary btn-sm"
              onClick={() => signIn.mutate({ username: confirm.username, create: true })}
            >
              Create account
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <LicenceNotice />
    </div>
  );
}
