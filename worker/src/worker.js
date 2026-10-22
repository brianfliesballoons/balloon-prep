// balloon-prep-qa: students ask their instructor, the instructor answers in a hub. Anyone can report a problem with a question.
// No accounts. A class has a public join code and a secret hub key; a student has a secret key. Only hashes are stored.
import { pushKey, subscribe, unsubscribe, notifyAnswer, dropSubs } from './push.js';
// Rate limits key on a salted SHA-256 of the caller's IP (the raw IP is never stored; rows older than 2 days are pruned).
const PROD_ORIGINS = ['https://brianfliesballoons.github.io'];
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LIM = { name: 60, cls: 80, text: 2000, perDay: 50, topic: 40, qid: 20, report: 1000, own: 20 };
const HOUR = 36e5, DAY = 864e5;
// [window ms, max] per bucket, per IP. A whole class joining from one school Wi-Fi in an hour stays well under 'join'.
const RATE = {
  class: [[HOUR, 5], [DAY, 20]],
  join: [[HOUR, 60], [DAY, 300]],
  report: [[HOUR, 12], [DAY, 50]],
};
const JOINS_PER_CLASS_DAY = 150;   // new students one class can take in 24 h
const REPORTS_MAX = 5000;          // open reports kept before new ones are refused
const KINDS = ['wrong', 'confusing', 'typo', 'other'];
const REF_RE = /^(q|lesson|card):[A-Za-z0-9_.-]{1,40}$/;
const SLOW = {
  class: 'A lot of classes have been started from this network recently. Please try again in an hour.',
  join: 'A lot of students have joined from this network in the last hour. Please wait a few minutes and try again.',
  report: 'Thanks, we have plenty of reports from you for now. Please try again in an hour.',
};

