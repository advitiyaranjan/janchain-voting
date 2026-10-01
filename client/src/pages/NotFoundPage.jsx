import { Link } from "react-router-dom";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";

function NotFoundPage() {
  return (
    <div className="page-shell">
      <Card className="hero-grid p-10 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">404</p>
        <h1 className="display-copy mt-4 text-5xl font-bold text-[var(--ink)]">Page not found</h1>
        <p className="mt-4 text-slate-600">The page you requested does not exist in the voting portal.</p>
        <div className="mt-6 flex justify-center">
          <Button as={Link} to="/">Return home</Button>
        </div>
      </Card>
    </div>
  );
}

export default NotFoundPage;
