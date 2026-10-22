// Optional student accounts: study progress follows a student to every device they sign in on.
// Three ways in, all free: a passkey (Face ID / Touch ID), a 6-digit code sent by email (from the app's own Gmail),
// or Google (scopes openid + email only). Nothing here touches classes; the instructor never sees study progress.
// Stored: a salted hash of the email (never the address), Google's account id (sub), passkey public keys, the progress blob.
// Session tokens, email codes and Google hand-off codes are stored only as SHA-256 hashes.

const DAY = 864e5, MIN = 6e4;
const PROG_MAX = 1_000_000;                    // bytes of progress JSON per account
const SESSION_IDLE = 400 * DAY;                // a session unused this long stops working
const CODE_TTL = 10 * MIN, CODE_TRIES = 5, CODE_GAP = 60e3;
const HAND_TTL = 15 * MIN;                     // a Google sign-in must finish within this
const CHAL_TTL = 5 * MIN;
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
// Google sends the student back to this page (on GitHub Pages), which posts the code here. Listed on the OAuth client.
const GOOGLE_RETURN = 'https://brianfliesballoons.github.io/balloon-prep/signed-in.html';
// per IP: [window ms, max]
export const AUTH_RATE = {
  acct: [[36e5, 10], [DAY, 30]],               // new accounts (any method)
  email: [[36e5, 10], [DAY, 30]],              // codes emailed
  google: [[36e5, 30], [DAY, 100]],            // Google sign-ins started
  pk: [[36e5, 60], [DAY, 300]],                // passkey challenges
};
export const AUTH_SLOW = {
  acct: 'A lot of accounts have been made from this network today. Please try again later.',
  email: 'We have sent a lot of codes to this network. Please wait an hour and try again.',
  google: 'A lot of Google sign-ins have been started from this network. Please wait a few minutes.',
  pk: 'Too many tries from this network. Please wait a few minutes.',
};

const enc = new TextEncoder(), dec = new TextDecoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => { s = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); const b = atob(s + '='.repeat((4 - s.length % 4) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof s === 'string' ? enc.encode(s) : s))].map(x => x.toString(16).padStart(2, '0')).join('');
const shaBytes = async b => new Uint8Array(await crypto.subtle.digest('SHA-256', b));
const rand = n => b64u(crypto.getRandomValues(new Uint8Array(n)));
const digits6 = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, '0');
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const normEmail = s => String(s || '').trim().toLowerCase();

// ---------- tiny CBOR reader (enough for WebAuthn attestation objects and COSE keys) ----------
function cbor(buf) {
  let o = 0;
  const len = ai => ai < 24 ? ai : ai === 24 ? buf[o++] : ai === 25 ? (o += 2, buf[o - 2] << 8 | buf[o - 1]) : ai === 26 ? (o += 4, ((buf[o - 4] << 24) >>> 0) + (buf[o - 3] << 16 | buf[o - 2] << 8 | buf[o - 1])) : (() => { throw new Error('cbor'); })();
  function item() {
    const b = buf[o++], mt = b >> 5, n = len(b & 31);
    if (mt === 0) return n;
    if (mt === 1) return -1 - n;
    if (mt === 2) { o += n; return buf.slice(o - n, o); }
    if (mt === 3) { o += n; return dec.decode(buf.slice(o - n, o)); }
    if (mt === 4) { const a = []; for (let i = 0; i < n; i++) a.push(item()); return a; }
    if (mt === 5) { const m = new Map(); for (let i = 0; i < n; i++) { const k = item(); m.set(k, item()); } return m; }
    if (mt === 7) return n === 20 ? false : n === 21 ? true : null;
    throw new Error('cbor');
  }
  const v = item();
  return { v, end: o };
}

// authenticator data: rpIdHash(32) flags(1) counter(4) [aaguid(16) credIdLen(2) credId coseKey]
function authData(ad) {
  if (ad.length < 37) throw new Error('authData');
  const r = { rpIdHash: ad.slice(0, 32), flags: ad[32] };
  if (r.flags & 0x40) {
    const n = ad[53] << 8 | ad[54];
    r.credId = ad.slice(55, 55 + n);
    r.cose = cbor(ad.slice(55 + n)).v;
  }
  return r;
}

