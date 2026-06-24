(function () {
  var keep = [];

  function viaProxy(url, text) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text }),
      cache: "no-store",
      keepalive: true
    }).then(function (r) { return !!(r && r.ok); }).catch(function () { return false; });
  }

  function direct(text) {
    var url = "https://api.telegram.org/bot" + window.TELEGRAM.botToken + "/sendMessage" +
      "?chat_id=" + encodeURIComponent(window.TELEGRAM.chatId) +
      "&disable_web_page_preview=true" +
      "&text=" + encodeURIComponent(text);

    function beacon() {
      try {
        var img = new Image();
        keep.push(img);
        img.onload = img.onerror = function () { var i = keep.indexOf(img); if (i >= 0) keep.splice(i, 1); };
        img.src = url;
      } catch (e) {}
    }
    if (window.fetch) {
      return fetch(url, { method: "GET", mode: "no-cors", cache: "no-store", keepalive: true })
        .then(function () { return true; })
        .catch(function () { beacon(); return false; });
    }
    beacon();
    return Promise.resolve(true);
  }

  function sendTelegram(text) {
    if (!window.HAS_TELEGRAM) return Promise.resolve(false);
    var t = window.TELEGRAM || {};
    if (t.proxyUrl) return viaProxy(t.proxyUrl, text);
    if (t.botToken && t.chatId) return direct(text);
    return Promise.resolve(false);
  }

  // Check a secret-phrase guess against the Worker. The phrase list lives only
  // in server-side KV, so the answer is never present in the page. The Worker
  // also notifies the owner of every attempt. Resolves to { ok, episode, error }.
  function checkPhrase(phrase) {
    var t = window.TELEGRAM || {};
    var base = t.proxyUrl ? String(t.proxyUrl).replace(/\/+$/, "") : "";
    if (!base) return Promise.resolve({ ok: false, error: "noproxy" });
    return fetch(base + "/phrase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phrase: phrase }),
      cache: "no-store"
    })
      .then(function (r) { return r && r.ok ? r.json() : { ok: false, error: "http" }; })
      .catch(function () { return { ok: false, error: "net" }; });
  }

  window.sendTelegram = sendTelegram;
  window.checkPhrase = checkPhrase;
})();
