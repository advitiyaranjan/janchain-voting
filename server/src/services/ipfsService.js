const env = require("../config/env");

function buildMetadataName(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function uploadElectionMetadata(metadata) {
  if (!env.pinataJwt) {
    return "";
  }

  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.pinataJwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataMetadata: {
        name: `election-${buildMetadataName(metadata.title)}`,
      },
      pinataContent: metadata,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Pinata upload failed: ${error}`);
  }

  const result = await response.json();
  return `ipfs://${result.IpfsHash}`;
}

module.exports = {
  uploadElectionMetadata,
};
