// ===== 0) Инициализация и тема (вне Telegram тоже работает) =====
const tg = window.Telegram?.WebApp;
try { tg?.ready?.(); } catch(e) {}
const tp = tg?.themeParams || {};
const setCss = (k,v)=>document.documentElement.style.setProperty(k,v);
if(tp.bg_color) setCss('--bg', tp.bg_color);
if(tp.text_color) setCss('--text', tp.text_color);
if(tp.hint_color) setCss('--muted', tp.hint_color);
if(tp.secondary_bg_color) setCss('--card', tp.secondary_bg_color);
if(tp.link_color) setCss('--accent', tp.link_color);

// ===== 1) Service Worker: network-first + автообновление =====
if ('serviceWorker' in navigator) {
  const swCode = `
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

async function networkFirst(req) {
  try {
    const res = await fetch(req, { cache: 'no-store' });
    const cache = await caches.open('miniapp-cache-v1');
    cache.put(req, res.clone());
    return res;
  } catch (err) {
    const cache = await caches.open('miniapp-cache-v1');
    const cached = await cache.match(req);
    return cached || Response.error();
  }
}

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  e.respondWith(networkFirst(r));
});
  `;
  const blob = new Blob([swCode], { type: 'text/javascript' });
  const swUrl = URL.createObjectURL(blob);
  let reloaded = false;

  navigator.serviceWorker.register(swUrl).then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw && nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller && !reloaded) {
          reloaded = true;
          location.reload();
        }
      });
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloaded) { reloaded = true; location.reload(); }
  });
}

// ===== 2) DOM =====
const $ = id => document.getElementById(id);
const cats = $('cats'), grid=$('grid'), empty=$('empty'), search=$('search');

// ===== 3) Утилиты =====
const cap  = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
const norm = s => (s||'').toString().toLowerCase().replace(/ё/g,'е');
function getStartParam(){
  const fromTg = tg?.initDataUnsafe?.start_param; if (fromTg) return fromTg;
  const q = new URLSearchParams(location.search);
  return q.get('startapp') || q.get('tgWebAppStartParam') || null;
}

// ===== 4) Данные (локальный JSON) =====
let ALL = [];
let currentCat = null;

fetch('./products.json', { cache:'no-store' })
  .then(r => r.json())
  .then(items => {
    ALL = Array.isArray(items) ? items : [];
    const start = (getStartParam()||'').toLowerCase();
    const catsSet = new Set(ALL.map(x=>x.category));
    currentCat = catsSet.has(start) ? start : [...catsSet][0] || null;
    renderTabs(); applyFilter();
  })
  .catch(() => { ALL = []; renderTabs(); applyFilter(); });

// ===== 5) Рендер =====
function renderTabs(){
  const uniq = [...new Set(ALL.map(x=>x.category))];
  cats.innerHTML = uniq.map(cat =>
    `<button class="tab${cat===currentCat?' active':''}" data-cat="${cat}">${cap(cat)}</button>`
  ).join('');
  cats.querySelectorAll('.tab').forEach(btn=>{
    btn.onclick = () => { currentCat = btn.dataset.cat; applyFilter(); renderTabs(); };
  });
}

function toCardHTML(p){
  const badges=[];
  if(p.strength_mg) badges.push(`${p.strength_mg} мг`);
  if(p.puffs)       badges.push(`${p.puffs} зат.`);
  if(p.capacity_ml) badges.push(`${p.capacity_ml} мл`);
  if(p.tags?.length) p.tags.slice(0,2).forEach(t=>badges.push(t));
  const emoji = p.emoji || '🛍️';
  return `
  <article class="card">
    <div class="pic"><div class="emoji" aria-hidden="true">${emoji}</div></div>
    <div class="body">
      <div class="name">${p.title}</div>
      ${p.specs ? `<div class="specs">${p.specs}</div>` : ''}
      <div class="badges">
        ${badges.map(b=>`<span class="badge">${b}</span>`).join('')}
      </div>
    </div>
  </article>`;
}

function applyFilter(){
  const q = norm(search.value);
  const items = ALL.filter(p=>{
    const catOK = currentCat ? p.category === currentCat : true;
    const hay = norm([p.title,p.brand,p.flavor,(p.tags||[]).join(' '),p.specs].join(' '));
    const qOK = q ? hay.includes(q) : true;
    return catOK && qOK;
  });
  if(!items.length){ grid.innerHTML=''; empty.hidden=false; return; }
  empty.hidden=true;
  grid.innerHTML = items.map(toCardHTML).join('');
}
search?.addEventListener('input', applyFilter);
