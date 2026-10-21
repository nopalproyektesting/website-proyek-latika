'use strict';
// ---------- Utilitas ----------
const $ = (s, r = document) => r.querySelector(s);
// Escape input pengguna agar tidak jadi XSS
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2800); };
const fail = m => { $('#err').textContent = m; };

// ---------- LAPISAN STORAGE ----------
// Semua akses data HARUS lewat objek ini.
// TODO-DB: ganti isi tiap fungsi dengan Firebase/Supabase (async), nama fungsi tetap.
const Storage = {
  getAll(k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } },
  _save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { toast(e.name === 'QuotaExceededError' ? 'Penyimpanan penuh, kurangi jumlah foto' : 'Gagal menyimpan data'); return false; }
  },
  getById(k, id) { return this.getAll(k).find(x => x.id === id); },
  add(k, d) { d.id = d.id || uid(); const a = this.getAll(k); a.push(d); return this._save(k, a) ? d : null; },
  update(k, id, d) { return this._save(k, this.getAll(k).map(x => x.id === id ? { ...x, ...d } : x)); },
  remove(k, id) { return this._save(k, this.getAll(k).filter(x => x.id !== id)); },
  getObj(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  setObj(k, v) { return this._save(k, v); },
  delObj(k) { localStorage.removeItem(k); }
};

