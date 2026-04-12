import { BrowserProvider, Contract } from "ethers";
import artifact from "../blockchain/DecentralizedVoting.json";

export async function getVotingContract() {
  if (!window.ethereum) {
    throw new Error("MetaMask is required to cast a vote.");
  }

  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("VITE_CONTRACT_ADDRESS is missing.");
  }

  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  return new Contract(contractAddress, artifact.abi, signer);
}

export async function castVote(onChainElectionId, candidateId) {
  const contract = await getVotingContract();
  const tx = await contract.castVote(BigInt(onChainElectionId), BigInt(candidateId));
  await tx.wait();

  return {
    transactionHash: tx.hash,
  };
}
