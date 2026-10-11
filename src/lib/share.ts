/**
 * Read-only share links.
 *
 * The link carries the base ID and the read-only token, encrypted with a password chosen by the owner:
 * PBKDF2-SHA-256 derives an AES-GCM key from the password and a random salt. The payload sits in the URL
 * fragment (`#share=…`), which browsers never send to the server.
 *
 * Token layout (base64url): version (1 byte) | salt (16) | iv (12) | AES-GCM ciphertext + tag.
 */

const VERSION = 1;
const ITERATIONS = 310_000;
const PREFIX = '#share=';

export interface SharePayload {
  baseId: string;
  readKey: string;
}

function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptShare(payload: SharePayload, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plain = new TextEncoder().encode(JSON.stringify({ b: payload.baseId, k: payload.readKey }));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const out = new Uint8Array(1 + salt.length + iv.length + ct.length);
  out[0] = VERSION;
  out.set(salt, 1);
  out.set(iv, 17);
  out.set(ct, 29);
  return toB64Url(out);
}

/** Throws `WrongPassword` if the password does not match, `BadLink` if the token is damaged. */
export async function decryptShare(token: string, password: string): Promise<SharePayload> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = fromB64Url(token);
  } catch {
    throw new Error('BadLink');
  }
  if (bytes.length < 29 + 16 || bytes[0] !== VERSION) throw new Error('BadLink');
  const key = await deriveKey(password, bytes.slice(1, 17));
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(17, 29) }, key, bytes.slice(29));
  } catch {
    throw new Error('WrongPassword'); // GCM authentication failed
  }
  const data = JSON.parse(new TextDecoder().decode(plain)) as { b?: string; k?: string };
  if (!data.b || !data.k) throw new Error('BadLink');
  return { baseId: data.b, readKey: data.k };
}

/** Full link to this app that opens the share dialog. */
export function shareUrl(token: string): string {
  return `${location.origin}${location.pathname}${PREFIX}${token}`;
}

/** The share token in the current URL, if any. */
export function shareTokenFromHash(): string | null {
  return typeof location !== 'undefined' && location.hash.startsWith(PREFIX) ? location.hash.slice(PREFIX.length) : null;
}
