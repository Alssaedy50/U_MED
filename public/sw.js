/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * UMED PWA Service Worker - Network-First with Offline Fallback
 */

const CACHE_NAME = 'umed-v2.4.0';
const FONT_CACHE_NAME = 'umed-fonts-v1';
const STATIC_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_SHELL).catch(() => {});
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME && cache !== FONT_CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

function isStaticAssetPathname(pathname) {
  return (
    pathname.startsWith('/assets/') ||
    /\.(?:js|mjs|css|svg|png|jpg|jpeg|webp|gif|ico|woff2?|ttf|otf|json)$/i.test(pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Cache Google Fonts & CDN PDF.js (Cache-First) so fonts & PDF viewer work 100% offline
  if (
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com' ||
    url.origin === 'https://cdnjs.cloudflare.com'
  ) {
    event.respondWith(
      caches.open(FONT_CACHE_NAME).then((cache) => {
        return cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req)
            .then((res) => {
              if (res && (res.status === 200 || res.type === 'opaque')) {
                cache.put(req, res.clone()).catch(() => {});
              }
              return res;
            })
            .catch(() => cached || new Response('', { status: 504 }));
        });
      })
    );
    return;
  }

  // Skip external APIs, Firebase/Firestore streams, and API endpoints
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // 2. Navigation requests (HTML shell): Stale-While-Revalidate for instant 0ms boot
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match('/index.html').then((cachedIndex) => {
          const networkFetch = fetch(req)
            .then((networkRes) => {
              if (networkRes && networkRes.status === 200) {
                cache.put('/index.html', networkRes.clone()).catch(() => {});
                cache.put(req, networkRes.clone()).catch(() => {});
              }
              return networkRes;
            })
            .catch(() => cachedIndex || cache.match('/'));

          return cachedIndex || networkFetch;
        });
      })
    );
    return;
  }

  // 3. Static Assets (JS, CSS, Icons, Images, Manifest): Cache-First with background update
  if (isStaticAssetPathname(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(req).then((cachedAsset) => {
          const fetchPromise = fetch(req)
            .then((networkRes) => {
              if (
                networkRes &&
                networkRes.status === 200 &&
                (networkRes.type === 'basic' || networkRes.type === 'cors')
              ) {
                cache.put(req, networkRes.clone()).catch(() => {});
              }
              return networkRes;
            })
            .catch(() => cachedAsset || new Response('', { status: 504 }));

          return cachedAsset || fetchPromise;
        });
      })
    );
    return;
  }

  // 4. Default fallback: Network-First with cache fallback
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (networkResponse.type === 'basic' || networkResponse.type === 'cors')
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseClone).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(req).then((cachedResponse) => {
          return cachedResponse || new Response('', { status: 504, statusText: 'Offline' });
        });
      })
  );
});

// ---------------------------------------------------------------------------
// System Web Notifications & Push Integration
// ---------------------------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          if ('navigate' in client && targetUrl !== '/') {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'منصة UMED الطبية',
    body: 'إشعار أكاديمي جديد متاح',
    url: '/'
  };

  try {
    if (event.data) {
      data = Object.assign(data, event.data.json());
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    dir: 'rtl',
    lang: 'ar',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    tag: data.tag || 'umed-general-notification',
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});
