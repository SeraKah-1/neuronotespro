
/* 
  NEUROKEY CRYPTOGRAPHIC MODULE 
  Uses Web Crypto API (SubtleCrypto) for secure, dependency-free AES-GCM encryption.
*/

import { EncryptedPayload, NeuroKeyFile } from "../types";

// Utility to convert ArrayBuffer to Base64
const buf2hex = (buffer: ArrayBuffer) => {
  return Array.prototype.map.call(new Uint8Array(buffer), (x: number) => ('00' + x.toString(16)).slice(-2)).join('');
};

const hex2buf = (hexString: string) => {
  return new Uint8Array(hexString.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
};

// 1. DERIVE KEY FROM PIN (PBKDF2)
const getKeyMaterial = (password: string) => {
  const enc = new TextEncoder();
  return window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
};

const getKey = (keyMaterial: CryptoKey, salt: Uint8Array) => {
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
};

// 2. ENCRYPT DATA
export const encryptNeuroKey = async (
  payload: EncryptedPayload, 
  pin: string, 
  issuedTo: string
): Promise<NeuroKeyFile> => {
  
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const keyMaterial = await getKeyMaterial(pin);
  const key = await getKey(keyMaterial, salt);
  
  const enc = new TextEncoder();
  const encodedData = enc.encode(JSON.stringify(payload));

  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    key,
    encodedData
  );

  return {
    version: "1.0",
    meta: {
      issuedTo,
      issuedAt: Date.now(),
      issuer: "NeuroAdmin"
    },
    security: {
      iv: buf2hex(iv),
      salt: buf2hex(salt),
      data: buf2hex(encrypted)
    }
  };
};

// 3. DECRYPT DATA
export const decryptNeuroKey = async (
  file: NeuroKeyFile,
  pin: string
): Promise<EncryptedPayload> => {
  
  try {
    const salt = hex2buf(file.security.salt);
    const iv = hex2buf(file.security.iv);
    const data = hex2buf(file.security.data);

    const keyMaterial = await getKeyMaterial(pin);
    const key = await getKey(keyMaterial, salt);

    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      data
    );

    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decrypted));
  } catch (e) {
    throw new Error("Invalid PIN or Corrupted Key File.");
  }
};
