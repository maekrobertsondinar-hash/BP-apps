
import { api } from './api';

export interface ExpiryInfo {
  hasExpiry: boolean;
  expired: boolean;
  daysLeft: number;
  expiryDate: string | null;
  setBy: string | null;
  setDate: string | null;
}

export async function getExpiryInfoFromServer(): Promise<ExpiryInfo> {
  try {
    const info = await api.get<ExpiryInfo>('/api/settings/expiry');
    return {
      ...info,
      daysLeft: info.daysLeft ?? Infinity,
    };
  } catch {
    return { hasExpiry: false, expired: false, daysLeft: Infinity, expiryDate: null, setBy: null, setDate: null };
  }
}

export async function saveExpiryToServer(expiryDate: string): Promise<void> {
  await api.put('/api/settings/expiry', { expiryDate });
}

export async function clearExpiryFromServer(): Promise<void> {
  await api.del('/api/settings/expiry');
}

export interface LicenseData {
  expiryDate: string | null;
  setDate: string;
  setBy: string;
}

export function getLicenseData(): LicenseData | null { return null; }
export function saveLicenseData(_data: LicenseData): void { }
export function clearLicense(): void { }
export function getExpiryInfo(): ExpiryInfo {
  return { hasExpiry: false, expired: false, daysLeft: Infinity, expiryDate: null, setBy: null, setDate: null };
}
export interface TimeTravelResult { detected: boolean; }
export function touchLastKnownTime(): TimeTravelResult { return { detected: false }; }
