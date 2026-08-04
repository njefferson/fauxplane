/**
 * sw.js — the offline shell.
 *
 * TWO STRATEGIES, AND THE SPLIT IS THE WHOLE DESIGN:
 *
 *   The SHELL is cache-first. The sensor-driven instruments — attitude,
 *   heading, G, slip, turn — need no network at all, so the panel must come up
 *   and work with the radio off. That is acceptance criterion 5.
 *
 *   The FEEDS are network-only. A cached METAR served silently as though it
 *   were current is precisely the lie this app exists not to tell. When the
 *   network is gone the fetch fails, the fields age into STALE and then FAIL on
 *   their own, and the age is on screen the whole time.
 *
 * IT NEVER SERVES AN ERROR PAGE OVER THE CACHED APP. A sibling app shipped a
 * service worker that answered a failed navigation with a 503 error document,
 * replacing a perfectly good offline shell with a message saying it was
 * offline. A navigation that cannot be satisfied falls back to the cached
 * index, and if there is no cached index it fails honestly rather than
 * inventing a page.
 */

/**
 * THE VERSION ARRIVES IN THE REGISTRATION URL, and that is deliberate.
 *
 * A service worker cannot `import` from the app unless it is registered as a
 * module worker, which older iOS does not support — and losing the offline
 * shell on the platform this app is built for would be a bad trade for a tidy
 * import. Hardcoding the version here instead would be the thing Doctrine §7b
 * forbids: a second place to type it, which eventually reports a version the
 * code is not. So app.js registers `/sw.js?v=<VERSION>` from the one constant,
 * and this reads it back.
 */
const SW_VERSION = new URL(self.location.href).searchParams.get('v');
const CACHE_NAME = `fauxplane-${SW_VERSION}`;

/**
 * The shell. Every module is listed because there is no build step: the browser
 * fetches each one, so each one has to be in the cache for the panel to boot
 * offline. A missing entry here is a panel that works until the first flight
 * without signal.
 */
const SHELL = [
  '/',
  '/index.html',
  // The stale-worker escape hatch. Cached like everything else so the panel
  // still boots with the radio off; its job only begins when there IS network.
  '/boot.js',
  '/styles.css',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/src/app.js',
  '/src/core/version.js',
  '/src/core/region.js',
  '/src/core/state.js',
  '/src/core/provenance.js',
  '/src/core/units.js',
  '/src/core/capability.js',
  '/src/core/fusion.js',
  '/src/core/derive.js',
  '/src/sensors/orientation.js',
  '/src/sensors/motion.js',
  '/src/sensors/geo.js',
  '/src/sensors/ambient.js',
  '/src/sensors/battery.js',
  '/src/sensors/network.js',
  '/src/sensors/magnetometer.js',
  '/src/data/metar.js',
  '/src/data/windsaloft.js',
  '/src/data/traffic.js',
  '/src/data/navdata.js',
  '/src/data/route.js',
  '/src/data/geoid.js',
  '/src/data/manifest.js',
  '/src/data/releases.js',
  '/data/manifest.json',
  '/src/data/wmm.js',
  '/src/render/canvas.js',
  '/src/render/dom.js',
  '/src/render/gauges/adi.js',
  '/src/render/gauges/tape.js',
  '/src/render/gauges/vsi.js',
  '/src/render/gauges/plan.js',
  '/src/panels/pfd.js',
  '/src/panels/atis.js',
  '/src/panels/bite.js',
  '/src/panels/radar.js',
  '/src/panels/diagnostics.js',
  '/src/panels/setup.js',
  '/src/panels/whatsnew.js',
  '/src/panels/info.js',
];

/**
 * Precached if present. A missing optional file must not fail the whole
 * install, or one blocked download takes the offline shell with it.
 *
 * `navdata.json` is IN THIS BUILD now (702 airports, ~317 KB) and it is here
 * rather than in SHELL for exactly that reason: it is the largest thing the app
 * ships, and the panel's instruments do not need it. If it fails to download,
 * the centre picker says so and everything else still works offline.
 */
const OPTIONAL = ['/data/navdata.json', '/data/geoid-norcal.json', '/data/wmm-cof.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // A worker with no version in its URL would mint a cache named
      // "fauxplane-null" that the next activate would never clean up. Fail the
      // install loudly instead.
      if (!SW_VERSION) throw new Error('sw.js was registered without ?v=<version>');
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(SHELL);
      await Promise.all(
        OPTIONAL.map((url) =>
          cache.add(url).catch(() => {
            /* absent by design in this build; BITE reports it */
          }),
        ),
      );
      // NO skipWaiting() HERE, and that is Doctrine §7h.1.
      //
      // It used to be the last line of this block, which is the default advice
      // everywhere and is wrong. A worker that takes over on install claims the
      // OPEN page — a page already built from the PREVIOUS release's HTML and
      // modules. `activate` then deletes that release's cache, so every module
      // that page asks for afterwards is served from the NEW one. Old markup,
      // new code, no reload, nothing said. On a panel that means an instrument
      // drawn by 1.16.0's renderer into 1.15.0's canvas element.
      //
      // Waiting instead gives the reader a CONSISTENT OLD APP until they say
      // otherwise, which is a smaller problem than an inconsistent new one.
    })(),
  );
});

/**
 * The reader's decision, and the ONLY thing that promotes a waiting worker.
 *
 * Nothing else may call skipWaiting — not a timer, not the install, not a
 * heuristic about how long the page has been open. The page posts this after
 * the reader presses the control in the update strip, and the reload follows
 * from `controllerchange` on the page side.
 */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop every cache but this version's, so a stale shell cannot outlive a
      // release and make the on-screen build stamp disagree with the code.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Feeds: network only. Never a cached weather observation dressed as current.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match('/index.html');
          // No invented error document. Either the real shell, or the failure
          // the browser would have shown anyway.
          if (cached) return cached;
          throw new Error('offline and no cached shell');
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      // THIS VERSION'S CACHE ONLY.
      //
      // `caches.match(request)` searches EVERY cache in the origin, oldest
      // first — including the previous release's. So after a deploy the old
      // modules kept being served: the page got the new index.html and the old
      // JavaScript, ran old code, and displayed the old version stamp. Noah
      // reloaded, saw the previous build, and reasonably concluded nothing had
      // shipped.
      //
      // Opening the named cache scopes the lookup to the release the running
      // worker belongs to, so a new worker cannot serve an old module.
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
