const ALLOWED_ORIGINS = [
  "https://lisadiva.web.app",
  "https://lisadiva.firebaseapp.com"
];

function corsHeaders(origin) {
  const allowed = origin && ALLOWED_ORIGINS.indexOf(origin) !== -1;
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      return new Response("Not found", { status: 404, headers });
    }

    let text = "";
    try {
      const body = await request.json();
      text = (body && body.text) ? String(body.text).slice(0, 3500) : "";
    } catch (e) {
      return new Response("Bad request", { status: 400, headers });
    }

    const ip = request.headers.get("CF-Connecting-IP") || "?";
    const cf = request.cf || {};
    const country = cf.country || request.headers.get("CF-IPCountry") || "?";
    const city = cf.city || "";
    const place = country + (city ? ", " + city : "");
    const message = "IP: " + ip + " (" + place + ")\n" + text;

    try {
      await fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.CHAT_ID,
          text: message,
          disable_web_page_preview: true
        })
      });
    } catch (e) {
      return new Response("upstream error", { status: 502, headers });
    }

    return new Response("ok", { status: 200, headers });
  }
};
