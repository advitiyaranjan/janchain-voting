import { useState } from "react";
import Button from "../ui/Button";
import Input from "../ui/Input";

const initialState = {
  fullName: "",
  email: "",
  password: "",
  walletAddress: "",
};

function RegisterForm({ onSubmit, isLoading = false }) {
  const [formState, setFormState] = useState(initialState);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSubmit({
      ...formState,
      walletAddress: formState.walletAddress || undefined,
    });
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="block space-y-2 text-sm font-medium text-slate-700">
        <span>Full name</span>
        <Input
          required
          name="fullName"
          value={formState.fullName}
          onChange={handleChange}
          placeholder="Ananya Rao"
        />
      </label>

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
          placeholder="Minimum 8 characters"
        />
      </label>

      <label className="block space-y-2 text-sm font-medium text-slate-700">
        <span>Wallet address (optional)</span>
        <Input
          name="walletAddress"
          value={formState.walletAddress}
          onChange={handleChange}
          placeholder="0x..."
        />
        <span className="block text-xs font-normal text-slate-500">
          Saving a wallet here speeds up onboarding, but you will still verify ownership with a MetaMask signature
          after signing in.
        </span>
      </label>

      <Button className="w-full" variant="accent" disabled={isLoading} type="submit">
        {isLoading ? "Creating account..." : "Create voter account"}
      </Button>
    </form>
  );
}

export default RegisterForm;
