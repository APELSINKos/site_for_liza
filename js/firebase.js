(function () {
  var db = null;
  var usingCloud = false;

  try {
    if (window.HAS_FIREBASE && window.firebase && firebase.initializeApp) {
      firebase.initializeApp(window.firebaseConfig);
      db = firebase.database();
      usingCloud = true;
    }
  } catch (e) {
    usingCloud = false;
    db = null;
  }

  function lsKey(path) { return "app:" + path; }
  function lsRead(path) {
    try { var raw = localStorage.getItem(lsKey(path)); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function lsWrite(path, obj) {
    try { localStorage.setItem(lsKey(path), JSON.stringify(obj)); } catch (e) {}
  }

  function read(path) {
    if (usingCloud && db) {
      return db.ref(path).once("value")
        .then(function (snap) { return snap.val(); })
        .catch(function () { return lsRead(path); });
    }
    return Promise.resolve(lsRead(path));
  }

  function write(path, obj) {
    lsWrite(path, obj);
    if (usingCloud && db) {
      return db.ref(path).set(obj).catch(function () {});
    }
    return Promise.resolve();
  }

  function update(path, partial) {
    return read(path).then(function (cur) {
      var merged = Object.assign({}, cur || {}, partial);
      return write(path, merged).then(function () { return merged; });
    });
  }

  function uid() {
    var k = "device_id", v = null;
    try { v = localStorage.getItem(k); } catch (e) {}
    if (!v) {
      v = "u_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      try { localStorage.setItem(k, v); } catch (e) {}
    }
    return v;
  }

  window.Store = { read: read, write: write, update: update, uid: uid, usingCloud: function () { return usingCloud; } };
})();
