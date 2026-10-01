import clsx from "clsx";

export function cn(...values) {
  return clsx(values);
}

export function formatDateTime(value) {
  if (value == null || !Number.isFinite(new Date(value).getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function shortenAddress(address = "") {
  if (!address) {
    return "Not linked";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function shortenHash(hash = "") {
  if (!hash) {
    return "Unavailable";
  }

  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

export function buildExplorerUrl(hash) {
  const baseUrl = import.meta.env.VITE_BLOCK_EXPLORER_URL;
  if (!baseUrl || !hash) {
    return "";
  }

  return `${baseUrl.replace(/\/$/, "")}/tx/${hash}`;
}

export function buildAddressExplorerUrl(address) {
  const baseUrl = import.meta.env.VITE_BLOCK_EXPLORER_URL;
  if (!baseUrl || !address) {
    return "";
  }

  return `${baseUrl.replace(/\/$/, "")}/address/${address}`;
}
