import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";

export type ButtonVariant = "primary" | "secondary" | "danger" | "success" | "ghost";

interface Common {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: boolean;
  className?: string;
  children: ReactNode;
}

export function buttonClass({ variant = "primary", size = "md", icon = false, className = "" }: Omit<Common, "children">) {
  return ["btn", `btn-${variant}`, size === "sm" ? "btn-sm" : "", icon ? "btn-icon" : "", className].filter(Boolean).join(" ");
}

/** Chunky press-down button (R16.2). */
export default function Button({
  variant,
  size,
  icon,
  className,
  type = "button",
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={buttonClass({ variant, size, icon, className })} {...rest} />;
}

/** A router link that looks like a Button. */
export function ButtonLink({ variant, size, icon, className, ...rest }: Common & LinkProps) {
  return <Link className={buttonClass({ variant, size, icon, className })} {...rest} />;
}
