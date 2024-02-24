import { generateKeyPair } from 'jose';

function exportJwk({ privateKey }) {
  return privateKey.export({ format: 'jwk' });
}

const keys = await Promise.all([generateKeyPair('RS256').then(exportJwk)]);
console.info(JSON.stringify(keys));
