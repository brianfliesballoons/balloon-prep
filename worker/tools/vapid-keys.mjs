// Make a VAPID key pair for Web Push and print it as the two Worker secrets.
//   node worker/tools/vapid-keys.mjs           -> prints the pair and the wrangler commands (nothing is written)
//   node worker/tools/vapid-keys.mjs --dev     -> writes worker/.dev.vars for `wrangler dev` (git-ignored)
// The public key is not secret (every browser sees it), but keeping both as secrets keeps the pair together.
// Rotating the pair silently breaks every existing subscription; students then tap "Notify me" again.
import { webcrypto as c } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const b64u = a => Buffer.from(a).toString('base64url');
const k = await c.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = b64u(await c.subtle.exportKey('raw', k.publicKey)), priv = (await c.subtle.exportKey('jwk', k.privateKey)).d;
if (process.argv.includes('--dev')) {
  const f = fileURLToPath(new URL('../.dev.vars', import.meta.url));
  writeFileSync(f, `VAPID_PUBLIC=${pub}\nVAPID_PRIVATE=${priv}\n`, { mode: 0o600 });
  console.log('wrote', f);
} else {
  console.log(`VAPID_PUBLIC=${pub}\nVAPID_PRIVATE=${priv}\n\nSet them on the Worker (paste each value at the prompt):\n` +
    `  CLOUDFLARE_ACCOUNT_ID=3053d192fbbbc176b3016b015244d07b npx wrangler@4 secret put VAPID_PUBLIC --config worker/wrangler.toml\n` +
    `  CLOUDFLARE_ACCOUNT_ID=3053d192fbbbc176b3016b015244d07b npx wrangler@4 secret put VAPID_PRIVATE --config worker/wrangler.toml`);
}
