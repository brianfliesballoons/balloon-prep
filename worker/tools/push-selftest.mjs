// Offline proof that push.js is standard Web Push: no push service needed.
//   node worker/tools/push-selftest.mjs
// 1. aes128gcm: encrypt with push.js, decrypt with an independent node:crypto implementation of RFC 8291 using the
//    subscriber's private key (as a browser would). 2. VAPID: verify the ES256 JWT with node:crypto and check its claims.
import { createECDH, createDecipheriv, hkdfSync, createPublicKey, verify, webcrypto } from 'node:crypto';
import { encrypt, vapidAuth } from '../src/push.js';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const b64u = b => Buffer.from(b).toString('base64url'), ub = s => Buffer.from(s, 'base64url');

// a browser's subscription keys
const ua = createECDH('prime256v1'); ua.generateKeys();
const auth = webcrypto.getRandomValues(new Uint8Array(16));
const sub = { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) };

function decrypt(body) { // RFC 8291 3.4 + RFC 8188, from the receiving side
  const salt = body.subarray(0, 16), rs = body.readUInt32BE(16), idlen = body[20], as = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const shared = ua.computeSecret(as);
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), as]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let end = pt.length - 1; while (end >= 0 && pt[end] === 0) end--;     // strip padding
  return { rs, idlen, delim: pt[end], text: pt.subarray(0, end).toString('utf8') };
}
const msg = JSON.stringify({ title: 'Your instructor answered', body: 'Why does density altitude go up on a hot day? Ünïcödé ✓', tag: 'ans-x' });
for (let i = 0; i < 3; i++) {
  const body = Buffer.from(await encrypt(sub.p256dh, sub.auth, msg));
  let r; try { r = decrypt(body); } catch (e) { r = { err: e.message }; }
  ok(!r.err && r.text === msg && r.delim === 2 && r.rs === 4096 && r.idlen === 65, `aes128gcm round ${i + 1}: ${body.length} bytes decrypt to the same payload${r.err ? ' (' + r.err + ')' : ''}`);
}
{ const body = Buffer.from(await encrypt(sub.p256dh, sub.auth, msg)); body[body.length - 3] ^= 1; let threw = false; try { decrypt(body); } catch { threw = true; } ok(threw, 'a flipped ciphertext byte fails authentication'); }
{ const other = createECDH('prime256v1'); other.generateKeys(); const body = Buffer.from(await encrypt(b64u(other.getPublicKey()), sub.auth, msg)); let threw = false; try { decrypt(body); } catch { threw = true; } ok(threw, 'a payload for another browser does not decrypt with this one\'s key'); }

// VAPID
const k = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const env = { VAPID_PUBLIC: b64u(await webcrypto.subtle.exportKey('raw', k.publicKey)), VAPID_PRIVATE: (await webcrypto.subtle.exportKey('jwk', k.privateKey)).d };
const ep = 'https://fcm.googleapis.com/fcm/send/abc:def';
const h = await vapidAuth(env, ep), m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
ok(!!m && m[4] === env.VAPID_PUBLIC, 'Authorization header is "vapid t=<jwt>, k=<public key>"');
const head = JSON.parse(ub(m[1])), claims = JSON.parse(ub(m[2])), now = Date.now() / 1000;
ok(head.alg === 'ES256' && head.typ === 'JWT', 'JWT header ES256');
ok(claims.aud === 'https://fcm.googleapis.com' && claims.exp > now && claims.exp <= now + 86400 && /^(mailto:|https:)/.test(claims.sub), `claims aud=${claims.aud}, exp in ${Math.round((claims.exp - now) / 3600)} h, sub=${claims.sub}`);
const pub = ub(env.VAPID_PUBLIC), key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' });
const sig = ub(m[3]);
ok(sig.length === 64 && verify('sha256', Buffer.from(m[1] + '.' + m[2]), { key, dsaEncoding: 'ieee-p1363' }, sig), 'ES256 signature (64-byte r|s) verifies with the public key');
ok(!verify('sha256', Buffer.from(m[1] + '.' + m[2] + 'x'), { key, dsaEncoding: 'ieee-p1363' }, sig), 'and fails on a changed token');
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
