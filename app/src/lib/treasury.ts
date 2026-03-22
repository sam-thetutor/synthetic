import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ENCRYPTION_ALGO = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const secret = process.env.TREASURY_ENCRYPTION_SECRET;
  if (!secret || secret.includes("YOUR_")) {
    throw new Error(
      "Missing TREASURY_ENCRYPTION_SECRET environment variable for treasury key encryption"
    );
  }

  return scryptSync(secret, "company-treasury-salt", 32);
}

export function encryptPrivateKey(privateKey: `0x${string}`): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ENCRYPTION_ALGO, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(privateKey, "utf8")),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `v1:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptPrivateKey(encryptedPayload: string): `0x${string}` {
  const [version, ivHex, authTagHex, encryptedHex] = encryptedPayload.split(":");

  if (version !== "v1" || !ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Invalid encrypted treasury key format");
  }

  const key = getEncryptionKey();
  const decipher = createDecipheriv(
    ENCRYPTION_ALGO,
    key,
    Buffer.from(ivHex, "hex")
  );

  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8") as `0x${string}`;
}

export function createCompanyTreasuryWallet(): {
  address: `0x${string}`;
  encryptedPrivateKey: string;
} {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  return {
    address: account.address,
    encryptedPrivateKey: encryptPrivateKey(privateKey),
  };
}
