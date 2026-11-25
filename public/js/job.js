(function () {
  var root = document.getElementById('job-root');
  var jobId = root.dataset.jobId;
  var videoId = root.dataset.videoId;
  var progress = document.getElementById('progress');
  var stageEl = document.getElementById('stage');
  var failed = document.getElementById('failed');
  var failMsg = document.getElementById('fail-msg');
  var results = document.getElementById('results');
  var player = document.getElementById('player');
  var list = document.getElementById('clip-list');
  var timeline = document.getElementById('timeline');
  var actions = document.getElementById('head-actions');
  var current = null;
  var data = null;

  function fmt(s) {
    s = Math.max(0, Math.floor(s));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' : '') + mm + ':' + String(sec).padStart(2, '0');
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function embed(c) {
    return 'https://www.youtube.com/embed/' + videoId + '?start=' + c.start + '&end=' + c.end + '&autoplay=1&rel=0';
  }

  function select(i) {
    current = i;
    var c = data.clips[i];
    player.src = embed(c);
    Array.prototype.forEach.call(list.children, function (li, idx) { li.classList.toggle('on', idx === i); });
    Array.prototype.forEach.call(timeline.querySelectorAll('button'), function (b, idx) { b.classList.toggle('on', idx === i); });
  }

  function render(result) {
    data = result;
    var dur = result.video.duration || 1;
    player.src = 'https://www.youtube.com/embed/' + videoId + '?rel=0';

    result.clips.forEach(function (c, i) {
      var b = el('button', 'tl-seg');
      b.type = 'button';
      b.style.left = (c.start / dur * 100) + '%';
      b.style.width = Math.max(1.2, (c.end - c.start) / dur * 100) + '%';
      b.setAttribute('aria-label', 'Clip ' + (i + 1) + ', ' + fmt(c.start) + ' to ' + fmt(c.end));
      b.addEventListener('click', function () { select(i); });
      timeline.appendChild(b);

      var li = el('li', 'clip');
      var head = el('div', 'clip-head');
      head.appendChild(el('span', 'score', String(c.score)));
      var titles = el('div');
      titles.appendChild(el('h3', null, c.title));
      titles.appendChild(el('p', 'time', fmt(c.start) + ' to ' + fmt(c.end) + '  (' + (c.end - c.start) + ' sec)'));
      head.appendChild(titles);
      li.appendChild(head);
      if (c.hook) { var q = el('p', 'hook'); q.appendChild(el('strong', null, 'Hook: ')); q.appendChild(document.createTextNode(c.hook)); li.appendChild(q); }
      if (c.reason) li.appendChild(el('p', 'muted', c.reason));

      var row = el('div', 'clip-actions');
      var play = el('button', 'btn btn-primary btn-sm', 'Preview'); play.type = 'button';
      play.addEventListener('click', function () { select(i); player.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      var copy = el('button', 'btn btn-ghost btn-sm', 'Copy times'); copy.type = 'button';
      copy.addEventListener('click', function () {
        var text = fmt(c.start) + ' - ' + fmt(c.end) + ' | ' + c.title;
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {
          copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy times'; }, 1500);
        }, function () { copy.textContent = 'Copy failed'; });
      });
      var yt = el('a', 'btn btn-ghost btn-sm', 'Open on YouTube');
      yt.href = 'https://youtu.be/' + videoId + '?t=' + c.start; yt.target = '_blank'; yt.rel = 'noopener';
      row.appendChild(play); row.appendChild(copy); row.appendChild(yt);
      li.appendChild(row);
      list.appendChild(li);
    });
    actions.hidden = false;
  }

  function csv() {
    var rows = [['rank', 'start', 'end', 'start_seconds', 'end_seconds', 'score', 'title', 'hook', 'reason']];
    data.clips.forEach(function (c, i) { rows.push([i + 1, fmt(c.start), fmt(c.end), c.start, c.end, c.score, c.title, c.hook, c.reason]); });
    var body = rows.map(function (r) { return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
    a.download = 'clips-' + videoId + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  document.getElementById('csv-btn').addEventListener('click', function () { if (data) csv(); });

  function stopGame() { if (window.ClipGame) window.ClipGame.stop(); }

  function poll() {
    fetch('/api/jobs/' + jobId, { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (j) {
        if (j.title) document.getElementById('job-title').textContent = j.title;
        if (j.status === 'done' && j.result) {
          stopGame(); progress.hidden = true; results.hidden = false; render(j.result);
        } else if (j.status === 'failed') {
          stopGame(); progress.hidden = true; failed.hidden = false; failMsg.textContent = j.error || 'This video could not be analysed.';
        } else {
          stageEl.textContent = j.stage || 'Queued';
          setTimeout(poll, 2500);
        }
      })
      .catch(function () { setTimeout(poll, 5000); });
  }
  poll();
})();
