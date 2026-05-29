
import { encrypt, decrypt } from './crypto';

const LICENSE_KEY = 'csgm_lic_v1';
const TIME_KEY = 'csgm_lkt_v1';

export interface LicenseData {
  expiryDate: string | null;
  setDate: string;
  setBy: string;
}

export function getLicenseData(): LicenseData | null {
  try {
    const raw = localStorage.getItem(LICENSE_KEY);
    if (!raw) return null;
    return JSON.parse(decrypt(raw));
  } catch { return null; }
}

export function saveLicenseData(data: LicenseData): void {
  localStorage.setItem(LICENSE_KEY, encrypt(JSON.stringify(data)));
}

export function clearLicense(): void {
  localStorage.removeItem(LICENSE_KEY);
  localStorage.removeItem(TIME_KEY);
}

export interface ExpiryInfo {
  hasExpiry: boolean;
  expired: boolean;
  daysLeft: number;
  expiryDate: string | null;
  setBy: string | null;
  setDate: string | null;
}

export function getExpiryInfo(): ExpiryInfo {
  const lic = getLicenseData();
  if (!lic || !lic.expiryDate) {
    return { hasExpiry: false, expired: false, daysLeft: Infinity, expiryDate: null, setBy: null, setDate: null };
  }
  const now = new Date();
  const expiry = new Date(lic.expiryDate);
  expiry.setHours(23, 59, 59, 999);
  const msLeft = expiry.getTime() - now.getTime();
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  return {
    hasExpiry: true,
    expired: now > expiry,
    daysLeft: Math.max(0, daysLeft),
    expiryDate: lic.expiryDate,
    setBy: lic.setBy,
    setDate: lic.setDate,
  };
}

export interface TimeTravelResult {
  detected: boolean;
}

export function touchLastKnownTime(): TimeTravelResult {
  const now = Date.now();
  const raw = localStorage.getItem(TIME_KEY);
  if (raw) {
    try {
      const last = parseInt(decrypt(raw), 10);
      if (!isNaN(last) && now < last - 120_000) {
        return { detected: true };
      }
    } catch { /* ignore */ }
  }
  localStorage.setItem(TIME_KEY, encrypt(String(now)));
  return { detected: false };
}
