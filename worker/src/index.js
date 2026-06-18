// FreeCode account Worker — Cloudflare Workers + KV
// Stores accounts (hashed passwords) and per-account synced config.
const enc = new TextEncoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a.buffer);
}

async function hashPassword(password, saltHex) {
  const salt = enc.encode(saltHex);
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  return toHex(bits);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function validCreds(body) {
  return (
    body &&
    typeof body.username === "string" &&
    typeof body.password === "string" &&
    /^[a-zA-Z0-9_.-]{3,32}$/.test(body.username) &&
    body.password.length >= 6
  );
}

async function userFromToken(req, env) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return (await env.ACCOUNTS.get(`token:${m[1]}`)) || null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (method === "GET" && path === "/") {
        return json({ service: "freecode-accounts", ok: true });
      }

      if (method === "POST" && path === "/register") {
        const body = await request.json().catch(() => null);
        if (!validCreds(body)) return json({ error: "Invalid username or password (min 6 chars)" }, 400);
        const existing = await env.ACCOUNTS.get(`user:${body.username}`);
        if (existing) return json({ error: "Username already taken" }, 409);
        const salt = randHex(16);
        const hash = await hashPassword(body.password, salt);
        const record = { salt, hash, data: {}, createdAt: Date.now() };
        await env.ACCOUNTS.put(`user:${body.username}`, JSON.stringify(record));
        return json({ ok: true });
      }

      if (method === "POST" && path === "/login") {
        const body = await request.json().catch(() => null);
        if (!validCreds(body)) return json({ error: "Invalid credentials" }, 400);
        const raw = await env.ACCOUNTS.get(`user:${body.username}`);
        if (!raw) return json({ error: "Invalid username or password" }, 401);
        const record = JSON.parse(raw);
        const hash = await hashPassword(body.password, record.salt);
        if (!timingSafeEqual(hash, record.hash)) return json({ error: "Invalid username or password" }, 401);
        const token = randHex(24);
        await env.ACCOUNTS.put(`token:${token}`, body.username, { expirationTtl: 60 * 60 * 24 * 30 });
        return json({ ok: true, token, data: record.data || {} });
      }

      if (method === "POST" && path === "/logout") {
        const auth = request.headers.get("authorization") || "";
        const m = auth.match(/^Bearer\s+(.+)$/i);
        if (m) await env.ACCOUNTS.delete(`token:${m[1]}`);
        return json({ ok: true });
      }

      if (path === "/account") {
        const username = await userFromToken(request, env);
        if (!username) return json({ error: "Unauthorized" }, 401);
        const raw = await env.ACCOUNTS.get(`user:${username}`);
        if (!raw) return json({ error: "Account not found" }, 404);
        const record = JSON.parse(raw);
        if (method === "GET") return json({ ok: true, username, data: record.data || {} });
        if (method === "PUT") {
          const body = await request.json().catch(() => null);
          if (!body || typeof body.data !== "object" || body.data === null)
            return json({ error: "Missing data" }, 400);
          record.data = body.data;
          await env.ACCOUNTS.put(`user:${username}`, JSON.stringify(record));
          return json({ ok: true });
        }
      }

      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: "Server error", detail: String(e) }, 500);
    }
  },
};
