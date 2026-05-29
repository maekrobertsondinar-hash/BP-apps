const KEY = 'CSGM_AMROUS_2024_SEC';

export function encrypt(text: string): string {
  if (!text) return '';
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length));
  }
  return btoa(unescape(encodeURIComponent(result)));
}

export function decrypt(encoded: string): string {
  if (!encoded) return '';
  try {
    const text = decodeURIComponent(escape(atob(encoded)));
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length));
    }
    return result;
  } catch {
    return encoded;
  }
}

export function isEncrypted(value: string): boolean {
  try {
    atob(value);
    return true;
  } catch {
    return false;
  }
}
