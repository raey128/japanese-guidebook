import type { ReactNode } from "react";

/** Emoji + friendly headline + optional body and one action (R16.4). */
export default function EmptyState({
  emoji,
  title,
  children,
  action,
}: {
  emoji: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 py-8 text-center">
      <span aria-hidden="true" className="text-5xl">
        {emoji}
      </span>
      <p className="text-lg font-extrabold">{title}</p>
      {children ? <div className="hint max-w-sm">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
