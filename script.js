'use strict';
/* BIUST Innovation Club gallery.
   Images are stored as Blobs in IndexedDB, so everything persists locally and works offline. */

/* ---------- Config & state ---------- */
const DB_NAME = 'biust-innovation-gallery', STORE = 'photos';
const MAX_BYTES = 8 * 1024 * 1024;                       // 8 MB upload limit
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const CATEGORIES = ['Workshops', 'Hackathons', 'Events', 'Projects', 'Competitions'];

let db, photos = [], visible = [];                       // visible = photos after filter + search
let filter = 'All', query = '', editingId = null, lbIndex = 0;
const urls = new Map();                                  // photo id -> object URL for its Blob
const $ = (id) => document.getElementById(id);

/* ---------- IndexedDB helpers ---------- */
function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('This browser does not support IndexedDB.'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
// Runs one transaction and resolves when it has fully committed (rejects on quota or other errors).
const run = (mode, fn) => new Promise((resolve, reject) => {
  const tx = db.transaction(STORE, mode), r = fn(tx.objectStore(STORE));
  tx.oncomplete = () => resolve(r.result);
  tx.onerror = tx.onabort = () => reject(tx.error);
});
const dbAll = () => run('readonly', (s) => s.getAll());
const dbPut = (p) => run('readwrite', (s) => s.put(p));
const dbDelete = (id) => run('readwrite', (s) => s.delete(id));

/* ---------- Sample data (generated SVGs, so no external files are needed) ---------- */
function sampleImage(label, a, b, shapes) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect width="800" height="600" fill="url(#g)"/>
    <g stroke="#fff" stroke-opacity=".3" stroke-width="3" fill="none">${shapes}</g>
    <text x="40" y="548" font-family="sans-serif" font-size="42" font-weight="700" fill="#fff">${label}</text></svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}
const circles = '<circle cx="560" cy="200" r="120"/><circle cx="560" cy="200" r="70"/><circle cx="560" cy="200" r="20"/>';
const grid = '<path d="M80 80h640M80 160h640M80 240h640M200 60v260M360 60v260M520 60v260"/>';
const chip = '<rect x="400" y="100" width="260" height="200" rx="14"/><path d="M450 70v30M520 70v30M590 70v30M450 300v30M520 300v30M590 300v30"/>';
const SAMPLES = [
  ['Intro to Arduino Workshop', '2025-02-12', 'Workshops', 'Members wired their first sensors and LEDs in a hands-on session.', '#2457e6', '#0d1f4d', chip],
  ['Campus Hackathon 24h', '2025-04-05', 'Hackathons', 'Teams built prototypes overnight to solve local community problems.', '#0f766e', '#13202e', grid],
  ['Innovation Showcase Day', '2025-05-20', 'Events', 'Open day where students presented ideas to staff and visitors.', '#b45309', '#3b1d0a', circles],
  ['Smart Irrigation Prototype', '2025-06-18', 'Projects', 'A low-cost soil moisture system built for small-scale farmers.', '#4338ca', '#13202e', chip],
  ['National Pitch Competition', '2025-08-09', 'Competitions', 'Our finalists pitched their startup concepts to a panel of judges.', '#be123c', '#2b0a16', circles],
  ['Web Development Bootcamp', '2025-09-14', 'Workshops', 'A weekend of HTML, CSS and JavaScript for first-time coders.', '#1d4ed8', '#0b1220', grid],
];
async function seedIfFirstRun() {
  let seeded = false;
  try { seeded = localStorage.getItem('biust-gallery-seeded') === '1'; } catch (e) { /* storage blocked */ }
  if (seeded || photos.length) return;
  for (const [name, date, category, description, a, b, shapes] of SAMPLES) {
    const p = { id: crypto.randomUUID(), name, date, category, description, blob: sampleImage(name, a, b, shapes), sample: true };
    await dbPut(p); photos.push(p);
  }
  try { localStorage.setItem('biust-gallery-seeded', '1'); } catch (e) { /* ignore */ }
}

/* ---------- Rendering ---------- */
const urlFor = (p) => { if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(p.blob)); return urls.get(p.id); };
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

