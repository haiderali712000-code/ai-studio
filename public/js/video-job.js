(function () {
  var root = document.getElementById('job-root');
  var id = root.dataset.jobId;
  var progress = document.getElementById('progress');
  var stage = document.getElementById('stage');
  var failed = document.getElementById('failed');
  var failMsg = document.getElementById('fail-msg');
  var result = document.getElementById('result');
  var video = document.getElementById('video');
  var actions = document.getElementById('head-actions');
  var timer = null;

  function poll() {
    fetch('/api/jobs/' + id)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.title) document.getElementById('job-title').textContent = j.title;
        if (j.status === 'done' && j.result && /^https:\/\//.test(j.result.url || '')) {
          progress.hidden = true;
          video.src = j.result.url;
          result.hidden = false;
          actions.hidden = false;
          return;
        }
        if (j.status === 'failed') {
          progress.hidden = true;
          failMsg.textContent = j.error || 'The video could not be made. Your credits were refunded.';
          failed.hidden = false;
          return;
        }
        stage.textContent = j.stage || 'Waiting in line';
        timer = setTimeout(poll, 4000);
      })
      .catch(function () { timer = setTimeout(poll, 6000); });
  }
  poll();
})();