function coseToJwk(m) {
  const alg = m.get(3), kty = m.get(1);
  if (alg === -7 && kty === 2 && m.get(-1) === 1) return { alg, jwk: { kty: 'EC', crv: 'P-256', x: b64u(m.get(-2)), y: b64u(m.get(-3)) } };
  if (alg === -257 && kty === 3) return { alg, jwk: { kty: 'RSA', n: b64u(m.get(-1)), e: b64u(m.get(-2)) } };
  return null;
}
const keyAlg = alg => alg === -7 ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
const importKey = (jwk, alg) => crypto.subtle.importKey('jwk', jwk, keyAlg(alg), false, ['verify']);

// ECDSA signatures from authenticators are DER; WebCrypto wants r||s, 32 bytes each
function derToRaw(der) {
  let o = 2; if (der[1] & 0x80) o += der[1] & 0x7f;
  const part = () => { if (der[o++] !== 2) throw new Error('der'); const n = der[o++]; let v = der.slice(o, o + n); o += n; while (v.length > 32 && v[0] === 0) v = v.slice(1); const r = new Uint8Array(32); r.set(v, 32 - v.length); return r; };
  const r = part(), s = part(), out = new Uint8Array(64); out.set(r); out.set(s, 32); return out;
}

// ---------- helpers bound to a request ----------
export function makeAuth(env, req, { origins, salt }) {
  const H = {};
  H.salt = () => salt(env);   // the Worker's one random salt (meta k='salt'), created on first use
  H.emailHash = async email => sha('email|' + await H.salt() + '|' + normEmail(email));
  // IPv4 as is, IPv6 by its /64, so a phone's Safari and Home Screen app match even if the low bits rotate
  H.netHash = async () => {
    let ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    if (ip.includes(':')) ip = ip.split(':').slice(0, 4).join(':');
    return sha('net|' + await H.salt() + '|' + ip);
  };
  H.newSession = async uid => {
    const tok = rand(32), now = Date.now();
    await env.DB.prepare('INSERT INTO sessions(th,uid,created,seen) VALUES(?,?,?,?)').bind(await sha(tok), uid, now, now).run();
    return tok;
  };
  H.user = async () => {
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/, '');
    if (!tok) return null;
    const th = await sha(tok), now = Date.now();
    const s = await env.DB.prepare('SELECT s.th,s.seen,u.* FROM sessions s JOIN users u ON u.uid=s.uid WHERE s.th=?').bind(th).first();
    if (!s) return null;
    if (now - s.seen > SESSION_IDLE) { await env.DB.prepare('DELETE FROM sessions WHERE th=?').bind(th).run(); return null; }
    if (now - s.seen > DAY) await env.DB.prepare('UPDATE sessions SET seen=? WHERE th=?').bind(now, th).run();
    return s;
  };
  H.createUser = async (fields = {}) => {
    const uid = fields.uid || rand(12), now = Date.now();
    await env.DB.prepare('INSERT INTO users(uid,eh,gsub,created,ver,updated) VALUES(?,?,?,?,0,?)').bind(uid, fields.eh || null, fields.gsub || null, now, now).run();
    return uid;
  };
  H.origin = cd => origins(env).includes(cd.origin) ? cd.origin : null;
  return H;
}

// what a signed-in client is told about its account
const who = (u, extra = {}) => ({ uid: u.uid, email: !!u.eh, google: !!u.gsub, passkeys: u.pk || 0, ver: u.ver, updated: u.updated, ...extra });

