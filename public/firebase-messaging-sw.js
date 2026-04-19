// public/firebase-messaging-sw.js
// This file MUST be in the /public folder so it's served at the root

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCk2NYOIRHutr_nYaDx61TytSQ7VQbsGgc",
  authDomain: "safe360-968fe.firebaseapp.com",
  databaseURL: "https://safe360-968fe-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "safe360-968fe",
  storageBucket: "safe360-968fe.firebasestorage.app",
  messagingSenderId: "1045081557036",
  appId: "1:1045081557036:web:04f4b748e32d99b295e989"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification;

  const notificationOptions = {
    body: body || 'Motion detected!',
    icon: icon || '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'safe360-alert',
    renotify: true,
    data: payload.data
  };

  self.registration.showNotification(title || 'Safe360 Alert', notificationOptions);
});

// Click on notification opens the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