const rand = n => { const b = crypto.getRandomValues(new Uint8Array(n)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const code6 = () => { const b = crypto.getRandomValues(new Uint8Array(6)); return [...b].map(x => ALPHA[x % ALPHA.length]).join(''); };
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
// "Brian  Lynch", "brian lynch.", "BRIAN-LYNCH" all compare equal
const norm = s => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

const origins = env => PROD_ORIGINS.concat(String(env.DEV_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
function cors(req, env) {
  const o = req.headers.get('Origin'), ok = origins(env);
  return { 'Access-Control-Allow-Origin': ok.includes(o) ? o : ok[0], 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Student', 'Vary': 'Origin' };
}

let SALT = null;
async function salt(env) {
  if (SALT) return SALT;
  await env.DB.prepare("INSERT OR IGNORE INTO meta(k,v) VALUES('salt',?)").bind(rand(32)).run();
  SALT = (await env.DB.prepare("SELECT v FROM meta WHERE k='salt'").first()).v;
  return SALT;
}
// null when allowed (and the hit is recorded), otherwise the friendly message
async function limited(env, req, bucket) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const who = await sha((await salt(env)) + '|' + ip), now = Date.now();
  for (const [win, max] of RATE[bucket]) {
    const r = await env.DB.prepare('SELECT COUNT(*) n FROM hits WHERE bucket=? AND who=? AND t>?').bind(bucket, who, now - win).first();
    if (r.n >= max) return SLOW[bucket];
  }
  await env.DB.batch([
    env.DB.prepare('INSERT INTO hits(bucket,who,t) VALUES(?,?,?)').bind(bucket, who, now),
    env.DB.prepare('DELETE FROM hits WHERE t<?').bind(now - 2 * DAY),
  ]);
  return null;
}

async function body(req) { try { const b = await req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; } }
async function admin(env, req, code) {
  const k = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/, '');
  if (!k) return null;
  const c = await env.DB.prepare('SELECT * FROM classes WHERE code=?').bind(code).first();
  return c && c.admin_hash === await sha(k) ? c : null;
}
async function student(env, req, code) {
  const [sid, key] = (req.headers.get('X-Student') || '').split('.');
  if (!sid || !key) return null;
  const s = await env.DB.prepare('SELECT * FROM students WHERE sid=? AND code=?').bind(sid, code).first();
  return s && s.key_hash === await sha(key) ? s : null;
}
// a student's questions go first (they reference the student row)
const dropStudent = (env, code, sid) => env.DB.batch([
  dropSubs(env, sid, code),
  env.DB.prepare('DELETE FROM questions WHERE sid=? AND code=?').bind(sid, code),
  env.DB.prepare('DELETE FROM students WHERE sid=? AND code=?').bind(sid, code),
]);

async function sameName(env, inorm) {
  const missing = await env.DB.prepare('SELECT code,instructor FROM classes WHERE inorm IS NULL LIMIT 500').all();
  if (missing.results.length) await env.DB.batch(missing.results.map(c => env.DB.prepare('UPDATE classes SET inorm=? WHERE code=?').bind(norm(c.instructor), c.code)));
  return (await env.DB.prepare('SELECT code,admin_hash FROM classes WHERE inorm=?').bind(inorm).all()).results;
}

export default {
  async fetch(req, env, ctx) {
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(req, env) } });
    const err = (status, msg) => json({ error: msg }, status);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req, env) });
    const url = new URL(req.url), p = url.pathname.split('/').filter(Boolean);
    if (p[0] !== 'api') return new Response('Not found', { status: 404 });
    try {
      // POST /api/reports {ref, kind, text} -> {ok}. Anonymous.
      if (p[1] === 'reports' && p.length === 2 && req.method === 'POST') {
        const b = await body(req), ref = clean(b.ref, 60), kind = clean(b.kind, 20), text = clean(b.text, LIM.report);
        if (!REF_RE.test(ref)) return err(400, 'That report is not about anything we know');
        if (!KINDS.includes(kind)) return err(400, 'Pick what is wrong first');
        const slow = await limited(env, req, 'report'); if (slow) return err(429, slow);
        const n = await env.DB.prepare('SELECT COUNT(*) n FROM reports').first();
        if (n.n >= REPORTS_MAX) return err(503, 'We cannot take new reports right now. Please try again tomorrow.');
        await env.DB.prepare('INSERT INTO reports(id,ref,kind,text,created) VALUES(?,?,?,?,?)').bind(rand(9), ref, kind, text || null, Date.now()).run();
        return json({ ok: true });
      }

      // POST /api/classes {name, instructor, own?:[{code,key}]} -> {code, adminKey, name, instructor}
      if (p[1] === 'classes' && p.length === 2 && req.method === 'POST') {
        const b = await body(req), name = clean(b.name, LIM.cls), instructor = clean(b.instructor, LIM.name), inorm = norm(instructor);
        if (!instructor || !inorm) return err(400, 'Instructor name is required');
        const slow = await limited(env, req, 'class'); if (slow) return err(429, slow);
        const twins = await sameName(env, inorm);
        if (twins.length) {
          const own = Array.isArray(b.own) ? b.own.slice(0, LIM.own) : [];
          let proven = false;
          for (const o of own) {
            if (!o || typeof o.code !== 'string' || typeof o.key !== 'string') continue;
            const t = twins.find(c => c.code === o.code.toUpperCase());
            if (t && t.admin_hash === await sha(o.key)) { proven = true; break; }
          }
          if (!proven) return err(409, `There is already a class for an instructor named ${instructor.replace(/[\s.,;:!?]+$/, '')}. If that is you, open your instructor hub on this device first (use your private hub link), then start the new class. If you are a different instructor with the same name, add a middle initial.`);
        }
        const adminKey = rand(24), cname = name || `${instructor}'s class`;
        for (let i = 0; i < 5; i++) {
          const code = code6();
          const r = await env.DB.prepare('INSERT OR IGNORE INTO classes(code,name,instructor,admin_hash,created,inorm) VALUES(?,?,?,?,?,?)')
            .bind(code, cname, instructor, await sha(adminKey), Date.now(), inorm).run();
          if (r.meta.changes) return json({ code, adminKey, name: cname, instructor });
        }
        return err(500, 'Could not make a class code');
      }
      if (p[1] !== 'classes' || !p[2]) return err(404, 'Not found');
      const code = p[2].toUpperCase();
      const cls = await env.DB.prepare('SELECT code,name,instructor,verified FROM classes WHERE code=?').bind(code).first();
      if (!cls) return err(404, 'No class with that code');

      // GET /api/classes/:code -> public class info (for the join screen), incl. verified 0/1
      if (p.length === 3 && req.method === 'GET') return json(cls);

      if (p[3] === 'students') {
        // POST /api/classes/:code/students {name} -> {sid, key, name, class}
        if (p.length === 4 && req.method === 'POST') {
          const name = clean((await body(req)).name, LIM.name);
          if (!name) return err(400, 'Your name is required');
          const slow = await limited(env, req, 'join'); if (slow) return err(429, slow);
          const n = await env.DB.prepare('SELECT COUNT(*) n FROM students WHERE code=? AND created>?').bind(code, Date.now() - DAY).first();
          if (n.n >= JOINS_PER_CLASS_DAY) return err(429, 'This class has had a lot of new students today. Please try again tomorrow, or ask your instructor.');
          const sid = rand(9), key = rand(24);
          await env.DB.prepare('INSERT INTO students(sid,code,name,key_hash,created) VALUES(?,?,?,?,?)').bind(sid, code, name, await sha(key), Date.now()).run();
          return json({ sid, key, name, class: cls });
        }
        // DELETE /api/classes/:code/students/me (X-Student) -> the student leaves and their questions are deleted
        if (p[4] === 'me' && p.length === 5 && req.method === 'DELETE') {
          const s = await student(env, req, code); if (!s) return err(401, 'Not in this class');
          await dropStudent(env, code, s.sid);
          return json({ ok: true });
        }
        // DELETE /api/classes/:code/students/:sid (hub) -> the instructor removes a student and their questions
        if (p[4] && p.length === 5 && req.method === 'DELETE') {
          if (!await admin(env, req, code)) return err(401, 'Hub key not recognised');
          const r = await dropStudent(env, code, p[4]);
          return r[r.length - 1].meta.changes ? json({ ok: true }) : err(404, 'That student is not in this class');
        }
      }

      if (p[3] === 'questions') {
        // student: GET mine, POST new, POST :id/seen
        if (p[4] === 'mine' && req.method === 'GET') {
          const s = await student(env, req, code); if (!s) return err(401, 'Not in this class');
          const r = await env.DB.prepare('SELECT id,topic,qid,picked,text,created,answer,answered,seen FROM questions WHERE sid=? ORDER BY created DESC LIMIT 200').bind(s.sid).all();
          return json({ name: s.name, class: cls, questions: r.results });
        }
        if (p.length === 4 && req.method === 'POST') {
          const s = await student(env, req, code); if (!s) return err(401, 'Not in this class');
          const b = await body(req), text = clean(b.text, LIM.text);
          if (!text) return err(400, 'Type your question first');
          const n = await env.DB.prepare('SELECT COUNT(*) n FROM questions WHERE sid=? AND created>?').bind(s.sid, Date.now() - DAY).first();
          if (n.n >= LIM.perDay) return err(429, 'That is a lot of questions for one day. Try again tomorrow.');
          const picked = [0, 1, 2].includes(b.picked) ? b.picked : null;
          const q = { id: rand(9), topic: clean(b.topic, LIM.topic) || null, qid: clean(b.qid, LIM.qid) || null, picked, text, created: Date.now() };
          await env.DB.prepare('INSERT INTO questions(id,code,sid,topic,qid,picked,text,created) VALUES(?,?,?,?,?,?,?,?)').bind(q.id, code, s.sid, q.topic, q.qid, q.picked, q.text, q.created).run();
          return json(q);
        }
        if (p[5] === 'seen' && req.method === 'POST') {
          const s = await student(env, req, code); if (!s) return err(401, 'Not in this class');
          await env.DB.prepare('UPDATE questions SET seen=1 WHERE id=? AND sid=?').bind(p[4], s.sid).run();
          return json({ ok: true });
        }
        // instructor: POST :id/answer {text}
        if (p[5] === 'answer' && req.method === 'POST') {
          if (!await admin(env, req, code)) return err(401, 'Hub key not recognised');
          const text = clean((await body(req)).text, LIM.text);
          if (!text) return err(400, 'Type an answer first');
          const r = await env.DB.prepare('UPDATE questions SET answer=?, answered=?, seen=0 WHERE id=? AND code=?').bind(text, Date.now(), p[4], code).run();
          if (r.meta.changes) ctx.waitUntil(notifyAnswer(env, code, p[4])); // phone notification; never holds up or breaks the answer
          return r.meta.changes ? json({ ok: true }) : err(404, 'Question not found');
        }
        // instructor (or a helper holding the hub key): POST :id/draft {text} -> a suggested answer, shown only in the hub.
        // Never touches answer/seen; only for questions still waiting. Empty text clears the draft.
        if (p[5] === 'draft' && req.method === 'POST') {
          if (!await admin(env, req, code)) return err(401, 'Hub key not recognised');
          const text = clean((await body(req)).text, LIM.text);
          const r = await env.DB.prepare('UPDATE questions SET draft=? WHERE id=? AND code=? AND answered IS NULL').bind(text || null, p[4], code).run();
          if (r.meta.changes) return json({ ok: true });
          const q = await env.DB.prepare('SELECT answered FROM questions WHERE id=? AND code=?').bind(p[4], code).first();
          return q ? err(409, 'That question is already answered') : err(404, 'Question not found');
        }
      }
      // push (student): GET -> {key} (null = notifications off), POST subscribe {endpoint, keys}, POST unsubscribe {endpoint?}
      if (p[3] === 'push') {
        const s = await student(env, req, code); if (!s) return err(401, 'Not in this class');
        if (p.length === 4 && req.method === 'GET') return json(pushKey(env));
        if ((p[4] === 'subscribe' || p[4] === 'unsubscribe') && req.method === 'POST') { const r = await (p[4] === 'subscribe' ? subscribe : unsubscribe)(env, s, await body(req)); return r.error ? err(400, r.error) : json(r); }
      }
      // GET /api/classes/:code/hub -> everything for the instructor
      if (p[3] === 'hub' && req.method === 'GET') {
        const c = await admin(env, req, code); if (!c) return err(401, 'Hub key not recognised');
        const st = await env.DB.prepare('SELECT sid,name,created FROM students WHERE code=? ORDER BY created').bind(code).all();
        const qs = await env.DB.prepare('SELECT id,sid,topic,qid,picked,text,created,answer,answered,draft FROM questions WHERE code=? ORDER BY created DESC LIMIT 500').bind(code).all();
        return json({ class: cls, students: st.results, questions: qs.results, owner: c.owner ? 1 : 0 });
      }
      // GET /api/classes/:code/reports, DELETE /api/classes/:code/reports/:id -> the app owner's problem reports (hub key of an owner class)
      if (p[3] === 'reports') {
        const c = await admin(env, req, code); if (!c) return err(401, 'Hub key not recognised');
        if (!c.owner) return err(403, 'Only the app owner can see problem reports');
        if (p.length === 4 && req.method === 'GET') {
          const r = await env.DB.prepare('SELECT id,ref,kind,text,created FROM reports ORDER BY created DESC LIMIT 500').all();
          return json({ reports: r.results });
        }
        if (p.length === 5 && req.method === 'DELETE') {
          const r = await env.DB.prepare('DELETE FROM reports WHERE id=?').bind(p[4]).run();
          return r.meta.changes ? json({ ok: true }) : err(404, 'Report not found');
        }
      }
      return err(404, 'Not found');
    } catch (e) {
      return err(500, 'Something went wrong');
    }
  }
};
