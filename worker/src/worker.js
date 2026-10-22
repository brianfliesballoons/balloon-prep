// balloon-prep-qa: students ask their instructor, the instructor answers in a hub.
// No accounts. A class has a public join code and a secret hub key; a student has a secret key. Only hashes are stored.
import { pushKey, subscribe, unsubscribe, notifyAnswer } from './push.js';
const ORIGINS = ['https://brianfliesballoons.github.io', 'http://localhost:8765'];
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LIM = { name: 60, cls: 80, text: 2000, perDay: 50, topic: 40, qid: 20 };

const rand = n => { const b = crypto.getRandomValues(new Uint8Array(n)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const code6 = () => { const b = crypto.getRandomValues(new Uint8Array(6)); return [...b].map(x => ALPHA[x % ALPHA.length]).join(''); };
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

function cors(req) {
  const o = req.headers.get('Origin');
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Student', 'Vary': 'Origin' };
}
const json = (req, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(req) } });
const err = (req, status, msg) => json(req, { error: msg }, status);

async function body(req) { try { return await req.json(); } catch { return {}; } }
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

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url), p = url.pathname.split('/').filter(Boolean);
    if (p[0] !== 'api') return new Response('Not found', { status: 404 });
    try {
      // POST /api/classes {name, instructor} -> {code, adminKey}
      if (p[1] === 'classes' && p.length === 2 && req.method === 'POST') {
        const b = await body(req), name = clean(b.name, LIM.cls), instructor = clean(b.instructor, LIM.name);
        if (!instructor) return err(req, 400, 'Instructor name is required');
        const adminKey = rand(24);
        for (let i = 0; i < 5; i++) {
          const code = code6();
          const r = await env.DB.prepare('INSERT OR IGNORE INTO classes(code,name,instructor,admin_hash,created) VALUES(?,?,?,?,?)')
            .bind(code, name || `${instructor}'s class`, instructor, await sha(adminKey), Date.now()).run();
          if (r.meta.changes) return json(req, { code, adminKey, name: name || `${instructor}'s class`, instructor });
        }
        return err(req, 500, 'Could not make a class code');
      }
      if (p[1] !== 'classes' || !p[2]) return err(req, 404, 'Not found');
      const code = p[2].toUpperCase();
      const cls = await env.DB.prepare('SELECT code,name,instructor FROM classes WHERE code=?').bind(code).first();
      if (!cls) return err(req, 404, 'No class with that code');

      // GET /api/classes/:code -> public class info (for the join screen)
      if (p.length === 3 && req.method === 'GET') return json(req, cls);

      // POST /api/classes/:code/students {name} -> {sid, key}
      if (p[3] === 'students' && p.length === 4 && req.method === 'POST') {
        const name = clean((await body(req)).name, LIM.name);
        if (!name) return err(req, 400, 'Your name is required');
        const sid = rand(9), key = rand(24);
        await env.DB.prepare('INSERT INTO students(sid,code,name,key_hash,created) VALUES(?,?,?,?,?)').bind(sid, code, name, await sha(key), Date.now()).run();
        return json(req, { sid, key, name, class: cls });
      }

      if (p[3] === 'questions') {
        // student: GET mine, POST new, POST :id/seen
        if (p[4] === 'mine' && req.method === 'GET') {
          const s = await student(env, req, code); if (!s) return err(req, 401, 'Not in this class');
          const r = await env.DB.prepare('SELECT id,topic,qid,picked,text,created,answer,answered,seen FROM questions WHERE sid=? ORDER BY created DESC LIMIT 200').bind(s.sid).all();
          return json(req, { name: s.name, class: cls, questions: r.results });
        }
        if (p.length === 4 && req.method === 'POST') {
          const s = await student(env, req, code); if (!s) return err(req, 401, 'Not in this class');
          const b = await body(req), text = clean(b.text, LIM.text);
          if (!text) return err(req, 400, 'Type your question first');
          const n = await env.DB.prepare('SELECT COUNT(*) n FROM questions WHERE sid=? AND created>?').bind(s.sid, Date.now() - 864e5).first();
          if (n.n >= LIM.perDay) return err(req, 429, 'That is a lot of questions for one day. Try again tomorrow.');
          const picked = [0, 1, 2].includes(b.picked) ? b.picked : null;
          const q = { id: rand(9), topic: clean(b.topic, LIM.topic) || null, qid: clean(b.qid, LIM.qid) || null, picked, text, created: Date.now() };
          await env.DB.prepare('INSERT INTO questions(id,code,sid,topic,qid,picked,text,created) VALUES(?,?,?,?,?,?,?,?)').bind(q.id, code, s.sid, q.topic, q.qid, q.picked, q.text, q.created).run();
          return json(req, q);
        }
        if (p[5] === 'seen' && req.method === 'POST') {
          const s = await student(env, req, code); if (!s) return err(req, 401, 'Not in this class');
          await env.DB.prepare('UPDATE questions SET seen=1 WHERE id=? AND sid=?').bind(p[4], s.sid).run();
          return json(req, { ok: true });
        }
        // instructor: POST :id/answer {text}
        if (p[5] === 'answer' && req.method === 'POST') {
          if (!await admin(env, req, code)) return err(req, 401, 'Hub key not recognised');
          const text = clean((await body(req)).text, LIM.text);
          if (!text) return err(req, 400, 'Type an answer first');
          const r = await env.DB.prepare('UPDATE questions SET answer=?, answered=?, seen=0 WHERE id=? AND code=?').bind(text, Date.now(), p[4], code).run();
          if (r.meta.changes) ctx.waitUntil(notifyAnswer(env, code, p[4])); // phone notification; never holds up or breaks the answer
          return r.meta.changes ? json(req, { ok: true }) : err(req, 404, 'Question not found');
        }
      }
      // push (student): GET -> {key} (null = notifications off), POST subscribe {endpoint, keys}, POST unsubscribe {endpoint?}
      if (p[3] === 'push') {
        const s = await student(env, req, code); if (!s) return err(req, 401, 'Not in this class');
        if (p.length === 4 && req.method === 'GET') return json(req, pushKey(env));
        if ((p[4] === 'subscribe' || p[4] === 'unsubscribe') && req.method === 'POST') { const r = await (p[4] === 'subscribe' ? subscribe : unsubscribe)(env, s, await body(req)); return r.error ? err(req, 400, r.error) : json(req, r); }
      }
      // GET /api/classes/:code/hub -> everything for the instructor
      if (p[3] === 'hub' && req.method === 'GET') {
        if (!await admin(env, req, code)) return err(req, 401, 'Hub key not recognised');
        const st = await env.DB.prepare('SELECT sid,name,created FROM students WHERE code=? ORDER BY created').bind(code).all();
        const qs = await env.DB.prepare('SELECT id,sid,topic,qid,picked,text,created,answer,answered FROM questions WHERE code=? ORDER BY created DESC LIMIT 500').bind(code).all();
        return json(req, { class: cls, students: st.results, questions: qs.results });
      }
      return err(req, 404, 'Not found');
    } catch (e) {
      return err(req, 500, 'Something went wrong');
    }
  }
};
