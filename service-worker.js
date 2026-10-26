const CACHE_NAME = 'popdev-quiz-studio-v5-nfot-priority-1301';
const FILES = ['./','./index.html','./styles.css','./extras.css','./app.js','./data.js','./jszip.min.js','./manifest.webmanifest'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));}
    return response;
  })));
});
