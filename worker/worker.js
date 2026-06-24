// Cloudflare Worker — Telegram relay + secret-phrase gateway for the Liza site.
//
// Routes (all on the same Worker URL):
//   POST /            -> relay a { text } notification to the owner (existing behaviour)
//   POST /phrase      -> { phrase } guess from the site; checked against KV, never echoed
//   POST /tg/<secret> -> Telegram webhook; owner-only commands manage the phrase list
//
// Secrets/bindings (see worker/README.md):
//   env.BOT_TOKEN       Telegram bot token              (wrangler secret)
//   env.CHAT_ID         owner chat id                   (wrangler secret)
//   env.WEBHOOK_SECRET  random string in the /tg/ path  (wrangler secret)
//   env.PHRASES         KV namespace holding the phrases (wrangler.toml binding)
//
// The phrase list lives only in KV. The browser can submit a guess but can never
// read the list, so the answer never appears in the page source / element inspector.

const ALLOWED_ORIGINS = [
  "https://lisadiva.web.app",
  "https://lisadiva.firebaseapp.com"
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.indexOf(origin) !== -1) return true;
  // Allow any localhost / 127.0.0.1 port for local testing.
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, headers || {})
  });
}

function normalizePhrase(s) {
  return String(s == null ? "" : s)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripQuotes(s) {
  return String(s == null ? "" : s).trim().replace(/^["'«»“”]+|["'«»“”]+$/g, "").trim();
}

function kvKey(norm) { return "p:" + norm; }

async function tgSend(env, text, chatId) {
  try {
    await fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId || env.CHAT_ID,
        text: text,
        disable_web_page_preview: true
      })
    });
    return true;
  } catch (e) {
    return false;
  }
}

function clientInfo(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "?";
  const cf = request.cf || {};
  const country = cf.country || request.headers.get("CF-IPCountry") || "?";
  const city = cf.city || "";
  return "IP: " + ip + " (" + country + (city ? ", " + city : "") + ")";
}

// ---- POST / : relay a plain notification to the owner -----------------------
async function handleNotify(request, env, headers) {
  let text = "";
  try {
    const body = await request.json();
    text = body && body.text ? String(body.text).slice(0, 3500) : "";
  } catch (e) {
    return new Response("Bad request", { status: 400, headers });
  }
  await tgSend(env, clientInfo(request) + "\n" + text);
  return new Response("ok", { status: 200, headers });
}

// ---- POST /phrase : check a guess against KV (answer never returned) --------
async function handlePhrase(request, env, headers) {
  let phrase = "";
  try {
    const body = await request.json();
    phrase = body && body.phrase ? String(body.phrase).slice(0, 200) : "";
  } catch (e) {
    return json({ ok: false, error: "bad_request" }, 400, headers);
  }

  const norm = normalizePhrase(phrase);
  let ok = false, episode = null;

  if (norm && env.PHRASES) {
    const raw = await env.PHRASES.get(kvKey(norm));
    if (raw) {
      try {
        const rec = JSON.parse(raw);
        ok = true;
        episode = rec.episode || null;
      } catch (e) {}
    }
  }

  const note = ok
    ? "🔓 Введена СЕКРЕТНАЯ фраза: «" + phrase + "» → открыт " + episode
    : "🔑 Введена фраза: «" + phrase + "» — не подошла";
  await tgSend(env, clientInfo(request) + "\n" + note);

  return json({ ok: ok, episode: episode }, 200, headers);
}

// ---- POST /tg/<secret> : Telegram webhook, owner-only phrase management -----
const HELP =
  "Команды управления фразами:\n" +
  "• Phrase: текст - Episode 2  — добавить фразу\n" +
  "• Edit Phrase \"текст\" Episode 3  — перенаправить фразу на другой эпизод\n" +
  "• Delete Phrase \"текст\"  — удалить фразу\n" +
  "• List Phrases  — показать все фразы";

