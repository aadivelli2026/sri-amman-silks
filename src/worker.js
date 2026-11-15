// நியூ ஸ்ரீ அம்மன் ஜவுளி – Cloudflare Worker
// 1) public/ கோப்புகளை வழங்குகிறது (UTF-8 உறுதியுடன்)
// 2) Admin உள்நுழைவு + ஒவ்வொரு பிரிவு / ரகத்துக்கான உண்மையான படங்கள் (Cloudflare KV)
// ரகசியம்: ADMIN_PASSWORD (Cloudflare Secret) – GitHub-ல் வைக்க வேண்டாம்

const enc = new TextEncoder();
const KEY_RE = /^(?:cat|item):[a-z0-9]+$/;

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
const safeEq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const secretOf = (env) => String(env.TOKEN_SECRET || env.ADMIN_PASSWORD || '');

async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
async function pbkdf(pw, salt) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, k, 256));
}
async function checkPassword(env, pw) {
  const stored = await env.PHOTOS.get('cfg:pw'); // Admin பக்கத்தில் மாற்றிய கடவுச்சொல்
  if (stored) { const [salt, h] = stored.split(':'); return safeEq(await pbkdf(pw, salt), h); }
  return !!env.ADMIN_PASSWORD && safeEq(pw, String(env.ADMIN_PASSWORD));
}
async function makeToken(env) {
  const p = b64u(enc.encode(JSON.stringify({ exp: Date.now() + 12 * 3600 * 1000 })));
  return p + '.' + (await hmac(secretOf(env), p));
}
async function tokenOk(env, req) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const [p, s] = t.split('.');
  if (!p || !s || !secretOf(env)) return false;
  if (!safeEq(await hmac(secretOf(env), p), s)) return false;
  try { return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))).exp > Date.now(); } catch (e) { return false; }
}

async function api(req, env, ctx, url) {
  const J = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...h } });
  if (!env.PHOTOS) return J({ ok: false, error: 'no-kv' }, 503);
  const p = url.pathname, m = req.method;

  if (p === '/api/login' && m === 'POST') {
    if (!secretOf(env)) return J({ ok: false, error: 'no-secret' }, 503);
    let b = {}; try { b = await req.json(); } catch (e) {}
    if (await checkPassword(env, String(b.password || ''))) return J({ ok: true, token: await makeToken(env) });
    await new Promise((r) => setTimeout(r, 700));
    return J({ ok: false }, 401);
  }

  if (p === '/api/photos' && m === 'GET') {
    const idx = (await env.PHOTOS.get('index', 'json')) || {};
    const out = {}; for (const k in idx) out[k] = '/api/img/' + k + '?v=' + idx[k];
    return J(out, 200, { 'cache-control': 'public, max-age=30' });
  }

  const im = p.match(/^\/api\/img\/((?:cat|item):[a-z0-9]+)$/);
  if (im && m === 'GET') {
    const cache = caches.default;
    let r = await cache.match(req);
    if (r) return r;
    const v = await env.PHOTOS.getWithMetadata('img:' + im[1], 'arrayBuffer');
    if (!v.value) return new Response('not found', { status: 404 });
    r = new Response(v.value, { headers: { 'content-type': (v.metadata && v.metadata.ct) || 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } });
    ctx.waitUntil(cache.put(req, r.clone()));
    return r;
  }

  const pm = p.match(/^\/api\/photo\/((?:cat|item):[a-z0-9]+)$/);
  if (pm) {
    if (!(await tokenOk(env, req))) return J({ ok: false }, 401);
    const key = pm[1];
    if (m === 'PUT') {
      const buf = await req.arrayBuffer();
      if (buf.byteLength < 100 || buf.byteLength > 3000000) return J({ ok: false, error: 'size' }, 413);
      const ct = (req.headers.get('content-type') || 'image/jpeg').split(';')[0];
      if (!/^image\/(jpeg|png|webp)$/.test(ct)) return J({ ok: false, error: 'type' }, 415);
      const t = Date.now();
      await env.PHOTOS.put('img:' + key, buf, { metadata: { ct, t } });
      const idx = (await env.PHOTOS.get('index', 'json')) || {}; idx[key] = t;
      await env.PHOTOS.put('index', JSON.stringify(idx));
      return J({ ok: true, url: '/api/img/' + key + '?v=' + t });
    }
    if (m === 'DELETE') {
      await env.PHOTOS.delete('img:' + key);
      const idx = (await env.PHOTOS.get('index', 'json')) || {}; delete idx[key];
      await env.PHOTOS.put('index', JSON.stringify(idx));
      return J({ ok: true });
    }
  }

  if (p === '/api/password' && m === 'POST') {
    if (!(await tokenOk(env, req))) return J({ ok: false }, 401);
    let b = {}; try { b = await req.json(); } catch (e) {}
    if (!(await checkPassword(env, String(b.old || '')))) return J({ ok: false }, 403);
    const np = String(b.new || '');
    if (np.length < 8) return J({ ok: false, error: 'short' }, 400);
    const salt = crypto.randomUUID();
    await env.PHOTOS.put('cfg:pw', salt + ':' + (await pbkdf(np, salt)));
    return J({ ok: true });
  }
  return J({ ok: false }, 404);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return api(req, env, ctx, url);
    const res = await env.ASSETS.fetch(req);
    const ct = res.headers.get('content-type') || '';
    if (ct.startsWith('text/html') && !/charset/i.test(ct)) { // தமிழ் உடையாமல் இருக்க UTF-8 உறுதி
      const h = new Headers(res.headers); h.set('content-type', 'text/html; charset=utf-8');
      return new Response(res.body, { status: res.status, headers: h });
    }
    return res;
  },
};
