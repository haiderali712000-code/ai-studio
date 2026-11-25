// Tiny tap game shown while a video is being analysed.
(function () {
  var field = document.getElementById('game-field');
  var scoreEl = document.getElementById('score');
  if (!field) return;
  var score = 0;
  var timer = null;

  function spawn() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'gem';
    b.tabIndex = -1;
    b.style.left = 4 + Math.random() * 84 + '%';
    b.style.top = 6 + Math.random() * 70 + '%';
    b.style.width = 38 + Math.random() * 56 + 'px';
    b.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      score++;
      scoreEl.textContent = score;
      b.classList.add('hit');
      setTimeout(function () { b.remove(); }, 180);
    });
    field.appendChild(b);
    setTimeout(function () { b.remove(); }, 1500);
  }

  function stop() {
    clearInterval(timer);
    field.innerHTML = '';
  }

  timer = setInterval(spawn, 650);
  window.ClipGame = { stop: stop };
})();
