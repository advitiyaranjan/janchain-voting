import { cn } from "../../lib/utils";

const variants = {
  active: "bg-emerald-100 text-emerald-800",
  scheduled: "bg-amber-100 text-amber-800",
  ended: "bg-slate-200 text-slate-700",
  info: "bg-sky-100 text-sky-800",
  neutral: "bg-white text-slate-700",
};

function Badge({ children, variant = "neutral", className }) {
  return (
    <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", variants[variant], className)}>
      {children}
    </span>
  );
}

export default Badge;
