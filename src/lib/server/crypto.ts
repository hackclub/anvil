// Column-level encryption for OAuth tokens (AES-256-GCM).
// Stored format: base64(iv):base64(tag):base64(ciphertext).
// ENCRYPTION_MASTER_KEY is 32 bytes, hex-encoded (64 chars) - generate with:
//   openssl rand -hex 32
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { required } from './env';

function masterKey(): Buffer {
	const hex = required('ENCRYPTION_MASTER_KEY');
	const key = Buffer.from(hex, 'hex');
	if (key.length !== 32) throw new Error('ENCRYPTION_MASTER_KEY must be 32 bytes of hex');

	return key;
}

export function encryptColumn(plaintext: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
	const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptColumn(stored: string): string {
	const [ivB64, tagB64, ctB64] = stored.split(':');
	if (!ivB64 || !tagB64 || !ctB64) throw new Error('malformed encrypted column');

	const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivB64, 'base64'));
	decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
	return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}
