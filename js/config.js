window.firebaseConfig = {
  apiKey: "AIzaSyAa4zFeOSrbjF4ZklEJbhY0kbGvMGGFvrI",
  authDomain: "lisadiva.firebaseapp.com",
  databaseURL: "https://lisadiva-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "lisadiva",
  storageBucket: "lisadiva.firebasestorage.app",
  messagingSenderId: "499713407615",
  appId: "1:499713407615:web:a868d8ea043ba7d6ac1d4a"
};

window.TELEGRAM = {
  proxyUrl: "https://liza-tg.lisadiva.workers.dev",
  botToken: "",
  chatId: ""
};

window.HAS_FIREBASE = !!(window.firebaseConfig && window.firebaseConfig.databaseURL);
window.HAS_TELEGRAM = !!(window.TELEGRAM && (window.TELEGRAM.proxyUrl || (window.TELEGRAM.botToken && window.TELEGRAM.chatId)));
