// Web Push for "Notify me when <instructor> answers". Standard Web Push with crypto.subtle only, no dependencies:
// VAPID (RFC 8292, an ES256 JWT) identifies this Worker to the push service, and the payload is encrypted for the
// student's browser with aes128gcm (RFC 8291 + RFC 8188), so Apple/Google/Mozilla only ever relay ciphertext.
// Keys: VAPID_PUBLIC (65-byte P-256 point) and VAPID_PRIVATE (32-byte scalar), both base64url, both Worker secrets
// (make a pair with worker/tools/vapid-keys.mjs). Without them push is simply off: GET .../push returns {key:null}.
const te = new TextEncoder();
const LIM = { ep: 1000, perStudent: 10, body: 110, ttl: 7 * 86400 };
// Only real push services: a student's browser hands us the endpoint, and the Worker must never POST to anything else.
const HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', '.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com'];

export const b64u = a => btoa(String.fromCharCode(...new Uint8Array(a))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), c => c.charCodeAt(0));
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const dec = s => { try { return unb64u(s); } catch { return null; } };

function okEndpoint(s) {
  if (typeof s !== 'string' || s.length > LIM.ep) return false;
  let u; try { u = new URL(s); } catch { return false; }
  return u.protocol === 'https:' && !u.port && !u.username && HOSTS.some(h => h[0] === '.' ? u.hostname.endsWith(h) : u.hostname === h);
}

// ---- encryption: RFC 8291 section 3.4, one record, then the RFC 8188 header (salt | rs | idlen | keyid)
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
export async function encrypt(p256dh, auth, plaintext) {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const as = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(secret, shared, cat(te.encode('WebPush: info\0'), ua, as), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(te.encode(plaintext), [2]))); // 0x02 = last record, no padding
  const head = new Uint8Array(21); head.set(salt); new DataView(head.buffer).setUint32(16, 4096); head[20] = as.length;
  return cat(head, as, ct);
}

// ---- VAPID: ES256 JWT, aud = the push service's origin. WebCrypto signs in raw r|s form, which is exactly what JWS wants.
let vkey = null;
async function signer(env) {
  if (vkey && vkey.pub === env.VAPID_PUBLIC) return vkey.k;
  const p = unb64u(env.VAPID_PUBLIC);
  const k = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64u(p.slice(1, 33)), y: b64u(p.slice(33, 65)), d: env.VAPID_PRIVATE, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  vkey = { pub: env.VAPID_PUBLIC, k };
  return k;
}
export async function vapidAuth(env, endpoint) {
  const enc = o => b64u(te.encode(JSON.stringify(o)));
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'https://brianfliesballoons.github.io/balloon-prep/' };
  const unsigned = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc(claims);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signer(env), te.encode(unsigned));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}

export async function sendPush(env, sub, payload) {
  return fetch(sub.endpoint, { method: 'POST', body: await encrypt(sub.p256dh, sub.auth, JSON.stringify(payload)),
    headers: { Authorization: await vapidAuth(env, sub.endpoint), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(LIM.ttl), Urgency: 'normal' } });
}

// ---- routes (the caller has already checked X-Student and passes the student row)
export const pushKey = env => ({ key: env.VAPID_PUBLIC && env.VAPID_PRIVATE ? env.VAPID_PUBLIC : null });

export async function subscribe(env, s, b) {
  if (!pushKey(env).key) return { error: 'Notifications are not set up yet' };
  const ep = b && b.endpoint, k = b && b.keys || {}, pk = dec(k.p256dh), au = dec(k.auth);
  if (!okEndpoint(ep) || !pk || pk.length !== 65 || pk[0] !== 4 || !au || au.length !== 16) return { error: 'This browser sent a subscription the server cannot use' };
  // One row per browser: a phone that switches class (or student) moves its row instead of getting two.
  await env.DB.prepare('INSERT INTO push_subs(endpoint,sid,code,p256dh,auth,created) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET sid=excluded.sid, code=excluded.code, p256dh=excluded.p256dh, auth=excluded.auth, created=excluded.created')
    .bind(ep, s.sid, s.code, b64u(pk), b64u(au), Date.now()).run();
  await env.DB.prepare('DELETE FROM push_subs WHERE sid=? AND endpoint NOT IN (SELECT endpoint FROM push_subs WHERE sid=? ORDER BY created DESC LIMIT ?)').bind(s.sid, s.sid, LIM.perStudent).run();
  return { ok: true };
}

export async function unsubscribe(env, s, b) {
  const ep = b && b.endpoint;
  if (typeof ep === 'string' && ep) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint=? AND sid=?').bind(ep, s.sid).run();
  else await env.DB.prepare('DELETE FROM push_subs WHERE sid=?').bind(s.sid).run(); // no endpoint: every device of this student
  return { ok: true };
}

// For the student-deletion path: put this statement in the same batch that deletes the student.
export const dropSubs = (env, sid) => env.DB.prepare('DELETE FROM push_subs WHERE sid=?').bind(sid);

// After an answer is saved (run it in ctx.waitUntil): tell every device of the student who asked. Never throws.
export async function notifyAnswer(env, code, id) {
  try {
    if (!pushKey(env).key) return { sent: 0 };
    const q = await env.DB.prepare('SELECT id,sid,text FROM questions WHERE id=? AND code=?').bind(id, code).first();
    if (!q) return { sent: 0 };
    const subs = (await env.DB.prepare('SELECT endpoint,p256dh,auth FROM push_subs WHERE sid=?').bind(q.sid).all()).results;
    const t = q.text.replace(/\s+/g, ' ').trim(), body = t.length > LIM.body ? t.slice(0, LIM.body - 1).trimEnd() + '…' : t;
    const payload = { title: 'Your instructor answered', body, tag: 'ans-' + q.id };
    let sent = 0;
    await Promise.all(subs.map(async sub => {
      try {
        const r = await sendPush(env, sub, payload);
        if (r.ok) sent++;
        else if (r.status === 404 || r.status === 410) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint=?').bind(sub.endpoint).run(); // the browser dropped it
      } catch { /* one bad device must not stop the others */ }
    }));
    return { sent, of: subs.length };
  } catch { return { sent: 0 }; }
}
