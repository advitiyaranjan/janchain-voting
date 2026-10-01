import { cn } from "../../lib/utils";

function Card({ children, className, ...props }) {
  return <div className={cn("surface-card p-6", className)} {...props}>{children}</div>;
}

export default Card;
