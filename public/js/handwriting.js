(function () {
  var form = document.getElementById('hand-form');
  var text = document.getElementById('h-text');
  var fontSel = document.getElementById('h-font');
  var swatches = document.getElementById('h-swatches');
  var custom = document.getElementById('h-color-custom');
  var size = document.getElementById('h-size');
  var btn = document.getElementById('h-btn');
  var errBox = document.getElementById('h-error');
  var result = document.getElementById('h-result');
  var pagesBox = document.getElementById('h-pages');
  var allBtn = document.getElementById('h-all');
  var note = document.getElementById('h-note');
  var fonts = [];
  var color = 'blue';
  var current = [];
  var ext = 'png';

  function show(msg) { errBox.textContent = msg; errBox.hidden = false; }
  function radio(name) { return (form.querySelector('input[name=' + name + ']:checked') || {}).value || ''; }

  text.addEventListener('input', function () { document.getElementById('h-count').textContent = text.value.length; });
  size.addEventListener('input', function () { document.getElementById('h-size-out').textContent = size.value; });

  function fillFonts() {
    var rtl = radio('lang') === 'urdu';
    var list = fonts.filter(function (f) { return !!f.rtl === rtl; });
    fontSel.textContent = '';
    if (!list.length) {
      var o0 = document.createElement('option');
      o0.value = '';
      o0.textContent = rtl ? 'Default Urdu style' : 'Default style';
      fontSel.appendChild(o0);
      return;
    }
    list.forEach(function (f) {
      var o = document.createElement('option');
      o.value = f.key; o.textContent = f.label;
      fontSel.appendChild(o);
    });
  }
  Array.prototype.forEach.call(form.querySelectorAll('input[name=lang]'), function (r) { r.addEventListener('change', fillFonts); });

  function pick(btnEl, value) {
    color = value;
    Array.prototype.forEach.call(swatches.children, function (b) { b.classList.toggle('on', b === btnEl); });
  }
  custom.addEventListener('input', function () { pick(null, custom.value); });

  fetch('/api/hand/options')
    .then(function (r) { return r.json(); })
    .then(function (o) {
      fonts = o.fonts || [];
      fillFonts();
      (o.colors || []).forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'swatch'; b.title = c.name; b.setAttribute('aria-label', c.name);
        b.style.background = c.hex;
        b.addEventListener('click', function () { pick(b, c.name); });
        swatches.appendChild(b);
        if (c.name === ((o.defaults || {}).color || 'blue')) pick(b, c.name);
      });
    })
    .catch(function () { fonts = []; fillFonts(); show('Could not load styles. You can still generate with the defaults.'); });

  function download(url, name) {
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  allBtn.addEventListener('click', function () {
    current.forEach(function (u, i) { setTimeout(function () { download(u, 'handwriting-page-' + (i + 1) + '.' + ext); }, i * 400); });
  });

  function render(d) {
    current = d.pages; ext = d.format === 'jpeg' ? 'jpg' : 'png';
    pagesBox.textContent = '';
    d.pages.forEach(function (u, i) {
      var card = document.createElement('figure'); card.className = 'hand-page';
      var img = document.createElement('img'); img.src = u; img.alt = 'Handwritten page ' + (i + 1);
      var cap = document.createElement('figcaption');
      var label = document.createElement('span'); label.textContent = 'Page ' + (i + 1);
      var a = document.createElement('a'); a.className = 'btn btn-ghost btn-sm'; a.textContent = 'Download';
      a.href = u; a.download = 'handwriting-page-' + (i + 1) + '.' + ext;
      cap.appendChild(label); cap.appendChild(a);
      card.appendChild(img); card.appendChild(cap);
      pagesBox.appendChild(card);
    });
    allBtn.hidden = d.pages.length < 2;
    note.hidden = !d.truncated;
    if (d.truncated) note.textContent = 'Your text needs ' + d.totalPages + ' pages. Only the first ' + d.pages.length + ' are shown. Split the text to get the rest.';
    result.hidden = false;
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errBox.hidden = true;
    var t = text.value.trim();
    if (!t) { show('Type some text first.'); return; }
    btn.disabled = true; btn.textContent = 'Writing';
    fetch('/api/hand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: t, font: fontSel.value, color: color, size: Number(size.value),
        paper: radio('paper'), style: radio('style'), lang: radio('lang'), format: radio('format')
      })
    })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong. Try again.'); return j; }); })
      .then(render)
      .catch(function (err) { show(err.message); })
      .then(function () { btn.disabled = false; btn.textContent = 'Generate handwriting'; });
  });
})();
