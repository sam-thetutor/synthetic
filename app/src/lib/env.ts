export function getEnvConfig() {
  const required = {
    OPERATOR_PRIVATE_KEY: process.env.OPERATOR_PRIVATE_KEY,
    RECIPIENT_ADDRESS: process.env.RECIPIENT_ADDRESS,
    CUSD_CONTRACT_ADDRESS: process.env.CUSD_CONTRACT_ADDRESS,
    PAPERCLIP_API_URL: process.env.PAPERCLIP_API_URL,
  };

  const missing = Object.entries(required)
    .filter(([, v]) => !v || v.includes("YOUR_"))
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  return {
    operatorPrivateKey: required.OPERATOR_PRIVATE_KEY as `0x${string}`,
    recipientAddress: required.RECIPIENT_ADDRESS as `0x${string}`,
    cusdContractAddress: required.CUSD_CONTRACT_ADDRESS as `0x${string}`,
    paperclipApiUrl: required.PAPERCLIP_API_URL!,
    celoRpcUrl: process.env.NEXT_PUBLIC_CELO_RPC_URL || "https://forno.celo.org",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    openrouterApiKey: process.env.OPENROUTER_API_KEY || "",
    thirdwebClientId: process.env.THIRDWEB_CLIENT_ID || "",
    thirdwebSecretKey: process.env.THIRDWEB_SECRET_KEY || "",
  };
}
