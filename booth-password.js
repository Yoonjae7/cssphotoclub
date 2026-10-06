import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
// Only the salted password verifier is deployed, never the password itself.
const salt = 'd6d12b91cf9c95068fb554f8892766e5';
const verifier = Buffer.from('20e339913673d4ccf0cc6a90bd894312ea01d098a4956c7a3ce642af915b584163513a902a7fe53a6d35bf6ae5aa9cb9436a6066f9313292240bd3c18ac64b4a', 'hex');

export async function verifyBoothPassword(password) {
  if (typeof password !== 'string' || !password.length || password.length > 128) return false;
  return timingSafeEqual(await derive(password, salt, verifier.length), verifier);
}
