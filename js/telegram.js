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

  window.sendTelegram = sendTelegram;
})();
