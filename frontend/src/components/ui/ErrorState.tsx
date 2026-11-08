import { COPY } from "../../copy";
import Button from "./Button";

/** Plain-words error with a retry (R16.4). */
export default function ErrorState({ message = COPY.loadError, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-wrap items-center gap-3 border-danger/40 bg-red-50">
      <span aria-hidden="true" className="text-2xl">😕</span>
      <p className="flex-1 font-bold">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {COPY.retry}
        </Button>
      ) : null}
    </div>
  );
}
