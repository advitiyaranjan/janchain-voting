export function getExpectedChainConfig() {
  const chainId = Number(import.meta.env.VITE_CHAIN_ID || 31337);
  const rpcUrl = import.meta.env.VITE_RPC_URL || (chainId === 31337 ? "http://127.0.0.1:8545" : "");
  const chainName = import.meta.env.VITE_CHAIN_NAME || (chainId === 31337 ? "Hardhat Local" : "Custom Network");
  const blockExplorerUrl = import.meta.env.VITE_BLOCK_EXPLORER_URL || "";

  return {
    chainId,
    hexChainId: `0x${chainId.toString(16)}`,
    chainName,
    rpcUrls: rpcUrl ? [rpcUrl] : [],
    blockExplorerUrls: blockExplorerUrl ? [blockExplorerUrl] : [],
    nativeCurrency: {
      name: import.meta.env.VITE_CURRENCY_NAME || "Ether",
      symbol: import.meta.env.VITE_CURRENCY_SYMBOL || "ETH",
      decimals: 18,
    },
  };
}

export function isExpectedChain(chainId) {
  const expected = getExpectedChainConfig().hexChainId.toLowerCase();
  return Boolean(chainId && chainId.toLowerCase() === expected);
}
