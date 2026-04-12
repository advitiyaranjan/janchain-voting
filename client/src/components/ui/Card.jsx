import { cn } from "../../lib/utils";

function Card({ children, className }) {
  return <div className={cn("surface-card p-6", className)}>{children}</div>;
}

export default Card;
