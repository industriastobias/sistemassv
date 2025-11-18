// ============================================
// SERVICE WORKER - PRODUCCIÓN READY
// ============================================

// Nombres de cache con versión para control de actualizaciones
const CACHE_NAME = 'mi-app-v1.0.0';
const DYNAMIC_CACHE = 'mi-app-dynamic-v1';

// ARCHIVOS CRÍTICOS (App Shell) - ACTUALIZA CON TUS ARCHIVOS REALES
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  // Añade aquí cualquier otro archivo esencial
];

// PÁGINA OFFLINE (opcional pero recomendado)
const OFFLINE_PAGE = '/offline.html';

// Rutas que NUNCA deben cachear (APIs, auth, etc.)
const NEVER_CACHE_PATTERNS = [
  /\/api\//,
  /\/auth\//,
  /\/admin\//,
  /\/socket\//,
  /\/online\//  // Rutas que solo funcionan online
];

// Archivos para cache dinámico (imágenes, videos, etc.)
const DYNAMIC_PATTERNS = [
  /\/images\//,
  /\/uploads\//,
  /\.(png|jpg|jpeg|gif|svg|webp|mp4|webm|woff2?)$/
];

// ====================================================
// FUNCIONES AUXILIARES
// ====================================================

// Verificar si una URL debe ser excluida del cache
function shouldNeverCache(request) {
  return NEVER_CACHE_PATTERNS.some(pattern => 
    pattern.test(request.url) || pattern.test(request.referrer)
  );
}

// Verificar si es contenido dinámico
function isDynamicContent(request) {
  return DYNAMIC_PATTERNS.some(pattern => pattern.test(request.url));
}

// Verificar si la respuesta es válida para cachear
function isValidResponse(response) {
  return response && 
         response.status === 200 && 
         response.type === 'basic' &&
         !response.headers.get('content-type')?.includes('text/html')?.includes('nosniff');
}

// ====================================================
// EVENTO: INSTALL (Instalación)
// ====================================================
self.addEventListener('install', event => {
  console.log('[SW] 🔄 Instalando versión:', CACHE_NAME);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] 📦 Cacheando App Shell...');
        // Cachear archivos críticos
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        console.log('[SW] ✅ App Shell cacheado correctamente');
        // Activar inmediatamente este SW
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] ❌ Error en instalación:', error);
        // Continuar aunque falle algún archivo
        return self.skipWaiting();
      })
  );
});

// ====================================================
// EVENTO: ACTIVATE (Activación)
// ====================================================
self.addEventListener('activate', event => {
  console.log('[SW] 🚀 Activando nuevo Service Worker...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Borrar caches antiguos que no sean los actuales
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE) {
            console.log('[SW] 🗑️ Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] ✅ Service Worker activado');
      // Tomar control inmediato de las páginas
      return self.clients.claim();
    })
  );
});

// ====================================================
// EVENTO: FETCH (Manejo de peticiones)
// ====================================================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. IGNORAR peticiones de otros orígenes (CDN, APIs externas)
  if (url.origin !== location.origin) {
    // Excepto si es contenido que queremos cachear (imágenes de CDN)
    if (isDynamicContent(request) && !shouldNeverCache(request)) {
      event.respondWith(cacheFirstDynamic(request));
    }
    return;
  }

  // 2. IGNORAR rutas que no deben cachear (APIs internas)
  if (shouldNeverCache(request)) {
    return; // Dejar pasar directo a la red
  }

  // 3. ESTRATEGIA según tipo de contenido
  if (request.destination === 'document') {
    // HTML: Network First (siempre fresco, con fallback offline)
    event.respondWith(networkFirstWithOffline(request));
  } else if (request.destination === 'image' || isDynamicContent(request)) {
    // IMÁGENES/ASSETS: Cache First con fallback
    event.respondWith(cacheFirstDynamic(request));
  } else if (['script', 'style', 'font'].includes(request.destination)) {
    // JS/CSS/FONTS: Cache First (estables)
    event.respondWith(cacheFirstStatic(request));
  } else {
    // DEFAULT: Cache First
    event.respondWith(cacheFirstStatic(request));
  }
});

// ====================================================
// ESTRATEGIA 1: Network First con Offline Fallback
// Para: HTML, APIs críticas
// ====================================================
async function networkFirstWithOffline(request) {
  try {
    // 1. Intentar red primero
    const networkResponse = await fetch(request);
    
    // 2. Si es válido, actualizar cache
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // 3. Si falla, buscar en cache
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      console.log('[SW] 📄 HTML desde cache (offline):', request.url);
      return cachedResponse;
    }
    
    // 4. Si no hay cache, mostrar página offline
    if (request.destination === 'document') {
      console.log('[SW] 🚫 Sin conexión, mostrando offline.html');
      return caches.match(OFFLINE_PAGE) || 
             new Response('<h1>Offline</h1><p>No hay conexión</p>', {
               headers: { 'Content-Type': 'text/html' }
             });
    }
    
    // 5. Si no hay fallback, error
    return new Response('Sin conexión', { status: 503 });
  }
}

// ====================================================
// ESTRATEGIA 2: Cache First para Estáticos
// Para: JS, CSS, Fonts, App Shell
// ====================================================
async function cacheFirstStatic(request) {
  // 1. Buscar en cache primero
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    console.log('[SW] 📦 Estático desde cache:', request.url);
    return cachedResponse;
  }
  
  // 2. Si no está, ir a la red
  try {
    const networkResponse = await fetch(request);
    
    // 3. Cachear si es válido
    if (isValidResponse(networkResponse)) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] ❌ Falló cache y network:', error);
    throw error;
  }
}

// ====================================================
// ESTRATEGIA 3: Cache First para Contenido Dinámico
// Para: Imágenes, videos, uploads
// ====================================================
async function cacheFirstDynamic(request) {
  // 1. Buscar en cache dinámico
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // 2. Ir a la red
  try {
    const networkResponse = await fetch(request);
    
    // 3. Cachear en cache dinámico (con límite)
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      
      // Opcional: Limitar tamaño del cache dinámico
      limitCacheSize(DYNAMIC_CACHE, 50); // 50 items máximo
      
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] 🖼️ Imagen no disponible, usando fallback');
    // 4. Fallback: imagen placeholder
    return caches.match('/images/placeholder.png') || 
           new Response('<div style="background:#ccc;width:100%;height:200px;"></div>', {
             headers: { 'Content-Type': 'text/html' }
           });
  }
}

// ====================================================
// UTILIDAD: Limitar tamaño de cache
// ====================================================
async function limitCacheSize(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxItems) {
    // Borrar los más antiguos
    await cache.delete(keys[0]);
  }
}

// ====================================================
// EVENTO: MESSAGE (Comunicación con la app)
// ====================================================
self.addEventListener('message', event => {
  // Mensaje para saltar waiting y activar nuevo SW
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] ⏭️ Saltando waiting...');
    self.skipWaiting();
  }
  
  // Mensaje para borrar cache específico
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    const cacheName = event.data.payload;
    caches.delete(cacheName).then(() => {
      console.log('[SW] 🗑️ Cache borrado:', cacheName);
    });
  }
});

// ====================================================
// EVENTOS: Errores y Rechazos
// ====================================================
self.addEventListener('error', event => {
  console.error('[SW] 💥 Error capturado:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('[SW] 💥 Promise rechazada:', event.reason);
});
