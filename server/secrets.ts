import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SECRETS_FILE = path.join(process.cwd(), 'data', '.secrets.json');

interface Secrets {
  accessSecret: string;
  refreshSecret: string;
}

let secrets: Secrets | null = null;

function loadSecrets(): Secrets {
  if (secrets) return secrets;

  if (fs.existsSync(SECRETS_FILE)) {
    try {
      secrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
      return secrets!;
    } catch { /* regenerate below */ }
  }

  secrets = {
    accessSecret: crypto.randomBytes(64).toString('hex'),
    refreshSecret: crypto.randomBytes(64).toString('hex'),
  };

  fs.mkdirSync(path.dirname(SECRETS_FILE), { recursive: true });
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets), { mode: 0o600 });
  console.log('✅ Generated new JWT secrets');
  return secrets;
}

export function getAccessSecret(): string {
  return loadSecrets().accessSecret;
}

export function getRefreshSecret(): string {
  return loadSecrets().refreshSecret;
}
