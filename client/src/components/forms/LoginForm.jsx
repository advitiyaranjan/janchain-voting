import { useState } from "react";
import Button from "../ui/Button";
import Input from "../ui/Input";

const initialState = {
  email: "",
  password: "",
};

function LoginForm({ onSubmit, isLoading = false }) {
  const [formState, setFormState] = useState(initialState);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSubmit(formState);
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="block space-y-2 text-sm font-medium text-slate-700">
        <span>Email address</span>
        <Input
          required
          type="email"
          name="email"
          value={formState.email}
          onChange={handleChange}
          placeholder="voter@example.com"
        />
      </label>

      <label className="block space-y-2 text-sm font-medium text-slate-700">
        <span>Password</span>
        <Input
          required
          type="password"
          name="password"
          value={formState.password}
          onChange={handleChange}
          placeholder="Enter your password"
        />
      </label>

      <Button className="w-full" disabled={isLoading} type="submit">
        {isLoading ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}

export default LoginForm;
