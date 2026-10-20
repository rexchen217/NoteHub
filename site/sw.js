/* =====================================================================
   NoteHub PWA Service Worker
   只缓存应用外壳（HTML/CSS/JS/图标），让主屏幕图标离线可打开；
   /api/ 请求一律走网络，不做缓存，避免同步数据被缓存污染。
   ===================================================================== */
'use strict';

var CACHE = 'notehub-shell-v1';

var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/highlight.js',
  './js/markdown.js',
  './js/math.js',
  './js/seeds.js',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);

  /* API 与跨域请求直接放行 */
  if (e.request.method !== 'GET' || url.origin !== self.location.origin ||
      url.pathname.indexOf('/api/') === 0) {
    return;
  }

  /* 应用外壳：缓存优先，回源后顺手更新缓存 */
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      var fetched = fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || fetched;
    })
  );
});
