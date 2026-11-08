import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

/** Selectable pill (R16.2). `color`/`colorDark` are CSS colours (usually category tokens). */
export default function Chip({
  pressed,
  emoji,
  color,
  colorDark,
  children,
  className = "",
  ...rest
}: {
  pressed: boolean;
  emoji?: string;
  color?: string;
  colorDark?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color">) {
  const style = {
    ...(color ? { "--chip": color } : {}),
    ...(colorDark ? { "--chip-dark": colorDark } : {}),
  } as CSSProperties;
  return (
    <button type="button" aria-pressed={pressed} className={`chip ${className}`} style={style} {...rest}>
      {emoji ? <span aria-hidden="true">{emoji}</span> : null}
      {children}
    </button>
  );
}
