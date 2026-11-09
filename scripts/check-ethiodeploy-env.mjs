import { createECDH } from "node:crypto";

const required = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "ADMIN_BOOTSTRAP_USERNAME",
  "ADMIN_BOOTSTRAP_PASSWORD",
  "OPENAI_API_KEY",
  "POLAR_LIVE_ACCESS_TOKEN",
  "POLAR_LIVE_WEBHOOK_SECRET",
  "PUBLIC_APP_ORIGIN",
  "RENEWAL_VAPID_PUBLIC_KEY",
  "RENEWAL_VAPID_PRIVATE_KEY",
  "RENEWAL_VAPID_SUBJECT",
];

const missing = required.filter((name) => !process.env[name]?.trim());
const invalid = [];

if (process.env.SESSION_SECRET && Buffer.byteLength(process.env.SESSION_SECRET) < 32) {
  invalid.push("SESSION_SECRET (must be at least 32 bytes)");
}

if (process.env.ADMIN_BOOTSTRAP_USERNAME && !/^[A-Za-z0-9_]{3,24}$/.test(process.env.ADMIN_BOOTSTRAP_USERNAME.trim())) {
  invalid.push("ADMIN_BOOTSTRAP_USERNAME (must contain 3 to 24 letters, digits, or underscores)");
}

if (process.env.ADMIN_BOOTSTRAP_PASSWORD && (process.env.ADMIN_BOOTSTRAP_PASSWORD.length < 12 || process.env.ADMIN_BOOTSTRAP_PASSWORD.length > 128)) {
  invalid.push("ADMIN_BOOTSTRAP_PASSWORD (must be 12 to 128 characters)");
}

if (process.env.DATABASE_URL) {
  try {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
      invalid.push("DATABASE_URL (must use PostgreSQL)");
    }
  } catch {
    invalid.push("DATABASE_URL (must be a valid PostgreSQL URL)");
  }
}

if (process.env.PUBLIC_APP_ORIGIN) {
  try {
    const origin = new URL(process.env.PUBLIC_APP_ORIGIN);
    if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) {
      invalid.push("PUBLIC_APP_ORIGIN (must be an HTTPS origin without a path)");
    }
  } catch {
    invalid.push("PUBLIC_APP_ORIGIN (must be a valid HTTPS origin)");
  }
}

if (process.env.RENEWAL_VAPID_SUBJECT) {
  try {
    const subject = new URL(process.env.RENEWAL_VAPID_SUBJECT);
    if (!["https:", "mailto:"].includes(subject.protocol)) {
      invalid.push("RENEWAL_VAPID_SUBJECT (must be an HTTPS URL or mailto address)");
    }
  } catch {
    invalid.push("RENEWAL_VAPID_SUBJECT (must be an HTTPS URL or mailto address)");
  }
}

if (process.env.RENEWAL_VAPID_PUBLIC_KEY && process.env.RENEWAL_VAPID_PRIVATE_KEY) {
  try {
    const publicKey = Buffer.from(process.env.RENEWAL_VAPID_PUBLIC_KEY, "base64url");
    const privateKey = Buffer.from(process.env.RENEWAL_VAPID_PRIVATE_KEY, "base64url");
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(privateKey);
    if (publicKey.length !== 65 || !ecdh.getPublicKey().equals(publicKey)) {
      invalid.push("RENEWAL_VAPID_PUBLIC_KEY and RENEWAL_VAPID_PRIVATE_KEY (must be a matching P-256 pair)");
    }
  } catch {
    invalid.push("RENEWAL_VAPID_PUBLIC_KEY and RENEWAL_VAPID_PRIVATE_KEY (must be valid base64url P-256 keys)");
  }
}

if (missing.length || invalid.length) {
  console.error("EthioDeploy configuration is incomplete.");
  if (missing.length) console.error(`Missing: ${missing.join(", ")}`);
  if (invalid.length) console.error(`Invalid: ${invalid.join(", ")}`);
  console.error("Set these values in EthioDeploy's environment/secrets settings. Secret values are not printed.");
  process.exit(1);
}

console.log("EthioDeploy runtime configuration preflight passed.");