async function handleWebhook(request, env) {
  let update;
  try {
    update = await request.json();
  } catch (e) {
    return new Response("ok", { status: 200 });
  }

  const msg = update && update.message;
  if (!msg || !msg.text) return new Response("ok", { status: 200 });

  // Owner-only: ignore anyone who is not the configured chat.
  if (String(msg.chat && msg.chat.id) !== String(env.CHAT_ID)) {
    return new Response("ok", { status: 200 });
  }

  if (!env.PHRASES) {
    await tgSend(env, "⚠️ KV namespace PHRASES не привязан. См. worker/README.md (шаг 1).");
    return new Response("ok", { status: 200 });
  }

  const text = String(msg.text).trim();
  let m;

  // Add: Phrase: <text> - Episode N
  if ((m = text.match(/^Phrase:\s*(.+?)\s*-\s*Episode\s*(\d+)\s*$/i))) {
    const raw = m[1].trim();
    const episode = "ep" + m[2];
    const norm = normalizePhrase(raw);
    if (!norm) {
      await tgSend(env, "⚠️ Пустая фраза.");
    } else {
      await env.PHRASES.put(kvKey(norm), JSON.stringify({ episode: episode, raw: raw, ts: Date.now() }));
      await tgSend(env, "✅ Фраза сохранена для " + episode + ":\n«" + raw + "»");
    }
    return new Response("ok", { status: 200 });
  }

  // Edit (re-point existing phrase): Edit Phrase "<text>" Episode N
  if ((m = text.match(/^Edit\s+Phrase\s+(.+?)\s+Episode\s*(\d+)\s*$/i))) {
    const raw = stripQuotes(m[1]);
    const episode = "ep" + m[2];
    const norm = normalizePhrase(raw);
    const existing = norm ? await env.PHRASES.get(kvKey(norm)) : null;
    if (!existing) {
      await tgSend(env, "⚠️ Фразы «" + raw + "» нет в списке. Сначала добавь её через Phrase:");
    } else {
      await env.PHRASES.put(kvKey(norm), JSON.stringify({ episode: episode, raw: raw, ts: Date.now() }));
      await tgSend(env, "✏️ Фраза «" + raw + "» теперь открывает " + episode);
    }
    return new Response("ok", { status: 200 });
  }

  // Delete: Delete Phrase "<text>"
  if ((m = text.match(/^Delete\s+Phrase\s+(.+?)\s*$/i))) {
    const raw = stripQuotes(m[1]);
    const norm = normalizePhrase(raw);
    const existing = norm ? await env.PHRASES.get(kvKey(norm)) : null;
    if (!existing) {
      await tgSend(env, "⚠️ Фразы «" + raw + "» нет в списке.");
    } else {
      await env.PHRASES.delete(kvKey(norm));
      await tgSend(env, "🗑 Фраза «" + raw + "» удалена.");
    }
    return new Response("ok", { status: 200 });
  }

  // List: List Phrase(s)
  if (/^List\s+Phrases?\s*$/i.test(text)) {
    const list = await env.PHRASES.list({ prefix: "p:", limit: 100 });
    if (!list.keys.length) {
      await tgSend(env, "Список фраз пуст.");
    } else {
      const lines = [];
      for (const k of list.keys) {
        const raw = await env.PHRASES.get(k.name);
        let rec = {};
        try { rec = JSON.parse(raw); } catch (e) {}
        lines.push("• «" + (rec.raw || k.name.slice(2)) + "» → " + (rec.episode || "?"));
      }
      await tgSend(env, "Фразы (" + lines.length + "):\n" + lines.join("\n"));
    }
    return new Response("ok", { status: 200 });
  }

  // Help / hint
  if (/^(\/start|\/help|help|помощь)\s*$/i.test(text) || /^(Phrase|Edit|Delete|List)\b/i.test(text)) {
    await tgSend(env, "Не понял формат.\n\n" + HELP);
  }
  return new Response("ok", { status: 200 });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    // Telegram webhook — server-to-server, gated by the secret path segment.
    if (path.indexOf("/tg/") === 0) {
      if (request.method !== "POST") return new Response("Not found", { status: 404 });
      const secret = path.slice("/tg/".length);
      if (!env.WEBHOOK_SECRET || secret !== env.WEBHOOK_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      return handleWebhook(request, env);
    }

    if (request.method !== "POST") {
      return new Response("Not found", { status: 404, headers });
    }

    if (path === "/phrase") return handlePhrase(request, env, headers);
    return handleNotify(request, env, headers);
  }
};