// ---------- AUTH ----------
// TODO-DB: hash SHA-256 ini HANYA untuk demo. Saat pindah ke database,
// pakai autentikasi bawaan (Firebase Auth / Supabase Auth).
async function sha256(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const me = () => { const s = Storage.getObj('kk_session'); return s && Storage.getById('kk_sellers', s.sellerId); };

// ---------- VALIDASI & WA ----------
function toWA(n) { let d = String(n).replace(/\D/g, ''); if (d.startsWith('0')) d = '62' + d.slice(1); else if (d.startsWith('8')) d = '62' + d; return d; }
const validWA = n => /^628\d{8,11}$/.test(toWA(n));
function waLink(o, p, s) {
  const t = `Halo ${s.toko}, saya mau pesan:\nProduk: ${p.nama}\nJumlah: ${o.jumlah}\nTotal: ${rp(o.total)}\nTipe: ${p.status === 'ready' ? 'Ready' : 'Pre-Order'}\nNama: ${o.namaPembeli}\nKelas: ${o.kelasPembeli}\nCatatan: ${o.catatan || '-'}`;
  return `https://wa.me/${toWA(s.wa)}?text=${encodeURIComponent(t)}`;
}

// ---------- KOMPRES GAMBAR ----------
function compress(file, maxW) {
  return new Promise((ok, no) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return no('Hanya file JPG/PNG/WebP');
    if (file.size > 5 * 1024 * 1024) return no('Ukuran foto maksimal 5 MB');
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const w = Math.min(maxW, im.width), h = im.height * w / im.width;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
        ok(c.toDataURL('image/jpeg', 0.7));
      };
      im.onerror = () => no('File gambar rusak');
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

// ---------- HITUNG HARGA ----------
// margin dari HARGA JUAL: harga = modal / (1 - margin/100)
const hargaRek = (modal, m) => Math.ceil(modal / (1 - m / 100) / 500) * 500;

// ---------- DATA CONTOH ----------
async function seed() {
  if (localStorage.getItem('kk_seeded')) return;
  const h = await sha256('demo123'), now = new Date().toISOString();
  const S = [['s1','Dewi Lestari','XI TKJ 1','081234567890','Dapur Kelas XI','Kue dan minuman buatan kelas XI.'],
    ['s2','Rizky Pratama','XI RPL 2','081234567891','Warung Boga RPL','Camilan dan makanan berat hasil praktek.'],
    ['s3','Sinta Maharani','X AKL 1','081234567892','Kedai Manis TKJ','Donat dan keripik buatan sendiri.']]
    .map(([id,nama,kelas,wa,toko,deskripsi]) => ({ id, nama, kelas, wa, toko, deskripsi, foto: '', passwordHash: h, dibuat: now }));
  const P = [['p1','s1','Brownies Cokelat','Kue',12000,'ready',20,''],['p2','s1','Es Teh Lemon','Minuman',5000,'ready',30,''],
    ['p3','s2','Risol Mayo','Camilan',3000,'ready',40,''],['p4','s2','Nasi Kuning Box','Makanan',15000,'po',0,'2026-11-05'],
    ['p5','s3','Donat Mini','Kue',10000,'ready',25,''],['p6','s3','Keripik Pisang','Camilan',8000,'po',0,'2026-11-10']]
    .map(([id,sellerId,nama,kategori,harga,status,stok,estimasiPO]) => ({ id, sellerId, nama, kategori, deskripsi: 'Dibuat segar oleh siswa kelas.', fotos: [], modal: Math.round(harga * .7), margin: 30, harga, status, stok, estimasiPO }));
  const R = [['s1',5,'Andi','Enak banget!'],['s1',5,'Rina','Cepat dan ramah'],['s1',4,'Budi','Mantap'],
    ['s2',4,'Citra','Porsi pas'],['s2',3,'Dika','Lumayan'],['s2',4,'Eka','Recommended'],
    ['s3',5,'Fani','Donatnya empuk'],['s3',4,'Gilang','Enak']]
    .map(([sellerId,rating,namaPembeli,komentar],i) => ({ id: 'r' + i, sellerId, orderId: 'dummy' + i, rating, komentar, namaPembeli, tanggal: now }));
  Storage._save('kk_sellers', S); Storage._save('kk_products', P); Storage._save('kk_reviews', R);
  Storage._save('kk_orders', []); localStorage.setItem('kk_seeded', '1');
}

// ---------- HELPER RENDER ----------
const CATS = [['Makanan','utensils'],['Minuman','cup-soda'],['Camilan','cookie'],['Kue','cake-slice']];
const st = { q: '', kat: '' };
let tmp = { fotos: [] };
const sellerOf = id => Storage.getById('kk_sellers', id);
function ratingOf(sid) { const r = Storage.getAll('kk_reviews').filter(x => x.sellerId === sid); return { n: r.length, avg: r.length ? r.reduce((a, x) => a + x.rating, 0) / r.length : 0 }; }
const star = sid => { const r = ratingOf(sid); return `<span class="rate"><i data-lucide="star"></i>${r.n ? r.avg.toFixed(1) + ' (' + r.n + ')' : 'Baru'}</span>`; };
const img = (s, alt, c = '') => s ? `<img class="${c}" src="${esc(s)}" alt="${esc(alt)}" loading="lazy">` : `<div class="ph ${c}" role="img" aria-label="${esc(alt)}"><i data-lucide="image"></i></div>`;
const fld = (n, l, t, v = '', x = '') => `<label>${l}<input class="in" name="${n}" type="${t}" value="${esc(v)}" ${x}></label>`;
const back = h => `<a class="back" href="${h}" aria-label="Kembali"><i data-lucide="arrow-left"></i></a>`;
const nf = () => '<p class="empty">Halaman tidak ditemukan.</p>';

function cardP(p) {
  const s = sellerOf(p.sellerId) || {};
  return `<a class="card glass rv" href="#/produk/${p.id}">${img(p.fotos[0], p.nama, 'pimg')}<span class="badge ${p.status}">${p.status === 'ready' ? 'READY' : 'PRE-ORDER'}</span>
  <div class="pb"><h3>${esc(p.nama)}</h3><b>${rp(p.harga)}</b><small>${esc(s.toko)} · ${esc(s.kelas)}</small>${star(p.sellerId)}</div></a>`;
}
function listP() {
  const q = st.q.toLowerCase(), cnt = id => Storage.getAll('kk_orders').filter(o => o.productId === id).length;
  const a = Storage.getAll('kk_products').filter(p => { const s = sellerOf(p.sellerId) || {};
    return (!st.kat || p.kategori === st.kat) && (!q || [p.nama, s.toko, s.nama].some(x => String(x || '').toLowerCase().includes(q))); })
    .sort((x, y) => cnt(y.id) - cnt(x.id)); // terlaris = paling banyak dipesan
  if (!Storage.getAll('kk_products').length) return '<p class="empty">Belum ada produk. Jadilah penjual pertama lewat menu Jual.</p>';
  return a.length ? a.map(cardP).join('') : '<p class="empty">Produk tidak ditemukan.</p>';
}
const chips = () => [['', 'Semua'], ...CATS].map(([v, l]) => `<button class="chip ${st.kat === v ? 'on' : ''}" data-c="kat" data-v="${v}">${l}</button>`).join('');
const fbar = () => `<label class="search glass"><i data-lucide="search"></i><input id="q" type="search" placeholder="Cari produk atau penjual" aria-label="Cari produk atau penjual" value="${esc(st.q)}"></label><div class="chips" id="chips">${chips()}</div>`;
function refresh() { $('#list').innerHTML = listP(); $('#chips').innerHTML = chips(); lucide.createIcons(); reveal(); }

// ---------- HALAMAN ----------
function vHome() {
  const top = Storage.getAll('kk_sellers').map(s => ({ s, r: ratingOf(s.id) })).sort((a, b) => b.r.avg - a.r.avg);
  return `<section class="hero rv"><span class="badge ready">PROMO KELAS</span><h1>Jajanan Karya Siswa SMK</h1><p>Beli langsung dari teman sekolah, ready atau pre-order.</p><a class="btn y" href="#/produk">Belanja Sekarang</a></section>
  ${fbar()}
  <h2>Kategori</h2><div class="cats">${CATS.map(([c, i]) => `<button class="cat glass" data-c="kat" data-v="${c}"><i data-lucide="${i}"></i>${c}</button>`).join('')}</div>
  <h2>Produk Terlaris</h2><div class="grid" id="list">${listP()}</div>
  <h2>Penjual Terbaik</h2><div class="sellers">${top.map(({ s }) => `<a class="glass box seller rv" href="#/penjual/${s.id}" style="text-decoration:none">${img(s.foto, s.toko, 'av')}<div><h3>${esc(s.toko)}</h3><small>${esc(s.nama)} · ${esc(s.kelas)}</small>${star(s.id)}</div></a>`).join('') || '<p class="empty">Belum ada penjual terdaftar.</p>'}</div>
  <h2>Janji Kami</h2><div class="promise"><div class="glass rv"><i data-lucide="shield-check"></i>Dibuat siswa sendiri</div><div class="glass rv"><i data-lucide="clock"></i>Ready atau PO jelas</div><div class="glass rv"><i data-lucide="heart-handshake"></i>Rating jujur</div></div>
  <footer>Kotak Kelas - Karya siswa, untuk siswa.</footer>`;
}
const vProduk = () => `<h1>Semua Produk</h1>${fbar()}<div class="grid" id="list" style="margin-top:12px">${listP()}</div>`;

function vDetail(id) {
  const p = Storage.getById('kk_products', id); if (!p) return nf();
  const s = sellerOf(p.sellerId) || {};
  return `${back('#/produk')}<div class="dwrap"><div class="dl"><div class="gal glass">${(p.fotos.length ? p.fotos : ['']).map(f => img(f, p.nama, 'gimg')).join('')}</div></div>
  <div class="dr"><div class="glass box rv"><span class="badge ${p.status}">${p.status === 'ready' ? 'READY' : 'PRE-ORDER'}</span><h1>${esc(p.nama)}</h1><b class="price">${rp(p.harga)}</b><p>${esc(p.deskripsi)}</p>
  <p class="info"><i data-lucide="${p.status === 'ready' ? 'package' : 'clock'}"></i>${p.status === 'ready' ? 'Stok: ' + p.stok : 'Estimasi siap: ' + esc(p.estimasiPO)}</p>
  <a class="btn y" href="#/pesan/${p.id}">${p.status === 'ready' ? 'Beli Sekarang' : 'Pre-Order'}</a></div>
  <div class="glass box seller rv">${img(s.foto, s.toko, 'av')}<div><h3>${esc(s.toko)}</h3><small>${esc(s.nama)} · ${esc(s.kelas)}</small>${star(s.id)}</div></div>
  <div class="row"><a class="btn" target="_blank" rel="noopener" href="https://wa.me/${toWA(s.wa)}"><i data-lucide="message-circle"></i>WhatsApp</a><a class="btn o" href="#/penjual/${s.id}">Profil penjual</a></div></div></div>`;
}

function vSeller(id) {
  const s = sellerOf(id); if (!s) return nf();
  const rv = Storage.getAll('kk_reviews').filter(x => x.sellerId === id).reverse();
  const ps = Storage.getAll('kk_products').filter(p => p.sellerId === id);
  return `${back('#/')}<div class="glass box c">${img(s.foto, s.toko, 'av big')}<h1>${esc(s.toko)}</h1><small>${esc(s.nama)} · ${esc(s.kelas)}</small><p>${esc(s.deskripsi)}</p>${star(id)}</div>
  <h2>Ulasan (${rv.length})</h2>${rv.map(x => `<div class="glass box"><b>${esc(x.namaPembeli)}</b> <span class="rate"><i data-lucide="star"></i>${x.rating}/5</span><p>${esc(x.komentar)}</p></div>`).join('') || '<p class="empty">Belum ada ulasan.</p>'}
  <h2>Produk Aktif</h2><div class="grid">${ps.map(cardP).join('') || '<p class="empty">Belum ada produk.</p>'}</div>`;
}

function vPesan(id) {
  const p = Storage.getById('kk_products', id); if (!p) return nf();
  return `${back('#/produk/' + id)}<form class="glass box" data-f="pesan" data-id="${p.id}" novalidate><h1>${p.status === 'ready' ? 'Beli' : 'Pre-Order'}: ${esc(p.nama)}</h1>
  ${fld('nama', 'Nama pembeli', 'text')}${fld('kelas', 'Kelas pembeli', 'text')}${fld('jumlah', 'Jumlah', 'number', '1', 'min="1"')}
  <label>Catatan (opsional)<textarea class="in" name="catatan"></textarea></label><p class="err" id="err"></p><button class="btn y">Pesan via WhatsApp</button></form>`;
}

function vPesanan() {
  const ids = Storage.getObj('kk_my') || [];
  const os = Storage.getAll('kk_orders').filter(o => ids.includes(o.id)).reverse();
  return '<h1>Pesanan Saya</h1>' + (os.map(o => { const p = Storage.getById('kk_products', o.productId);
    return `<div class="glass box rv"><b>${esc(p ? p.nama : 'Produk dihapus')}</b><p>${o.jumlah} x · ${rp(o.total)}</p><small>${new Date(o.tanggal).toLocaleDateString('id-ID')}</small>
    ${o.sudahDinilai ? '<p class="info"><i data-lucide="star"></i>Sudah dinilai</p>' : `<a class="btn y sm" href="#/rating/${o.id}">Beri Rating</a>`}</div>`; }).join('') || '<p class="empty">Belum ada pesanan di perangkat ini.</p>');
}

function vRating(id) {
  const o = Storage.getById('kk_orders', id); if (!o) return nf();
  const s = sellerOf(o.sellerId) || {};
  return `${back('#/pesanan')}<form class="glass box" data-f="rating" data-id="${o.id}" novalidate><h1>Nilai ${esc(s.toko)}</h1>
  <div class="stars" role="radiogroup" aria-label="Rating">${[5, 4, 3, 2, 1].map(n => `<input type="radio" id="r${n}" name="rating" value="${n}"><label for="r${n}" aria-label="${n} bintang"><i data-lucide="star"></i></label>`).join('')}</div>
  <label>Komentar singkat<textarea class="in" name="komentar" maxlength="200"></textarea></label><p class="err" id="err"></p><button class="btn y">Kirim Rating</button></form>`;
}

function vLogin() {
  return `<form class="glass box" data-f="login" novalidate><h1>Masuk Penjual</h1>${fld('wa', 'Nomor WhatsApp', 'tel')}${fld('password', 'Password', 'password')}
  <p class="err" id="err"></p><button class="btn y">Masuk</button><p style="margin-top:12px">Belum punya akun? <a href="#/daftar"><b>Daftar</b></a></p></form>`;
}
function vDaftar() {
  tmp.fotos = [];
  return `<form class="glass box" data-f="daftar" novalidate><h1>Daftar Penjual</h1>${fld('nama', 'Nama', 'text')}${fld('kelas', 'Kelas', 'text')}${fld('wa', 'Nomor WhatsApp', 'tel')}${fld('toko', 'Nama toko/kelompok', 'text')}
  <label>Deskripsi singkat<textarea class="in" name="deskripsi"></textarea></label>
  <label>Foto profil/logo (opsional)<input class="in" type="file" accept="image/*" data-file="profil"></label><div class="prevs" id="prev"></div>
  ${fld('password', 'Password (min. 6 karakter)', 'password')}${fld('konfirmasi', 'Konfirmasi password', 'password')}
  <p class="err" id="err"></p><button class="btn y">Daftar</button><p style="margin-top:12px">Sudah punya akun? <a href="#/login"><b>Masuk</b></a></p></form>`;
}

function vDash() {
  const s = me();
  const ps = Storage.getAll('kk_products').filter(p => p.sellerId === s.id);
  const os = Storage.getAll('kk_orders').filter(o => o.sellerId === s.id).reverse();
  return `<div class="glass box c">${img(s.foto, s.toko, 'av big')}<h1>${esc(s.toko)}</h1>${star(s.id)}<button class="btn o" data-c="logout"><i data-lucide="log-out"></i>Keluar</button></div>
  <div class="between"><h2>Produk Saya</h2><a class="btn y sm" href="#/produk-baru"><i data-lucide="plus"></i>Tambah</a></div>
  ${ps.map(p => `<div class="glass box row2">${img(p.fotos[0], p.nama, 'th')}<div><b>${esc(p.nama)}</b><br>${rp(p.harga)} · ${p.status === 'ready' ? 'Stok ' + p.stok : 'PO'}</div><button class="ic" data-c="delprod" data-id="${p.id}" aria-label="Hapus ${esc(p.nama)}"><i data-lucide="trash-2"></i></button></div>`).join('') || '<p class="empty">Belum ada produk.</p>'}
  <h2>Pesanan Masuk</h2>${os.map(o => { const p = Storage.getById('kk_products', o.productId); return `<div class="glass box"><b>${esc(p ? p.nama : 'Produk dihapus')}</b> x${o.jumlah}<p>${esc(o.namaPembeli)} · ${esc(o.kelasPembeli)}</p><b class="price">${rp(o.total)}</b>${o.catatan ? '<small>Catatan: ' + esc(o.catatan) + '</small>' : ''}</div>`; }).join('') || '<p class="empty">Belum ada pesanan.</p>'}`;
}

function vNew() {
  tmp.fotos = [];
  return `${back('#/dashboard')}<form class="glass box" data-f="produk" novalidate><h1>Tambah Produk</h1>
  <label>Foto produk (1-3, JPG/PNG/WebP maks. 5 MB)<input class="in" type="file" accept="image/*" data-file="produk"></label><div class="prevs" id="prev"></div>
  ${fld('nama', 'Nama produk', 'text')}
  <label>Kategori<select class="in" name="kategori">${CATS.map(c => `<option>${c[0]}</option>`).join('')}</select></label>
  <label>Deskripsi<textarea class="in" name="deskripsi"></textarea></label>
  <label>Status<select class="in" name="status" id="st"><option value="ready">READY</option><option value="po">PRE-ORDER</option></select></label>
  <div id="f-ready">${fld('stok', 'Stok', 'number', '1', 'min="1"')}</div><div id="f-po" hidden>${fld('estimasiPO', 'Estimasi tanggal siap', 'date')}</div>
  <div class="calc"><h3>Kalkulator Harga</h3>${fld('modal', 'Modal per unit (Rp)', 'number', '', 'min="0"')}${fld('margin', 'Target margin (%)', 'number', '30', 'min="0" max="99"')}
  <div class="row3">${[['Aman', 20], ['Standar', 30], ['Untung Besar', 40]].map(([n, m]) => `<button type="button" class="chip" data-c="preset" data-m="${m}">${n}<small>${m}%</small></button>`).join('')}</div>
  ${fld('harga', 'Harga jual (Rp) - boleh diubah manual', 'number')}<div id="calc" aria-live="polite"></div>
  <p class="help">Margin = untung dibanding HARGA JUAL. Markup = untung dibanding MODAL. Contoh: modal Rp7.000, jual Rp10.000 -> untung Rp3.000, margin 30%, markup 42,9%.</p></div>
  <p class="err" id="err"></p><button class="btn y">Simpan Produk</button></form>`;
}

// ---------- KALKULATOR (real-time) ----------
function calc(src) {
  const g = n => parseFloat($(`[name=${n}]`).value) || 0;
  const modal = g('modal'), m = g('margin'), out = $('#calc');
  if (m >= 100 || m < 0) { out.innerHTML = '<p class="warn">Margin harus kurang dari 100%</p>'; return; }
  if (src !== 'harga' && modal > 0) $('[name=harga]').value = hargaRek(modal, m);
  const h = g('harga'), u = h - modal;
  if (!modal) { out.innerHTML = ''; return; }
  out.innerHTML = `<p>Harga rekomendasi: <b>${rp(hargaRek(modal, m))}</b></p><p>Untung per unit: <b>${rp(u)}</b></p>
  <p>Margin aktual: <b>${h ? (u / h * 100).toFixed(1) : 0}%</b> · Markup aktual: <b>${(u / modal * 100).toFixed(1)}%</b></p>
  ${$('#st').value === 'ready' ? `<p>Estimasi untung jika stok habis: <b>${rp(u * g('stok'))}</b></p>` : ''}
  ${h <= modal ? '<p class="warn">Peringatan: harga jual sama dengan atau di bawah modal (RUGI)!</p>' : ''}`;
}
function showPrev() {
  $('#prev').innerHTML = tmp.fotos.map((f, i) => `<div class="th"><img src="${f}" alt="Foto ${i + 1}"><button type="button" class="x" data-c="delfoto" data-i="${i}" aria-label="Hapus foto ${i + 1}"><i data-lucide="x"></i></button></div>`).join('');
  lucide.createIcons();
}

// ---------- AKSI FORM ----------
const F = {
  pesan(f) {
    const p = Storage.getById('kk_products', f.dataset.id), d = Object.fromEntries(new FormData(f)), j = parseInt(d.jumlah);
    const er = !d.nama.trim() || !d.kelas.trim() ? 'Nama dan kelas wajib diisi' : !(j >= 1) ? 'Jumlah minimal 1' : (p.status === 'ready' && j > p.stok) ? `Jumlah melebihi stok (${p.stok})` : '';
    if (er) return fail(er);
    const o = Storage.add('kk_orders', { productId: p.id, sellerId: p.sellerId, namaPembeli: d.nama.trim(), kelasPembeli: d.kelas.trim(), jumlah: j, total: j * p.harga, catatan: d.catatan.trim(), tanggal: new Date().toISOString(), sudahDinilai: false });
    if (!o) return;
    Storage.setObj('kk_my', [...(Storage.getObj('kk_my') || []), o.id]); // riwayat pesanan di perangkat ini
    location.hash = '#/pesanan';
    window.open(waLink(o, p, sellerOf(p.sellerId)), '_blank');
  },
  rating(f) {
    const d = Object.fromEntries(new FormData(f)), o = Storage.getById('kk_orders', f.dataset.id);
    if (!d.rating) return fail('Pilih bintang 1-5');
    if (Storage.getAll('kk_reviews').some(r => r.orderId === o.id)) return fail('Pesanan ini sudah dinilai');
    Storage.add('kk_reviews', { sellerId: o.sellerId, orderId: o.id, rating: +d.rating, komentar: (d.komentar || '').trim(), namaPembeli: o.namaPembeli, tanggal: new Date().toISOString() });
    Storage.update('kk_orders', o.id, { sudahDinilai: true });
    toast('Terima kasih atas penilaianmu'); location.hash = '#/pesanan';
  },
  async login(f) {
    const d = Object.fromEntries(new FormData(f));
    const s = Storage.getAll('kk_sellers').find(x => toWA(x.wa) === toWA(d.wa));
    if (!s || s.passwordHash !== await sha256(d.password)) return fail('Nomor WhatsApp atau password salah');
    Storage.setObj('kk_session', { sellerId: s.id }); location.hash = '#/dashboard';
  },
  async daftar(f) {
    const d = Object.fromEntries(new FormData(f));
    const er = [d.nama, d.kelas, d.toko, d.deskripsi].some(x => !x.trim()) ? 'Semua kolom wajib diisi (kecuali foto)'
      : !validWA(d.wa) ? 'Nomor WhatsApp tidak valid (contoh 081234567890)'
      : Storage.getAll('kk_sellers').some(s => toWA(s.wa) === toWA(d.wa)) ? 'Nomor WhatsApp sudah terdaftar'
      : d.password.length < 6 ? 'Password minimal 6 karakter' : d.password !== d.konfirmasi ? 'Konfirmasi password tidak sama' : '';
    if (er) return fail(er);
    const s = Storage.add('kk_sellers', { nama: d.nama.trim(), kelas: d.kelas.trim(), wa: toWA(d.wa), toko: d.toko.trim(), deskripsi: d.deskripsi.trim(), foto: tmp.fotos[0] || '', passwordHash: await sha256(d.password), dibuat: new Date().toISOString() });
    if (s) { Storage.setObj('kk_session', { sellerId: s.id }); location.hash = '#/dashboard'; }
  },
  produk(f) {
    const d = Object.fromEntries(new FormData(f)), modal = +d.modal, harga = +d.harga;
    const er = !d.nama.trim() ? 'Nama produk wajib diisi' : !tmp.fotos.length ? 'Tambahkan minimal 1 foto' : !d.deskripsi.trim() ? 'Deskripsi wajib diisi'
      : !(modal > 0) ? 'Isi modal per unit' : !(harga > 0) ? 'Isi harga jual' : (d.status === 'ready' && !(+d.stok >= 1)) ? 'Stok minimal 1' : (d.status === 'po' && !d.estimasiPO) ? 'Isi estimasi tanggal siap' : '';
    if (er) return fail(er);
    const ok = Storage.add('kk_products', { sellerId: me().id, nama: d.nama.trim(), kategori: d.kategori, deskripsi: d.deskripsi.trim(), fotos: tmp.fotos, modal, margin: +((harga - modal) / harga * 100).toFixed(1), harga, status: d.status, stok: d.status === 'ready' ? +d.stok : 0, estimasiPO: d.status === 'po' ? d.estimasiPO : '' });
    if (ok) { toast('Produk tersimpan'); location.hash = '#/dashboard'; }
  }
};

// ---------- EVENT ----------
document.addEventListener('submit', e => { const f = e.target.closest('form[data-f]'); if (!f) return; e.preventDefault(); F[f.dataset.f](f); });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-c]'); if (!b) return; const c = b.dataset.c;
  if (c === 'kat') { st.kat = b.dataset.v; refresh(); }
  if (c === 'preset') { $('[name=margin]').value = b.dataset.m; calc(); }
  if (c === 'delfoto') { tmp.fotos.splice(+b.dataset.i, 1); showPrev(); }
  if (c === 'delprod' && confirm('Hapus produk ini?')) { Storage.remove('kk_products', b.dataset.id); route(); }
  if (c === 'logout') { Storage.delObj('kk_session'); location.hash = '#/'; }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { st.q = t.value; refresh(); }
  if (['modal', 'margin', 'stok'].includes(t.name)) calc(t.name);
  if (t.name === 'harga') calc('harga');
  if (t.id === 'st') { $('#f-ready').hidden = t.value !== 'ready'; $('#f-po').hidden = t.value !== 'po'; calc('stok'); }
});
document.addEventListener('change', async e => {
  const t = e.target; if (!t.dataset.file) return;
  const f = t.files[0]; t.value = ''; if (!f) return;
  const one = t.dataset.file === 'profil';
  if (!one && tmp.fotos.length >= 3) return toast('Maksimal 3 foto');
  try { const d = await compress(f, one ? 300 : 800); tmp.fotos = one ? [d] : [...tmp.fotos, d]; showPrev(); } catch (m) { toast(m); }
});

// ---------- ANIMASI SCROLL ----------
const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { threshold: .1 });
const reveal = () => document.querySelectorAll('.rv:not(.in)').forEach(el => io.observe(el));

// ---------- ROUTER (hash) ----------
function route() {
  const [, a = '', b] = location.hash.slice(1).split('/');
  if (['dashboard', 'produk-baru'].includes(a) && !me()) { location.hash = '#/login'; return; } // wajib login
  const V = { '': vHome, produk: () => b ? vDetail(b) : vProduk(), penjual: () => vSeller(b), pesan: () => vPesan(b), pesanan: vPesanan, rating: () => vRating(b), login: vLogin, daftar: vDaftar, dashboard: vDash, 'produk-baru': vNew };
  $('#view').innerHTML = (V[a] || nf)();
  $('#view').dataset.p = a || 'home'; // dipakai CSS desktop untuk membatasi lebar halaman
  const k = { '': 0, produk: 1, penjual: 1, pesan: 1, pesanan: 2, rating: 2 }[a] ?? 3;
  [...$('#nav').children].forEach((x, i) => x.classList.toggle('on', i === k));
  window.scrollTo(0, 0); lucide.createIcons(); reveal();
}
window.addEventListener('hashchange', route);
route();