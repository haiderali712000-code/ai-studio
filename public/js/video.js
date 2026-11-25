(function () {
  var topicForm = document.getElementById('topic-form');
  var topicBtn = document.getElementById('topic-btn');
  var topicErr = document.getElementById('topic-error');
  var manualBtn = document.getElementById('manual-btn');
  var form = document.getElementById('video-form');
  var scenesBox = document.getElementById('scenes');
  var addBtn = document.getElementById('add-scene');
  var errBox = document.getElementById('video-error');
  var btn = document.getElementById('video-btn');
  var MAX = Number(form.dataset.max), MAX_V = Number(form.dataset.voiceover), MAX_P = Number(form.dataset.prompt);

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function show(box, msg) { box.textContent = msg; box.hidden = false; }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong. Try again.'); return j; }); });
  }

  function renumber() {
    var cards = scenesBox.children;
    for (var i = 0; i < cards.length; i++) {
      cards[i].querySelector('.scene-num').textContent = 'Scene ' + (i + 1);
      cards[i].querySelector('.scene-del').hidden = cards.length === 1;
    }
    addBtn.disabled = cards.length >= MAX;
  }

  function addScene(s) {
    s = s || {};
    var card = el('section', 'panel scene');
    var head = el('div', 'scene-head');
    head.appendChild(el('strong', 'scene-num', ''));
    var del = el('button', 'btn btn-ghost btn-sm scene-del', 'Remove');
    del.type = 'button';
    del.addEventListener('click', function () { card.remove(); renumber(); });
    head.appendChild(del);
    card.appendChild(head);

    var l1 = el('label', null, 'What the voice says');
    var t1 = el('textarea'); t1.rows = 3; t1.maxLength = MAX_V; t1.className = 's-voice'; t1.value = s.voiceoverText || '';
    l1.appendChild(t1);
    var l2 = el('label', null, 'What the image shows (English works best)');
    var t2 = el('textarea'); t2.rows = 3; t2.maxLength = MAX_P; t2.className = 's-image'; t2.value = s.imagePrompt || '';
    l2.appendChild(t2);
    card.appendChild(l1); card.appendChild(l2);
    scenesBox.appendChild(card);
    renumber();
    return card;
  }

  function reveal(title, scenes) {
    scenesBox.textContent = '';
    scenes.forEach(addScene);
    document.getElementById('v-title').value = title || '';
    form.hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  topicForm.addEventListener('submit', function (e) {
    e.preventDefault();
    topicErr.hidden = true;
    var topic = document.getElementById('topic').value.trim();
    if (topic.length < 3) { show(topicErr, 'Describe what the video is about.'); return; }
    var count = Number((topicForm.querySelector('input[name=count]:checked') || {}).value) || 5;
    topicBtn.disabled = true; topicBtn.textContent = 'Writing';
    post('/api/video/script', { topic: topic, count: count })
      .then(function (d) { reveal(d.title, d.scenes); })
      .catch(function (err) { show(topicErr, err.message); })
      .then(function () { topicBtn.disabled = false; topicBtn.textContent = 'Write the script'; });
  });

  manualBtn.addEventListener('click', function () { reveal('', [{}]); });
  addBtn.addEventListener('click', function () { if (scenesBox.children.length < MAX) addScene({}); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errBox.hidden = true;
    var scenes = Array.prototype.map.call(scenesBox.children, function (c) {
      return { voiceoverText: c.querySelector('.s-voice').value.trim(), imagePrompt: c.querySelector('.s-image').value.trim() };
    });
    btn.disabled = true; btn.textContent = 'Sending';
    post('/api/video', {
      title: document.getElementById('v-title').value.trim(),
      scenes: scenes,
      voice: document.getElementById('v-voice').value,
      subtitles: document.getElementById('v-subs').checked,
      subColor: document.getElementById('v-color').value
    })
      .then(function (d) { window.location.href = '/jobs/' + d.id; })
      .catch(function (err) { show(errBox, err.message); btn.disabled = false; btn.textContent = 'Create video'; });
  });
})();
