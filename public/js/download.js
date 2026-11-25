(function () {
  var form = document.getElementById('dl-form');
  var btn = document.getElementById('dl-btn');
  var errBox = document.getElementById('dl-error');
  var result = document.getElementById('dl-result');
  var main = document.getElementById('dl-main');
  var list = document.getElementById('dl-qualities');

  function safe(u) { return typeof u === 'string' && /^https?:\/\//i.test(u); }
  function link(cls, text, href) {
    var a = document.createElement('a');
    a.className = cls;
    a.textContent = text;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errBox.hidden = true;
    result.hidden = true;
    var url = String(new FormData(form).get('url') || '').trim();
    if (!url) { errBox.textContent = 'Paste a link first.'; errBox.hidden = false; return; }

    btn.disabled = true;
    btn.textContent = 'Preparing';
    fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body.error || 'Something went wrong. Try again.');
        var d = res.body;
        document.getElementById('dl-title').textContent = d.title || 'Ready to download';
        document.getElementById('dl-platform').textContent = d.platform ? 'Source: ' + d.platform : '';
        main.textContent = '';
        list.textContent = '';
        if (safe(d.videoUrl)) main.appendChild(link('btn btn-primary', 'Download video', d.videoUrl));
        if (safe(d.audioUrl)) main.appendChild(link('btn btn-ghost', 'Download audio', d.audioUrl));
        (d.qualities || []).forEach(function (q) {
          if (!safe(q.url)) return;
          var li = document.createElement('li');
          var name = document.createElement('span');
          name.textContent = q.label + (q.size ? ' (' + q.size + ')' : '');
          li.appendChild(name);
          li.appendChild(link('btn btn-ghost btn-sm', 'Download', q.url));
          list.appendChild(li);
        });
        result.hidden = false;
      })
      .catch(function (err) { errBox.textContent = err.message; errBox.hidden = false; })
      .then(function () { btn.disabled = false; btn.textContent = 'Get download links'; });
  });
})();
