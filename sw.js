// Service worker for B7oothKw.
// Its main job is the Web Share Target: when a user shares audio from WhatsApp
// (Android) into the installed app, the OS POSTs the files here. We stash them
// in the Cache, then redirect to the app, which reads and adds them.
const SHARE_CACHE = 'b7-shared';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isShare = event.request.method === 'POST' && url.pathname.endsWith('/share-target');
  if (!isShare) return; // let everything else hit the network normally

  event.respondWith((async () => {
    try {
      const form = await event.request.formData();
      const files = form.getAll('files').filter((f) => f && typeof f.name === 'string');
      const cache = await caches.open(SHARE_CACHE);
      const ids = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const id = 's' + Date.now() + '_' + i;
        await cache.put(
          'shared/' + id,
          new Response(f, {
            headers: {
              'content-type': f.type || 'application/octet-stream',
              'x-name': encodeURIComponent(f.name || ('clip' + i)),
            },
          })
        );
        ids.push(id);
      }
      await cache.put('shared/index', new Response(JSON.stringify(ids), {
        headers: { 'content-type': 'application/json' },
      }));
    } catch (e) {
      // ignore — fall through to redirect so the app still opens
    }
    return Response.redirect('./?shared=1', 303);
  })());
});
