(function(){
  'use strict';

  // ---------- Icons (Feather-style, inline SVG) ----------
  const SVG = (paths) =>
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  const ICONS = {
    edit:    SVG('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>'),
    trash:   SVG('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
    download:SVG('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    upload:  SVG('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
    sheet:   SVG('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>'),
    refresh: SVG('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'),
    search:  SVG('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
    chevronLeft:  SVG('<polyline points="15 18 9 12 15 6"/>'),
    chevronRight: SVG('<polyline points="9 18 15 12 9 6"/>'),
    arrowDown: SVG('<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>'),
    arrowUp:   SVG('<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>'),
    sun:  SVG('<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'),
    moon: SVG('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'),
  };
  function iconBtn(name, label){
    return '<span class="btn-ic">' + ICONS[name] + (label ? '<span>' + label + '</span>' : '') + '</span>';
  }

  // ---------- Theme ----------
  function currentTheme(){ return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function renderThemeIcon(){ $('themeToggle').innerHTML = currentTheme() === 'dark' ? ICONS.sun : ICONS.moon; }
  function toggleTheme(){
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch(e){}
    renderThemeIcon();
  }

  const translitMap = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z',
    'и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
    'с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch',
    'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
    'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo','Ж':'Zh','З':'Z',
    'И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R',
    'С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Shch',
    'Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya'
  };
  function translit(s){
    return s.split('').map(c => translitMap[c] !== undefined ? translitMap[c] : c).join('');
  }
  function makeFileName(name){
    const base = translit(name || '')
      .replace(/[^A-Za-z0-9_\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    return base ? base + '_qr' : 'contact_qr';
  }

  const $ = id => document.getElementById(id);
  const fields = {
    fullName: $('fullName'),
    title: $('title'), department: $('department'),
    phone: $('phone'), email: $('email'),
    fileName: $('fileName'), size: $('size'), ecl: $('ecl')
  };
  const qrBox = $('qrBox');
  const vcardPreview = $('vcardPreview');
  const downloadBtn = $('downloadBtn');
  const historyList = $('historyList');
  const historyEmpty = $('historyEmpty');
  const historyCount = $('historyCount');
  const statusMsg = $('statusMsg');
  const editBanner = $('editBanner');
  const editLabel = $('editLabel');

  let fileNameTouched = false;
  let editingId = null;
  let currentQrId = null;
  let selectedForCompare = [];
  let cachedContacts = [];
  let currentPage = 1;
  let totalPages = 1;
  const PAGE_SIZE = 20;

  function setStatus(msg, kind){
    statusMsg.textContent = msg || '';
    statusMsg.className = 'status-msg' + (kind ? ' ' + kind : '');
  }

  function showError(id, show, msg){
    const input = $(id);
    const err = document.querySelector('.error[data-for="'+id+'"]');
    if (show){
      input.classList.add('invalid');
      if (err){ if (msg) err.textContent = msg; err.classList.add('show'); }
    } else {
      input.classList.remove('invalid');
      if (err) err.classList.remove('show');
    }
  }
  function clearAllErrors(){
    ['fullName','phone','email'].forEach(id => showError(id, false));
  }

  function getQrMode(){
    const el = document.querySelector('input[name="qrMode"]:checked');
    return el ? el.value : 'text';
  }
  function setQrMode(v){
    const el = document.querySelector('input[name="qrMode"][value="' + (v || 'text') + '"]');
    if (el) el.checked = true;
  }

  function getData(){
    return {
      fullName: fields.fullName.value.trim(),
      title: fields.title.value.trim(),
      department: fields.department.value.trim(),
      phone: fields.phone.value.trim(),
      email: fields.email.value.trim(),
      fileName: fields.fileName.value.trim() || makeFileName(fields.fullName.value.trim()),
      size: parseInt(fields.size.value, 10),
      ecl: fields.ecl.value,
      qrMode: getQrMode()
    };
  }

  function applyServerErrors(errors){
    clearAllErrors();
    Object.keys(errors).forEach(k => showError(k, true, errors[k]));
  }

  async function apiFetch(url, opts){
    const res = await fetch(url, opts);
    const ct = res.headers.get('content-type') || '';
    if (res.status === 401){ window.location.href = '/login'; throw new Error('Unauthorized'); }
    if (!res.ok){
      let body = {};
      if (ct.includes('application/json')) body = await res.json().catch(()=>({}));
      const err = new Error(body.errors ? 'Ýalňyşlyk' : (body.error || ('HTTP ' + res.status)));
      err.errors = body.errors || null;
      throw err;
    }
    if (res.status === 204) return null;
    if (ct.includes('application/json')) return res.json();
    return res;
  }

  async function saveContact(){
    clearAllErrors();
    const data = getData();
    setStatus('Saklanýar...', 'info');
    try {
      const url = editingId ? '/api/contacts/' + editingId : '/api/contacts';
      const method = editingId ? 'PUT' : 'POST';
      const saved = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      currentQrId = saved.id;
      editingId = saved.id;
      editLabel.textContent = saved.fullName || '';
      editBanner.classList.add('show');
      await loadQrImage(saved.id);
      await loadVcardPreview(saved.id);
      downloadBtn.disabled = false;
      setStatus('Saklandy we döredildi', 'ok');
      await loadContacts();
      loadDepartments();
    } catch(err){
      if (err.errors){ applyServerErrors(err.errors); setStatus('Formadaky ýalňyşlyklary düzediň', 'err'); }
      else setStatus('Ýalňyşlyk: ' + err.message, 'err');
    }
  }

  async function loadQrImage(id){
    qrBox.innerHTML = '<span class="qr-placeholder">Döredilýär...</span>';
    const data = getData();
    const url = '/api/contacts/' + id + '/qr?size=' + data.size + '&ecl=' + data.ecl + '&t=' + Date.now();
    qrBox.innerHTML = '';
    const img = new Image();
    img.onload = () => { qrBox.innerHTML = ''; qrBox.appendChild(img); };
    img.onerror = () => { qrBox.innerHTML = '<span class="qr-placeholder" style="color:#dc2626">QR ýüklemek ýalňyşlygy</span>'; };
    img.src = url;
  }

  async function loadVcardPreview(id){
    const res = await fetch('/api/contacts/' + id + '/vcard');
    if (!res.ok){ vcardPreview.textContent = 'vCard ýüklemek ýalňyşlygy'; return; }
    vcardPreview.textContent = await res.text();
  }

  async function previewVcard(){
    clearAllErrors();
    try {
      const data = await apiFetch('/api/vcard/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getData())
      });
      vcardPreview.textContent = data.vcard;
      setStatus('Öňünden görkezme täzelendi', 'ok');
    } catch(err){
      if (err.errors){ applyServerErrors(err.errors); setStatus('Ýalňyşlyklary düzediň', 'err'); }
      else setStatus('Ýalňyşlyk: ' + err.message, 'err');
    }
  }

  function downloadQR(){
    if (!currentQrId) return;
    const data = getData();
    const url = '/api/contacts/' + currentQrId + '/qr?download=1&size=' + data.size + '&ecl=' + data.ecl;
    window.location.href = url;
  }

  function exitEditMode(){
    editingId = null;
    editBanner.classList.remove('show');
    fileNameTouched = false;
    fields.fullName.value = '';
    fields.title.value = '';
    fields.department.value = '';
    fields.phone.value = '';
    fields.email.value = '';
    fields.fileName.value = '';
    fields.size.value = '600';
    fields.ecl.value = 'M';
    setQrMode('text');
    clearAllErrors();
    qrBox.innerHTML = '<span class="qr-placeholder">QR saklandan soň görkeziler</span>';
    vcardPreview.textContent = '"QR mazmunyny görkezmek" düwmesine basyň';
    downloadBtn.disabled = true;
    currentQrId = null;
  }

  function enterEditMode(item){
    fields.fullName.value = item.fullName || '';
    fields.title.value = item.title || '';
    fields.department.value = item.department || '';
    fields.phone.value = item.phone || '';
    fields.email.value = item.email || '';
    fields.fileName.value = item.fileName || '';
    fileNameTouched = true;
    if (item.size) fields.size.value = String(item.size);
    if (item.ecl) fields.ecl.value = item.ecl;
    setQrMode(item.qrMode || 'text');
    editingId = item.id;
    currentQrId = item.id;
    editLabel.textContent = item.fullName || '';
    editBanner.classList.add('show');
    clearAllErrors();
    loadQrImage(item.id);
    loadVcardPreview(item.id);
    downloadBtn.disabled = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteEntry(id){
    if (!confirm('Bu ýazgyny pozmalymy?')) return;
    try {
      await apiFetch('/api/contacts/' + id, { method: 'DELETE' });
      if (editingId === id) exitEditMode();
      selectedForCompare = selectedForCompare.filter(sid => sid !== id);
      await loadContacts();
      loadDepartments();
      setStatus('Ýazgy pozuldy', 'ok');
    } catch(err){ setStatus('Pozmak ýalňyşlygy: ' + err.message, 'err'); }
  }

  function formatTs(t){ if (!t) return ''; return new Date(t).toLocaleString('tk-TM'); }

  // ---------- Filters / query ----------
  function buildQuery(extra){
    const params = new URLSearchParams();
    const q = $('historySearch').value.trim();
    const dept = $('filterDept').value;
    const mode = $('filterMode').value;
    if (q) params.set('q', q);
    if (dept) params.set('department', dept);
    if (mode) params.set('qrMode', mode);
    if (extra) Object.keys(extra).forEach(k => params.set(k, extra[k]));
    return params;
  }

  async function loadContacts(){
    const params = buildQuery({
      sort: $('sortKey').value,
      dir: $('sortDirBtn').dataset.dir,
      page: currentPage,
      pageSize: PAGE_SIZE
    });
    try {
      const res = await apiFetch('/api/contacts?' + params.toString());
      cachedContacts = res.items || [];
      totalPages = res.pages || 1;
      currentPage = res.page || 1;
      renderHistory(res.total || 0);
      renderPagination();
    } catch(err){
      historyList.innerHTML = '';
      historyEmpty.style.display = 'block';
      historyEmpty.textContent = 'Ýüklemek ýalňyşlygy: ' + err.message;
      $('pagination').style.display = 'none';
    }
  }

  async function loadDepartments(){
    try {
      const list = await apiFetch('/api/departments');
      const sel = $('filterDept');
      const cur = sel.value;
      sel.innerHTML = '<option value="">Ähli bölümler</option>' +
        list.map(d => '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>').join('');
      sel.value = list.indexOf(cur) >= 0 ? cur : '';
    } catch(e){ /* ignore */ }
  }

  function renderPagination(){
    const pag = $('pagination');
    if (totalPages <= 1){ pag.style.display = 'none'; return; }
    pag.style.display = 'flex';
    $('pageInfo').textContent = currentPage + ' / ' + totalPages;
    $('prevPage').disabled = currentPage <= 1;
    $('nextPage').disabled = currentPage >= totalPages;
  }

  function resetAndLoad(){ currentPage = 1; loadContacts(); }

  function renderHistory(total){
    historyList.innerHTML = '';
    historyCount.textContent = '(' + total + ')';
    if (cachedContacts.length === 0){
      historyEmpty.style.display = 'block';
      const hasFilter = $('historySearch').value.trim() || $('filterDept').value || $('filterMode').value;
      historyEmpty.textContent = hasFilter ? 'Hiç zat tapylmady' : 'Baza boş';
      renderCompare();
      return;
    }
    historyEmpty.style.display = 'none';
    cachedContacts.forEach(item => {
      const li = document.createElement('li');
      li.className = 'history-item';
      if (selectedForCompare.includes(item.id)) li.classList.add('selected');
      const fullName = (item.fullName || '').trim() || '(adsyz)';
      const meta = [item.department, item.title, item.phone, item.email].filter(Boolean).join(' · ');
      const ts = (item.updatedAt && item.updatedAt !== item.createdAt)
        ? 'Üýtgedildi: ' + formatTs(item.updatedAt)
        : 'Döredildi: ' + formatTs(item.createdAt);

      const info = document.createElement('div');
      info.className = 'info';
      info.innerHTML = '<div class="name"></div><div class="meta"></div><div class="ts"></div>';
      info.querySelector('.name').textContent = fullName;
      info.querySelector('.meta').textContent = meta;
      info.querySelector('.ts').textContent = ts;
      info.addEventListener('click', () => toggleCompare(item.id));

      const actions = document.createElement('div');
      actions.className = 'actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.title = 'Redaktirlemek';
      editBtn.innerHTML = ICONS.edit;
      editBtn.addEventListener('click', (e) => { e.stopPropagation(); enterEditMode(item); });
      const dlBtn = document.createElement('button');
      dlBtn.type = 'button';
      dlBtn.title = 'PNG göçürip almak';
      dlBtn.innerHTML = ICONS.download;
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = '/api/contacts/' + item.id + '/qr?download=1';
      });
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'danger';
      delBtn.title = 'Pozmak';
      delBtn.innerHTML = ICONS.trash;
      delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteEntry(item.id); });
      actions.appendChild(editBtn);
      actions.appendChild(dlBtn);
      actions.appendChild(delBtn);

      li.appendChild(info);
      li.appendChild(actions);
      historyList.appendChild(li);
    });
    renderCompare();
  }

  function toggleCompare(id){
    const idx = selectedForCompare.indexOf(id);
    if (idx >= 0) selectedForCompare.splice(idx, 1);
    else {
      selectedForCompare.push(id);
      if (selectedForCompare.length > 2) selectedForCompare.shift();
    }
    renderHistory(parseInt((historyCount.textContent.match(/\d+/) || [0])[0], 10));
  }

  function renderCompare(){
    const box = $('compareBox');
    const grid = $('compareGrid');
    if (selectedForCompare.length !== 2){ box.classList.remove('show'); return; }
    const a = cachedContacts.find(e => e.id === selectedForCompare[0]);
    const b = cachedContacts.find(e => e.id === selectedForCompare[1]);
    if (!a || !b){ box.classList.remove('show'); return; }
    const keys = [
      ['department','Bölüm'],
      ['title','Wezipe'],
      ['fullName','Ady'],
      ['phone','Telefon'],
      ['email','Email'],
      ['size','Ölçeg'], ['ecl','Düzediş'], ['fileName','Faýl']
    ];
    function col(e, title){
      let html = '<h4>' + escapeHtml(title) + '</h4>';
      keys.forEach(([k, label]) => {
        const va = a[k] == null ? '' : String(a[k]);
        const vb = b[k] == null ? '' : String(b[k]);
        const changed = va !== vb;
        const v = e[k] == null || e[k] === '' ? '—' : String(e[k]);
        html += '<div class="diff-row' + (changed ? ' changed' : '') + '"><span class="k">' + label + '</span><span>' + escapeHtml(v) + '</span></div>';
      });
      return html;
    }
    grid.innerHTML = '<div class="compare-col">' + col(a, (a.fullName || '').trim() || ('#'+a.id)) + '</div>' +
                     '<div class="compare-col">' + col(b, (b.fullName || '').trim() || ('#'+b.id)) + '</div>';
    box.classList.add('show');
  }

  function escapeHtml(s){
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }

  // ---------- Excel import / export ----------
  function showImportResult(msg, kind){
    const el = $('importResult');
    el.textContent = msg;
    el.className = 'import-result show' + (kind ? ' ' + kind : '');
    if (kind === 'ok') setTimeout(() => { el.classList.remove('show'); }, 6000);
  }

  async function importExcel(file){
    const fd = new FormData();
    fd.append('file', file);
    showImportResult('Import edilýär...', '');
    try {
      const res = await apiFetch('/api/contacts/import', { method: 'POST', body: fd });
      let msg = (res.created || 0) + ' ýazgy goşuldy';
      if (res.failed) msg += ', ' + res.failed + ' setir ýalňyş geçirildi';
      showImportResult(msg, res.failed ? 'err' : 'ok');
      currentPage = 1;
      await loadContacts();
      loadDepartments();
    } catch(err){
      showImportResult('Import ýalňyşlygy: ' + (err.message || ''), 'err');
    }
  }

  // ---------- Static icons ----------
  $('searchIcon').innerHTML = ICONS.search;
  $('templateBtn').innerHTML = iconBtn('sheet', 'Şablon');
  $('importBtn').innerHTML = iconBtn('upload', 'Import');
  $('exportBtn').innerHTML = iconBtn('download', 'Eksport');
  $('refreshBtn').innerHTML = ICONS.refresh;
  $('sortDirBtn').innerHTML = ICONS.arrowDown;
  $('prevPage').innerHTML = ICONS.chevronLeft;
  $('nextPage').innerHTML = ICONS.chevronRight;
  renderThemeIcon();

  // ---------- Form events ----------
  function autoFillFileName(){
    if (fileNameTouched) return;
    fields.fileName.value = makeFileName(fields.fullName.value.trim());
  }
  fields.fullName.addEventListener('input', () => { autoFillFileName(); if (fields.fullName.value.trim()) showError('fullName', false); });
  fields.fileName.addEventListener('input', () => { fileNameTouched = true; });
  fields.email.addEventListener('input', () => { showError('email', false); });
  document.querySelectorAll('input[name="qrMode"]').forEach(r => {
    r.addEventListener('change', () => { showError('phone', false); });
  });

  $('previewBtn').addEventListener('click', previewVcard);
  $('saveBtn').addEventListener('click', saveContact);
  $('downloadBtn').addEventListener('click', downloadQR);
  $('cancelEdit').addEventListener('click', () => { exitEditMode(); setStatus('', ''); });
  $('newBtn').addEventListener('click', () => { exitEditMode(); setStatus('Täze ýazgy', 'info'); });
  $('refreshBtn').addEventListener('click', () => { loadContacts(); loadDepartments(); });
  $('themeToggle').addEventListener('click', toggleTheme);

  // ---------- Search / filter / sort events ----------
  $('historySearch').addEventListener('input', () => {
    clearTimeout(window.__searchTimer);
    window.__searchTimer = setTimeout(resetAndLoad, 250);
  });
  $('filterDept').addEventListener('change', resetAndLoad);
  $('filterMode').addEventListener('change', resetAndLoad);
  $('sortKey').addEventListener('change', resetAndLoad);
  $('sortDirBtn').addEventListener('click', () => {
    const btn = $('sortDirBtn');
    const next = btn.dataset.dir === 'asc' ? 'desc' : 'asc';
    btn.dataset.dir = next;
    btn.innerHTML = next === 'asc' ? ICONS.arrowUp : ICONS.arrowDown;
    resetAndLoad();
  });

  // ---------- Pagination events ----------
  $('prevPage').addEventListener('click', () => { if (currentPage > 1){ currentPage--; loadContacts(); } });
  $('nextPage').addEventListener('click', () => { if (currentPage < totalPages){ currentPage++; loadContacts(); } });

  // ---------- Excel events ----------
  $('templateBtn').addEventListener('click', () => { window.location.href = '/api/contacts/template.xlsx'; });
  $('exportBtn').addEventListener('click', () => {
    window.location.href = '/api/contacts/export.xlsx?' + buildQuery().toString();
  });
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importExcel(file);
    e.target.value = '';
  });

  $('compareClose').addEventListener('click', () => { selectedForCompare = []; loadContacts(); });

  loadDepartments();
  loadContacts();
})();
