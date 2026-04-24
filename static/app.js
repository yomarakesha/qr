(function(){
  'use strict';

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
    phone: $('phone'),
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
    ['fullName','phone'].forEach(id => showError(id, false));
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
      const err = new Error(body.errors ? 'Ýalňyşlyk' : ('HTTP ' + res.status));
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
      setStatus('Ýazgy pozuldy', 'ok');
    } catch(err){ setStatus('Pozmak ýalňyşlygy: ' + err.message, 'err'); }
  }

  function formatTs(t){ if (!t) return ''; return new Date(t).toLocaleString('tk-TM'); }

  async function loadContacts(){
    const q = $('historySearch').value.trim();
    const url = '/api/contacts' + (q ? ('?q=' + encodeURIComponent(q)) : '');
    try {
      cachedContacts = await apiFetch(url);
      renderHistory();
    } catch(err){
      historyList.innerHTML = '';
      historyEmpty.style.display = 'block';
      historyEmpty.textContent = 'Ýüklemek ýalňyşlygy: ' + err.message;
    }
  }

  function renderHistory(){
    historyList.innerHTML = '';
    historyCount.textContent = '(' + cachedContacts.length + ')';
    if (cachedContacts.length === 0){
      historyEmpty.style.display = 'block';
      historyEmpty.textContent = $('historySearch').value.trim() ? 'Hiç zat tapylmady' : 'Baza boş';
      renderCompare();
      return;
    }
    historyEmpty.style.display = 'none';
    cachedContacts.forEach(item => {
      const li = document.createElement('li');
      li.className = 'history-item';
      if (selectedForCompare.includes(item.id)) li.classList.add('selected');
      const fullName = (item.fullName || '').trim() || '(без имени)';
      const meta = [item.department, item.title, item.phone].filter(Boolean).join(' · ');
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
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', (e) => { e.stopPropagation(); enterEditMode(item); });
      const dlBtn = document.createElement('button');
      dlBtn.type = 'button';
      dlBtn.textContent = 'PNG';
      dlBtn.title = 'PNG göçürip almak';
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = '/api/contacts/' + item.id + '/qr?download=1';
      });
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'danger';
      delBtn.textContent = '✕';
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
    renderHistory();
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

  function autoFillFileName(){
    if (fileNameTouched) return;
    fields.fileName.value = makeFileName(fields.fullName.value.trim());
  }
  fields.fullName.addEventListener('input', () => { autoFillFileName(); if (fields.fullName.value.trim()) showError('fullName', false); });
  fields.fileName.addEventListener('input', () => { fileNameTouched = true; });
  document.querySelectorAll('input[name="qrMode"]').forEach(r => {
    r.addEventListener('change', () => { showError('phone', false); });
  });

  $('previewBtn').addEventListener('click', previewVcard);
  $('saveBtn').addEventListener('click', saveContact);
  $('downloadBtn').addEventListener('click', downloadQR);
  $('cancelEdit').addEventListener('click', () => { exitEditMode(); setStatus('', ''); });
  $('newBtn').addEventListener('click', () => { exitEditMode(); setStatus('Täze ýazgy', 'info'); });
  $('refreshBtn').addEventListener('click', loadContacts);
  $('historySearch').addEventListener('input', () => {
    clearTimeout(window.__searchTimer);
    window.__searchTimer = setTimeout(loadContacts, 250);
  });
  $('compareClose').addEventListener('click', () => { selectedForCompare = []; renderHistory(); });

  loadContacts();
})();
