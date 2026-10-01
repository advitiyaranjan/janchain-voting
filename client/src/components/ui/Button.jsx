import { cn } from "../../lib/utils";

function Button({
  children,
  className,
  type = "button",
  variant = "primary",
  disabled = false,
  as: Component = "button",
  ...props
}) {
  const variants = {
    primary: "bg-[var(--ink)] text-white hover:bg-slate-900",
    secondary: "bg-white/80 text-[var(--ink)] hover:bg-white",
    accent: "bg-[var(--teal)] text-white hover:bg-teal-700",
    ghost: "bg-transparent text-[var(--ink)] hover:bg-slate-100",
    danger: "bg-[var(--rose)] text-white hover:bg-rose-700",
  };

  return (
    <Component
      {...(Component === "button" ? { type, disabled } : {})}
      className={cn(
        "inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export default Button;