// Filter chips are built once; counts and the pressed state are updated on every render
// (so keyboard focus is not lost when a chip is clicked).
const pad = (n) => String(n).padStart(2, '0');
function buildFilters() {
  $('filters').replaceChildren(...['All', ...CATEGORIES].map((c) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button'; b.dataset.cat = c;
    b.innerHTML = '<span class="label"></span><span class="n"></span>';
    b.querySelector('.label').textContent = c === 'All' ? 'All photos' : c;
    b.onclick = () => { filter = c; render(); };
    return b;
  }));
}
function updateFilters() {
  for (const b of $('filters').children) {
    const c = b.dataset.cat;
    b.setAttribute('aria-pressed', String(c === filter));
    b.querySelector('.n').textContent = pad(c === 'All' ? photos.length : photos.filter((p) => p.category === c).length);
  }
}
// Applies category filter + name search, newest first, then rebuilds the grid.
function render() {
  const q = query.trim().toLowerCase();
  visible = photos.filter((p) => (filter === 'All' || p.category === filter) && p.name.toLowerCase().includes(q))
                  .sort((a, b) => b.date.localeCompare(a.date));
  $('grid').replaceChildren(...visible.map((p, i) => {
    const card = document.createElement('button');   // button = keyboard accessible
    card.className = 'card'; card.type = 'button';
    card.innerHTML = '<img loading="lazy"><span class="badge"></span><div class="info"><div class="title"><h3></h3><span class="arrow" aria-hidden="true">&#8599;</span></div><p></p><span class="when"></span></div>';
    const img = card.querySelector('img'); img.src = urlFor(p); img.alt = p.name;
    card.querySelector('h3').textContent = p.name;   // textContent prevents HTML injection
    card.querySelector('.badge').textContent = p.category;
    card.querySelector('p').textContent = p.description || 'No description yet.';
    card.querySelector('.when').textContent = fmtDate(p.date);
    card.onclick = () => openLightbox(i);
    return card;
  }));
  updateFilters();
  $('empty').hidden = visible.length > 0;
  $('stats').textContent = `Showing ${visible.length} photo${visible.length === 1 ? '' : 's'}`;
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', (a.id === 'navEvents') === (filter === 'Events')));
}

/* ---------- Toasts ---------- */
let toastTimer;
function toast(msg, bad) {
  const t = $('toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 4000);
}

/* ---------- Add / edit form ---------- */
function openForm(photo) {
  editingId = photo ? photo.id : null;
  $('photoForm').reset(); $('formError').hidden = true;
  $('formTitle').textContent = photo ? 'Edit photo details' : 'Add photo';
  $('fileField').hidden = !!photo;                    // the image itself can't be changed when editing
  $('saveBtn').textContent = photo ? 'Save changes' : 'Save photo';
  $('preview').hidden = !photo; if (photo) $('preview').src = urlFor(photo);
  if (photo) { $('name').value = photo.name; $('date').value = photo.date; $('category').value = photo.category; $('desc').value = photo.description; }
  else $('date').value = new Date().toISOString().slice(0, 10);
  $('formDialog').showModal();
}
function formError(msg) { const e = $('formError'); e.textContent = msg; e.hidden = false; }

// Checks that the browser can actually decode the file as an image.
const canDecode = (blob) => new Promise((ok) => {
  const u = URL.createObjectURL(blob), im = new Image();
  im.onload = () => { URL.revokeObjectURL(u); ok(true); };
  im.onerror = () => { URL.revokeObjectURL(u); ok(false); };
  im.src = u;
});

// Validates the chosen file; returns an error message or '' if fine.
async function validateFile(file) {
  if (!file) return 'Choose an image to upload.';
  if (!TYPES.includes(file.type)) return 'Unsupported file type. Use a JPG, PNG, WebP or GIF image.';
  if (file.size > MAX_BYTES) return `This image is ${(file.size / 1048576).toFixed(1)} MB. The limit is 8 MB, so please choose a smaller file.`;
  if (!(await canDecode(file))) return 'This file could not be read as an image. It may be corrupted.';
  return '';
}

$('file').onchange = async (e) => {
  const f = e.target.files[0], err = f ? await validateFile(f) : '';
  if (err) { formError(err); e.target.value = ''; $('preview').hidden = true; return; }
  $('formError').hidden = true;
  if (f) { $('preview').src = URL.createObjectURL(f); $('preview').hidden = false; if (!$('name').value) $('name').value = f.name.replace(/\.[^.]+$/, ''); }
};

$('photoForm').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('name').value.trim(), date = $('date').value, category = $('category').value;
  if (!name || !date) return formError('Enter an event name and a date.');
  $('saveBtn').disabled = true;
  try {
    let p;
    if (editingId) {
      p = photos.find((x) => x.id === editingId);
    } else {
      const file = $('file').files[0], err = await validateFile(file);
      if (err) return formError(err);
      p = { id: crypto.randomUUID(), blob: file };
    }
    const updated = { ...p, name, date, category, description: $('desc').value.trim() };
    await dbPut(updated);                              // persist first, then update the in-memory list
    photos = editingId ? photos.map((x) => (x.id === editingId ? updated : x)) : [...photos, updated];
    $('formDialog').close(); render();
    toast(editingId ? 'Changes saved.' : 'Photo added.');
  } catch (err) {
    const quota = err && err.name === 'QuotaExceededError';
    formError(quota ? 'Browser storage is full. Delete some photos and try again.' : 'Upload failed. The photo was not saved, please try again.');
  } finally { $('saveBtn').disabled = false; }
};

