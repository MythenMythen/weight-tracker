'use strict';

const CACHE_APP    = 'weight-app-v2';
const CACHE_STATIC = 'weight-static-v1';
const BASE = self.registration.scope;

// Truly static assets — cache-first (never change)
const STATIC = [
  BASE + 'chart.min.js',
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png',
];

// App assets — network-first (always check for updates)
const APP = [
  BASE,
  BASE + 'index.html',
  BASE + 'app.js',
  BASE + 'styles.css',
  BASE + 'manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE_STATIC).then(c => c.addAll(STATIC)),
      caches.open(CACHE_APP).then(c => c.addAll(APP)),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  const keep = [CACHE_APP, CACHE_STATIC];
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Cache-first für unveränderliche Assets
  if (STATIC.some(a => url.href.endsWith(a.replace(BASE, '')))) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }

  // Network-first für App-Dateien — Cache nur als Offline-Fallback
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_APP).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
