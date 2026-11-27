(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;

  /* ---- Pointer parallax (smoothed) -> --mx / --my ---- */
  if (!reduce) {
    var tx = 0, ty = 0, cx = 0, cy = 0, queued = false;
    window.addEventListener('pointermove', function (e) {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      kick();
    }, { passive: true });
    var kick = function () { if (!queued) { queued = true; requestAnimationFrame(step); } };
    var step = function () {
      queued = false;
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      root.style.setProperty('--mx', cx.toFixed(3));
      root.style.setProperty('--my', cy.toFixed(3));
      if (Math.abs(tx - cx) > 0.003 || Math.abs(ty - cy) > 0.003) kick();
    };
  }

  /* ---- Card spotlight that follows the mouse ---- */
  var SPOT = '.panel, .tool, .plan, .g-card, .stat, .clip, .ai-tool';
  document.addEventListener('pointermove', function (e) {
    if (reduce || e.pointerType !== 'mouse' || !e.target.closest) return;
    var c = e.target.closest(SPOT);
    if (!c) return;
    var r = c.getBoundingClientRect();
    c.style.setProperty('--gx', (e.clientX - r.left) + 'px');
    c.style.setProperty('--gy', (e.clientY - r.top) + 'px');
  }, { passive: true });

  function onReady(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  onReady(function () {
    /* ---- Scroll reveal (once) ---- */
    var items = document.querySelectorAll('[data-reveal]');
    if (!reduce && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var el = en.target;
          el.classList.remove('pending');
          io.unobserve(el);
          setTimeout(function () { el.style.transitionDelay = ''; }, 1200);
        });
      }, { threshold: 0.12 });
      items.forEach(function (el) {
        var idx = Array.prototype.indexOf.call(el.parentNode.children, el);
        el.style.transitionDelay = (idx % 6) * 70 + 'ms';
        el.classList.add('reveal', 'pending');
        io.observe(el);
      });
    }

    /* ---- Gallery: drop real images into /public/img/gallery/g1.jpg ... g8.jpg and they replace the drawn art ---- */
    document.querySelectorAll('.g-card[data-img]').forEach(function (card) {
      var probe = new Image();
      probe.onload = function () {
        var img = document.createElement('img');
        img.src = card.dataset.img;
        img.alt = card.dataset.alt || '';
        img.loading = 'lazy';
        card.insertBefore(img, card.firstChild);
        card.classList.add('has-img');
      };
      probe.src = card.dataset.img;
    });

    /* ---- Hero: type a prompt, "render" the objects, shift colours, repeat ---- */
    var box = document.querySelector('[data-prompts]');
    var stage = document.getElementById('stage');
    var textEl = document.getElementById('prompt-text');
    if (!box || !stage || !textEl) return;
    var prompts;
    try { prompts = JSON.parse(box.getAttribute('data-prompts')); } catch (e) { return; }
    if (reduce || !prompts.length) return;

    var timers = [], i = 0;
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function clear() { timers.forEach(clearTimeout); timers = []; }

    function cycle() {
      clear();
      var text = prompts[i % prompts.length];
      var t = 200;
      textEl.textContent = '';
      for (var n = 0; n < text.length; n++) {
        (function (k) { later(function () { textEl.textContent = text.slice(0, k + 1); }, t + k * 34); })(n);
      }
      t += text.length * 34 + 500;
      later(function () {
        stage.style.setProperty('--hue', ((i + 1) * 47 % 360) + 'deg');
        stage.classList.remove('rendering');
        void stage.offsetWidth;
        stage.classList.add('rendering');
      }, t);
      t += 3200;
      for (var b = text.length; b > 0; b--) {
        (function (k) { later(function () { textEl.textContent = text.slice(0, k); }, t + (text.length - k) * 12); })(b - 1);
      }
      t += text.length * 12 + 250;
      later(function () { i++; cycle(); }, t);
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) clear(); else cycle(); });
    cycle();
  });
})();