// ---------- Gmail (sends the 6-digit codes from the app's own account) ----------
async function gmailToken(env) {
  const rt = (await env.DB.prepare("SELECT v FROM meta WHERE k='gmail_refresh'").first())?.v;
  if (!rt || !env.GOOGLE_SECRET) return null;
  const r = await fetch(GOOGLE_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_ID, client_secret: env.GOOGLE_SECRET, refresh_token: rt, grant_type: 'refresh_token' }) });
  const d = await r.json().catch(() => ({}));
  return d.access_token || null;
}
const emailReady = async env => !!(env.GMAIL_FROM && env.GOOGLE_SECRET && (await env.DB.prepare("SELECT v FROM meta WHERE k='gmail_refresh'").first()));
async function sendCode(env, to, code) {
  const at = await gmailToken(env); if (!at) return false;
  const subj = `${code} is your Balloon Written Prep code`;
  const text = `Your sign-in code is ${code}\r\n\r\nType it into Balloon Written Prep. It works for 10 minutes.\r\n\r\nIf you did not ask for this, you can ignore this email. Nobody can sign in without the code.\r\n`;
  const msg = [`From: Balloon Written Prep <${env.GMAIL_FROM}>`, `To: ${to}`, `Subject: ${subj}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', '', text].join('\r\n');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST',
    headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: b64u(enc.encode(msg)) }) });
  return r.ok;
}

// ---------- the routes: /api/auth/* and /api/me/* ----------
export async function authRoute(req, env, p, tools) {
  const { json, err, limited } = tools, A = makeAuth(env, req, tools);
  const body = async () => { try { const b = await req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; } };
  const now = Date.now();

  if (p[1] === 'auth') {
    // GET /api/auth/config -> which ways in are switched on
    if (p[2] === 'config' && req.method === 'GET') return json({ passkey: true, google: !!(env.GOOGLE_ID && env.GOOGLE_SECRET), email: await emailReady(env) });

    // ----- email code -----
    if (p[2] === 'email' && p[3] === 'start' && req.method === 'POST') {
      const email = normEmail((await body()).email);
      if (!EMAIL_RE.test(email) || email.length > 254) return err(400, 'That email address does not look right');
      if (!await emailReady(env)) return err(503, 'Email sign-in is not switched on yet. Use Face ID or Google for now.');
      const eh = await A.emailHash(email);
      const row = await env.DB.prepare('SELECT sent FROM email_codes WHERE eh=?').bind(eh).first();
      if (row && now - row.sent < CODE_GAP) return err(429, 'We just sent a code. Please wait a minute before asking for another.');
      const slow = await limited(env, req, 'email'); if (slow) return err(429, slow);
      const code = digits6();
      await env.DB.prepare('INSERT OR REPLACE INTO email_codes(eh,ch,exp,tries,sent) VALUES(?,?,?,0,?)').bind(eh, await sha(eh + '|' + code), now + CODE_TTL, now).run();
      if (!await sendCode(env, email, code)) return err(503, 'We could not send the email just now. Please try again, or use Face ID or Google.');
      return json({ ok: true });
    }
    if (p[2] === 'email' && p[3] === 'verify' && req.method === 'POST') {
      const b = await body(), email = normEmail(b.email), code = String(b.code || '').replace(/\D/g, '');
      const eh = await A.emailHash(email);
      const row = await env.DB.prepare('SELECT * FROM email_codes WHERE eh=?').bind(eh).first();
      if (!row || row.exp < now) return err(400, 'That code has expired. Ask for a new one.');
      if (row.tries >= CODE_TRIES) return err(429, 'Too many wrong tries. Ask for a new code.');
      if (row.ch !== await sha(eh + '|' + code)) {
        await env.DB.prepare('UPDATE email_codes SET tries=tries+1 WHERE eh=?').bind(eh).run();
        return err(400, row.tries + 1 >= CODE_TRIES ? 'Too many wrong tries. Ask for a new code.' : 'That code is not right. Check the email and try again.');
      }
      await env.DB.prepare('DELETE FROM email_codes WHERE eh=?').bind(eh).run();
      let u = await env.DB.prepare('SELECT uid FROM users WHERE eh=?').bind(eh).first(), isNew = false;
      if (!u) { const slow = await limited(env, req, 'acct'); if (slow) return err(429, slow); u = { uid: await A.createUser({ eh }) }; isNew = true; }
      return json({ token: await A.newSession(u.uid), isNew });
    }

    // ----- passkeys -----
    // POST /api/auth/passkey/options {mode:'create'|'get'} (create may carry a session, to add a passkey to that account)
    if (p[2] === 'passkey' && p[3] === 'options' && req.method === 'POST') {
      const mode = (await body()).mode === 'create' ? 'create' : 'get';
      const slow = await limited(env, req, 'pk'); if (slow) return err(429, slow);
      const id = rand(12), ch = rand(32);
      let uid = null;
      if (mode === 'create') { const u = await A.user(); uid = u ? u.uid : rand(12); }
      await env.DB.batch([
        env.DB.prepare('DELETE FROM chal WHERE exp<?').bind(now),
        env.DB.prepare('INSERT INTO chal(id,ch,kind,uid,exp) VALUES(?,?,?,?,?)').bind(id, ch, mode, uid, now + CHAL_TTL),
      ]);
      return json({ id, challenge: ch, user: uid ? { id: b64u(enc.encode(uid)) } : undefined });
    }
    if (p[2] === 'passkey' && p[3] === 'verify' && req.method === 'POST') {
      const b = await body();
      const c = await env.DB.prepare('SELECT * FROM chal WHERE id=?').bind(String(b.id || '')).first();
      if (!c || c.exp < now) return err(400, 'That took too long. Please try again.');
      await env.DB.prepare('DELETE FROM chal WHERE id=?').bind(c.id).run();
      let cdRaw, cd;
      try { cdRaw = unb64u(b.clientDataJSON); cd = JSON.parse(dec.decode(cdRaw)); } catch { return err(400, 'Face ID sign-in failed. Please try again.'); }
      const origin = A.origin(cd);
      if (!origin || cd.challenge !== c.ch || cd.type !== (c.kind === 'create' ? 'webauthn.create' : 'webauthn.get')) return err(400, 'Face ID sign-in failed. Please try again.');
      const rpHash = await shaBytes(enc.encode(new URL(origin).hostname));
      try {
        if (c.kind === 'create') {
          const att = cbor(unb64u(b.attestationObject)).v, ad = authData(att.get('authData'));
          if (!same(ad.rpIdHash, rpHash) || !(ad.flags & 1) || !(ad.flags & 4) || !ad.credId) throw new Error('flags');
          const k = coseToJwk(ad.cose); if (!k) return err(400, 'This device made a kind of passkey we cannot use. Try email or Google instead.');
          await importKey(k.jwk, k.alg);
          const cid = b64u(ad.credId);
          if (await env.DB.prepare('SELECT 1 FROM passkeys WHERE cid=?').bind(cid).first()) return err(409, 'That passkey is already saved.');
          let isNew = false;
          if (!await env.DB.prepare('SELECT 1 FROM users WHERE uid=?').bind(c.uid).first()) {
            const slow = await limited(env, req, 'acct'); if (slow) return err(429, slow);
            await A.createUser({ uid: c.uid }); isNew = true;
          }
          await env.DB.prepare('INSERT INTO passkeys(cid,uid,jwk,alg,created,used) VALUES(?,?,?,?,?,?)').bind(cid, c.uid, JSON.stringify(k.jwk), k.alg, now, now).run();
          return json({ token: await A.newSession(c.uid), isNew });
        }
        const cid = String(b.rawId || '');
        const pk = await env.DB.prepare('SELECT * FROM passkeys WHERE cid=?').bind(cid).first();
        if (!pk) return json({ error: 'That passkey belongs to an account that was deleted. Make a new one, or use email or Google.', unknown: cid }, 404);
        const adRaw = unb64u(b.authenticatorData), ad = authData(adRaw);
        if (!same(ad.rpIdHash, rpHash) || !(ad.flags & 1) || !(ad.flags & 4)) throw new Error('flags');
        const data = new Uint8Array(adRaw.length + 32); data.set(adRaw); data.set(await shaBytes(cdRaw), adRaw.length);
        let sig = unb64u(b.signature); if (pk.alg === -7) sig = derToRaw(sig);
        const ok = await crypto.subtle.verify(pk.alg === -7 ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' }, await importKey(JSON.parse(pk.jwk), pk.alg), sig, data);
        if (!ok) throw new Error('sig');
        await env.DB.prepare('UPDATE passkeys SET used=? WHERE cid=?').bind(now, cid).run();
        return json({ token: await A.newSession(pk.uid), isNew: false });
      } catch (e) { return err(400, 'Face ID sign-in failed. Please try again.'); }
    }

    // ----- Google -----
    // GET /api/auth/google/go?hh=<sha256 hex of the app's secret hand-off id>[&setup=gmail] -> 302 to Google.
    // A plain link, so the app can open it straight from a tap. The secret itself never leaves the app (it polls with it);
    // Google only ever sees `state`.
    if (p[2] === 'google' && p[3] === 'go' && req.method === 'GET') {
      const page = (status, msg) => new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Balloon Written Prep</title><body style="font:17px/1.5 system-ui,sans-serif;margin:40px 24px;color:#14263a;background:#fbfcfa"><h1 style="font-size:22px">Google sign-in did not start</h1><p>${msg}</p><p>Go back to Balloon Written Prep and try again.</p>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
      if (!env.GOOGLE_ID || !env.GOOGLE_SECRET) return page(503, 'Google sign-in is not switched on yet.');
      const url = new URL(req.url), hh = url.searchParams.get('hh') || '', gmail = url.searchParams.get('setup') === 'gmail';
      if (!/^[0-9a-f]{64}$/.test(hh)) return page(400, 'This link is not complete.');
      if (gmail && !env.GMAIL_FROM) return page(400, 'The app\'s Gmail address is not set yet.');
      const slow = await limited(env, req, 'google'); if (slow) return page(429, slow);
      const st = rand(18), ver = rand(32);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM ghand WHERE exp<?').bind(now),
        env.DB.prepare('INSERT OR REPLACE INTO ghand(h,st,ver,kind,exp) VALUES(?,?,?,?,?)').bind(hh, st, ver, gmail ? 'gmail' : 'login', now + HAND_TTL),
      ]);
      const q = new URLSearchParams({ client_id: env.GOOGLE_ID, redirect_uri: GOOGLE_RETURN, response_type: 'code', state: st,
        code_challenge: b64u(await shaBytes(enc.encode(ver))), code_challenge_method: 'S256' });
      if (gmail) { q.set('scope', 'openid email https://www.googleapis.com/auth/gmail.send'); q.set('access_type', 'offline'); q.set('prompt', 'consent'); q.set('login_hint', env.GMAIL_FROM); }
      else { q.set('scope', 'openid email'); q.set('prompt', 'select_account'); }
      return new Response(null, { status: 302, headers: { Location: GOOGLE_AUTH + '?' + q, 'Cache-Control': 'no-store' } });
    }
    // POST /api/auth/google/finish {state, code} (from signed-in.html in the browser Google returned to) -> {code6, email}
    if (p[2] === 'google' && p[3] === 'finish' && req.method === 'POST') {
      const b = await body();
      const g = await env.DB.prepare('SELECT * FROM ghand WHERE st=?').bind(String(b.state || '')).first();
      if (!g || g.exp < now) return err(400, 'This sign-in link has expired. Go back to the app and start again.');
      if (g.done) return err(409, 'This sign-in is already finished. Go back to the app.');
      const r = await fetch(GOOGLE_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: env.GOOGLE_ID, client_secret: env.GOOGLE_SECRET, code: String(b.code || ''), code_verifier: g.ver, redirect_uri: GOOGLE_RETURN, grant_type: 'authorization_code' }) });
      const t = await r.json().catch(() => ({}));
      if (!t.id_token) return err(400, 'Google did not finish the sign-in. Go back to the app and try again.');
      // straight from Google's token endpoint over TLS, so the payload can be read without checking the signature
      let id; try { id = JSON.parse(dec.decode(unb64u(t.id_token.split('.')[1]))); } catch { return err(400, 'Google sign-in failed.'); }
      if (id.aud !== env.GOOGLE_ID || !['https://accounts.google.com', 'accounts.google.com'].includes(id.iss) || !id.sub) return err(400, 'Google sign-in failed.');
      if (g.kind === 'gmail') {
        if (normEmail(id.email) !== normEmail(env.GMAIL_FROM) || !t.refresh_token) return err(400, `Sign in as ${env.GMAIL_FROM} and allow sending email.`);
        await env.DB.batch([
          env.DB.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('gmail_refresh',?)").bind(t.refresh_token),
          env.DB.prepare('DELETE FROM ghand WHERE st=?').bind(g.st),
        ]);
        return json({ gmail: true, email: id.email });
      }
      const eh = id.email && id.email_verified ? await A.emailHash(id.email) : null;
      let u = await env.DB.prepare('SELECT uid,gsub FROM users WHERE gsub=?').bind(id.sub).first(), isNew = false;
      if (!u && eh) { u = await env.DB.prepare('SELECT uid,gsub FROM users WHERE eh=? AND gsub IS NULL').bind(eh).first(); if (u) await env.DB.prepare('UPDATE users SET gsub=? WHERE uid=?').bind(id.sub, u.uid).run(); }
      if (!u) { const slow = await limited(env, req, 'acct'); if (slow) return err(429, slow); u = { uid: await A.createUser({ eh, gsub: id.sub }) }; isNew = true; }
      const tok = await A.newSession(u.uid), code6 = digits6();
      await env.DB.prepare('UPDATE ghand SET done=1, tok=?, net=?, ch=?, tries=0, isnew=?, email=? WHERE st=?')
        .bind(tok, await A.netHash(), await sha(g.h + '|' + code6), isNew ? 1 : 0, id.email || null, g.st).run();
      return json({ code6, email: id.email || null });
    }
    // POST /api/auth/google/poll {h, code?} -> {wait} | {token, email, isNew} | {needCode}
    // The token is handed over automatically only to a poll from the same network as the browser that finished;
    // otherwise the student types the code that browser shows. That stops a sign-in link sent to someone else from working.
    if (p[2] === 'google' && p[3] === 'poll' && req.method === 'POST') {
      const b = await body(), hh = await sha(String(b.h || ''));
      const g = await env.DB.prepare('SELECT * FROM ghand WHERE h=?').bind(hh).first();
      if (!g || g.exp < now) return err(410, 'That sign-in timed out. Please start again.');
      if (!g.done) return json({ wait: true });
      const give = () => env.DB.prepare('DELETE FROM ghand WHERE h=?').bind(hh).run().then(() => json({ token: g.tok, email: g.email, isNew: !!g.isnew }));
      if (b.code != null) {
        if (g.tries >= CODE_TRIES) return err(429, 'Too many wrong tries. Please start again.');
        if (g.ch === await sha(g.h + '|' + String(b.code).replace(/\D/g, ''))) return give();
        await env.DB.prepare('UPDATE ghand SET tries=tries+1 WHERE h=?').bind(hh).run();
        return err(400, 'That code is not right. Check the Google page and try again.');
      }
      if (g.net === await A.netHash()) return give();
      return json({ needCode: true });
    }
    return err(404, 'Not found');
  }

  // ---------- /api/me: the signed-in account ----------
  const u = await A.user();
  if (!u) return err(401, 'Please sign in again.');
  const pkN = async () => (await env.DB.prepare('SELECT COUNT(*) n FROM passkeys WHERE uid=?').bind(u.uid).first()).n;
  if (p.length === 2 && req.method === 'GET') return json(who({ ...u, pk: await pkN() }));
  // GET /api/me/progress -> {prog, ver}; PUT {prog, base} -> {ver} | 409 {prog, ver} when another device saved first
  if (p[2] === 'progress' && req.method === 'GET') return json({ prog: u.prog ? JSON.parse(u.prog) : null, ver: u.ver, updated: u.updated });
  if (p[2] === 'progress' && req.method === 'PUT') {
    const text = await req.text();
    if (text.length > PROG_MAX) return err(413, 'Your progress is too large to save to your account.');
    let b; try { b = JSON.parse(text); } catch { return err(400, 'Bad progress'); }
    if (!b || typeof b.prog !== 'object' || Array.isArray(b.prog) || !Number.isInteger(b.base)) return err(400, 'Bad progress');
    const r = await env.DB.prepare('UPDATE users SET prog=?, ver=ver+1, updated=? WHERE uid=? AND ver=?').bind(JSON.stringify(b.prog), now, u.uid, b.base).run();
    if (r.meta.changes) return json({ ver: b.base + 1, updated: now });
    const cur = await env.DB.prepare('SELECT prog,ver,updated FROM users WHERE uid=?').bind(u.uid).first();
    return json({ error: 'Saved from another device first', prog: cur.prog ? JSON.parse(cur.prog) : null, ver: cur.ver, updated: cur.updated }, 409);
  }
  // POST /api/me/signout -> this session ends
  if (p[2] === 'signout' && req.method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE th=?').bind(u.th).run();
    return json({ ok: true });
  }
  // DELETE /api/me -> the account, its progress, passkeys and every session are deleted. Returns the passkey ids so the app can tell the phone to forget them.
  if (p.length === 2 && req.method === 'DELETE') {
    const ids = (await env.DB.prepare('SELECT cid FROM passkeys WHERE uid=?').bind(u.uid).all()).results.map(r => r.cid);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE uid=?').bind(u.uid),
      env.DB.prepare('DELETE FROM passkeys WHERE uid=?').bind(u.uid),
      env.DB.prepare('DELETE FROM users WHERE uid=?').bind(u.uid),
    ]);
    return json({ ok: true, passkeys: ids });
  }
  return err(404, 'Not found');
}