/* ---------- Lightbox ---------- */
function openLightbox(i) {
  if (!visible.length) return;
  lbIndex = (i + visible.length) % visible.length;     // wraps around at both ends
  const p = visible[lbIndex];
  $('lbImg').src = urlFor(p); $('lbImg').alt = p.name;
  $('lbTitle').textContent = p.name;
  $('lbMeta').textContent = `${p.category} · ${fmtDate(p.date)} · ${lbIndex + 1} of ${visible.length}`;
  $('lbDesc').textContent = p.description || '';
  const multi = visible.length > 1; $('lbPrev').hidden = $('lbNext').hidden = !multi;
  if (!$('lightbox').open) $('lightbox').showModal();
}
$('lbPrev').onclick = () => openLightbox(lbIndex - 1);
$('lbNext').onclick = () => openLightbox(lbIndex + 1);
$('lbClose').onclick = () => $('lightbox').close();
$('lbEdit').onclick = () => { const p = visible[lbIndex]; $('lightbox').close(); openForm(p); };
$('lbDelete').onclick = async () => {
  const p = visible[lbIndex];
  if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
  try {
    await dbDelete(p.id);
    photos = photos.filter((x) => x.id !== p.id);
    URL.revokeObjectURL(urls.get(p.id)); urls.delete(p.id);
    render(); toast('Photo deleted.');
    visible.length ? openLightbox(Math.min(lbIndex, visible.length - 1)) : $('lightbox').close();
  } catch (err) { toast('Could not delete the photo. Please try again.', true); }
};
// Keyboard arrows while the lightbox is open (Escape is handled natively by <dialog>)
document.addEventListener('keydown', (e) => {
  if (!$('lightbox').open) return;
  if (e.key === 'ArrowRight') openLightbox(lbIndex + 1);
  if (e.key === 'ArrowLeft') openLightbox(lbIndex - 1);
});
// Clicking the dark backdrop closes a dialog
for (const id of ['lightbox', 'formDialog']) $(id).addEventListener('click', (e) => { if (e.target === $(id)) $(id).close(); });

/* ---------- Backup: export / import ---------- */
// Blob -> data URL text, so images can live inside a single .json file
const toDataUrl = (blob) => new Promise((ok, bad) => {
  const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => bad(r.error); r.readAsDataURL(blob);
});
$('exportBtn').onclick = async () => {
  if (!photos.length) return toast('Nothing to export yet.', true);
  try {
    const out = [];
    for (const p of photos) out.push({ id: p.id, name: p.name, date: p.date, category: p.category, description: p.description, data: await toDataUrl(p.blob) });
    const file = new Blob([JSON.stringify({ app: 'biust-gallery', version: 1, photos: out })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = `biust-gallery-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`Exported ${out.length} photos.`);
  } catch (err) { toast('Export failed. Please try again.', true); }
};
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== 'biust-gallery' || !Array.isArray(data.photos)) throw new Error('bad format');
    let added = 0;
    for (const x of data.photos) {
      // Skip invalid entries and photos already in the gallery (matched by id)
      if (!x.id || !x.name || !x.data || !String(x.data).startsWith('data:image/') || photos.some((p) => p.id === x.id)) continue;
      const blob = await (await fetch(x.data)).blob();
      const p = { id: x.id, name: String(x.name), date: x.date || '', category: CATEGORIES.includes(x.category) ? x.category : 'Events', description: x.description || '', blob };
      await dbPut(p); photos.push(p); added++;
    }
    render(); toast(added ? `Imported ${added} photo${added === 1 ? '' : 's'}.` : 'No new photos found in that file.');
  } catch (err) { toast('Import failed. Choose a backup file made by this gallery.', true); }
};

/* ---------- Start-up ---------- */
// Ask the browser not to clear our storage automatically (it may ignore the request)
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
$('addBtn').onclick = () => openForm(null);
// Nav: "Gallery" resets the filter, "Events" shows only the Events category
$('navGallery').onclick = () => { filter = 'All'; render(); };
$('navEvents').onclick = () => { filter = 'Events'; render(); };
$('cancelBtn').onclick = () => $('formDialog').close();
$('search').oninput = (e) => { query = e.target.value; render(); };
$('category').replaceChildren(...CATEGORIES.map((c) => new Option(c, c)));

(async function init() {
  buildFilters(); $('year').textContent = new Date().getFullYear();
  try {
    db = await openDB();
    photos = await dbAll();
    await seedIfFirstRun();
    render();
  } catch (err) {
    $('empty').hidden = false;
    $('empty').textContent = 'Storage is unavailable (' + err.message + ') Private browsing can cause this. Try a normal window.';
    $('addBtn').disabled = true;
  }
})();
