(function () {
  var form = document.getElementById('tts-form');
  var text = document.getElementById('tts-text');
  var count = document.getElementById('tts-count');
  var langSel = document.getElementById('tts-lang');
  var voiceSel = document.getElementById('tts-voice');
  var pitch = document.getElementById('tts-pitch');
  var rate = document.getElementById('tts-rate');
  var btn = document.getElementById('tts-btn');
  var errBox = document.getElementById('tts-error');
  var result = document.getElementById('tts-result');
  var audio = document.getElementById('tts-audio');
  var dl = document.getElementById('tts-download');
  var grouped = {};
  var objectUrl = null;

  function showError(msg) { errBox.textContent = msg; errBox.hidden = false; }

  text.addEventListener('input', function () { count.textContent = text.value.length; });
  pitch.addEventListener('input', function () { document.getElementById('tts-pitch-out').textContent = pitch.value; });
  rate.addEventListener('input', function () { document.getElementById('tts-rate-out').textContent = rate.value; });

  function fillVoices() {
    var list = grouped[langSel.value] || [];
    voiceSel.textContent = '';
    list.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v.index;
      o.textContent = v.name + (v.gender ? ' (' + v.gender + ')' : '') + (v.country ? ', ' + v.country : '');
      voiceSel.appendChild(o);
    });
    voiceSel.disabled = !list.length;
    btn.disabled = !list.length;
  }
  langSel.addEventListener('change', fillVoices);

  fetch('/api/voices')
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
    .then(function (res) {
      if (!res.ok) throw new Error(res.body.error || 'Could not load voices.');
      res.body.voices.forEach(function (v) { (grouped[v.language] = grouped[v.language] || []).push(v); });
      var langs = Object.keys(grouped).sort(function (a, b) {
        var pri = { Multilingual: 0, English: 1 };
        var pa = a in pri ? pri[a] : 2, pb = b in pri ? pri[b] : 2;
        return pa - pb || a.localeCompare(b);
      });
      langSel.textContent = '';
      langs.forEach(function (l) {
        var o = document.createElement('option');
        o.value = l;
        o.textContent = l + ' (' + grouped[l].length + ')';
        langSel.appendChild(o);
      });
      fillVoices();
    })
    .catch(function (err) { langSel.textContent = ''; showError(err.message); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errBox.hidden = true;
    result.hidden = true;
    var t = text.value.trim();
    if (!t) { showError('Type some text first.'); return; }
    btn.disabled = true;
    btn.textContent = 'Generating';
    fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: t, voiceIndex: Number(voiceSel.value), pitch: Number(pitch.value), rate: Number(rate.value) })
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'Something went wrong. Try again.'); });
        return r.blob();
      })
      .then(function (blob) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(blob);
        audio.src = objectUrl;
        dl.href = objectUrl;
        result.hidden = false;
        audio.play().catch(function () {});
      })
      .catch(function (err) { showError(err.message); })
      .then(function () { btn.disabled = !voiceSel.value; btn.textContent = 'Generate voiceover'; });
  });
})();
