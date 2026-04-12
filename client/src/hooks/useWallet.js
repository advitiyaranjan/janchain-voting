import { useEffect, useState } from "react";
import { BrowserProvider } from "ethers";
import { getExpectedChainConfig, isExpectedChain } from "../lib/chain";

function isUnknownChainError(error) {
  const message = error?.message || "";
  return (
    error?.code === 4902 ||
    /unrecognized chain/i.test(message) ||
    /unknown chain/i.test(message) ||
    /could not find chain/i.test(message)
  );
}

export function useWallet() {
  const [walletAddress, setWalletAddress] = useState("");
  const [chainId, setChainId] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const expectedChain = getExpectedChainConfig();

  useEffect(() => {
    if (!window.ethereum) {
      return undefined;
    }

    const handleAccountsChanged = (accounts) => {
      setWalletAddress(accounts[0] || "");
    };

    const handleChainChanged = (nextChainId) => {
      setChainId(nextChainId);
    };

    window.ethereum.request({ method: "eth_accounts" }).then(handleAccountsChanged).catch(() => {});
    window.ethereum.request({ method: "eth_chainId" }).then(handleChainChanged).catch(() => {});

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) {
      throw new Error("MetaMask is required to continue.");
    }

    setIsConnecting(true);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const network = await provider.getNetwork();
      setWalletAddress(accounts[0] || "");
      setChainId(`0x${network.chainId.toString(16)}`);
      return accounts[0] || "";
    } finally {
      setIsConnecting(false);
    }
  };

  const ensureExpectedNetwork = async () => {
    if (!window.ethereum) {
      throw new Error("MetaMask is required.");
    }

    if (isExpectedChain(chainId)) {
      return;
    }

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: expectedChain.hexChainId }],
      });
    } catch (error) {
      if (!isUnknownChainError(error)) {
        throw error;
      }

      if (!expectedChain.rpcUrls.length) {
        throw new Error(`Add ${expectedChain.chainName} to MetaMask manually, then try again.`);
      }

      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: expectedChain.hexChainId,
            chainName: expectedChain.chainName,
            rpcUrls: expectedChain.rpcUrls,
            blockExplorerUrls: expectedChain.blockExplorerUrls,
            nativeCurrency: expectedChain.nativeCurrency,
          },
        ],
      });
    }

    setChainId(expectedChain.hexChainId);
  };

  const signMessage = async (message) => {
    if (!window.ethereum) {
      throw new Error("MetaMask is required.");
    }

    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return signer.signMessage(message);
  };

  return {
    walletAddress,
    chainId,
    isConnecting,
    hasWallet: typeof window !== "undefined" && Boolean(window.ethereum),
    expectedChain,
    isExpectedNetwork: isExpectedChain(chainId),
    connectWallet,
    ensureExpectedNetwork,
    signMessage,
  };
}
