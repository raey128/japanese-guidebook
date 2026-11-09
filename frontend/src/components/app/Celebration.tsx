import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Celebration = { title: string; big: boolean; confetti: boolean };
const Ctx = createContext<{ celebrate: (title: string, opts?: { big?: boolean; confetti?: boolean }) => void } | null>(null);

const COLORS = ["#d93a1f", "#b45309", "#0b7a75", "#1971c2", "#6741d9", "#237a35", "#f59f00"];

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** A tiny dependency-free confetti burst on a canvas (~1.5s). */
function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = (canvas.width = window.innerWidth);
    const h = (canvas.height = window.innerHeight);
    const parts = Array.from({ length: 120 }, () => ({
      x: w / 2,
      y: h * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: Math.random() * -14 - 4,
      r: Math.random() * 6 + 4,
      c: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      a: Math.random() * Math.PI,
    }));
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.45;
        p.x += p.vx;
        p.y += p.vy;
        p.a += 0.2;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = Math.max(0, 1 - frame / 90);
        ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        ctx.restore();
      }
      if (frame < 90) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} aria-hidden="true" data-testid="confetti" className="pointer-events-none fixed inset-0 z-[60]" />;
}

/** Cheerful, non-blocking celebration (R16.5). Reduced motion: message only, no confetti or bounce. */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(Celebration & { key: number }) | null>(null);

  const celebrate = useCallback((title: string, opts: { big?: boolean; confetti?: boolean } = {}) => {
    const reduce = prefersReducedMotion();
    setCurrent({ title, big: opts.big ?? false, confetti: (opts.confetti ?? true) && !reduce, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setCurrent(null), current.big ? 2600 : 1800);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCurrent(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [current]);

  return (
    <Ctx.Provider value={{ celebrate }}>
      {children}
      <div aria-live="polite" className="sr-only">
        {current?.title ?? ""}
      </div>
      {current ? (
        <>
          {current.confetti ? <Confetti key={current.key} /> : null}
          <div className="pointer-events-none fixed inset-x-0 top-20 z-[61] flex justify-center px-4">
            <button
              type="button"
              onClick={() => setCurrent(null)}
              className={`pointer-events-auto card border-success-dark bg-success-soft px-5 py-3 text-center font-extrabold text-success-dark shadow-lg motion-safe:animate-bounce ${
                current.big ? "text-xl" : "text-base"
              }`}
              style={{ animationIterationCount: 1 }}
            >
              {current.title}
              <span className="sr-only"> (dismiss)</span>
            </button>
          </div>
        </>
      ) : null}
    </Ctx.Provider>
  );
}

export function useCelebrate() {
  const ctx = useContext(Ctx);
  // Outside the provider (e.g. isolated component tests) celebrations are a no-op.
  return ctx?.celebrate ?? (() => undefined);
}
