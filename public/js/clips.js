(function () {
  var form = document.getElementById('clip-form');
  var errBox = document.getElementById('form-error');
  var btn = document.getElementById('submit-btn');

  function showError(msg) { errBox.textContent = msg; errBox.hidden = false; }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errBox.hidden = true;
    var data = new FormData(form);
    var url = String(data.get('url') || '').trim();
    if (!url) return showError('Paste a YouTube link first.');

    btn.disabled = true;
    btn.textContent = 'Starting';
    fetch('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url,
        count: data.get('count'),
        length: data.get('length'),
        transcript: data.get('transcript') || ''
      })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body.error || 'Something went wrong. Try again.');
        window.location.href = '/jobs/' + res.body.id;
      })
      .catch(function (err) {
        showError(err.message);
        btn.disabled = false;
        btn.textContent = 'Find the best clips';
      });
  });
})();
