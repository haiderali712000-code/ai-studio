(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var doc = document.documentElement;

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------- Scroll reveal (once, staggered inside grids) ---------- */
  if (!reduce && 'IntersectionObserver' in window) {
    var targets = document.querySelectorAll('.section > h2, .steps li, .tool-grid > *, .plan-grid > *');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.classList.add('in');
        io.unobserve(el);
        setTimeout(function () { el.style.transitionDelay = ''; }, 1200); // so tilt is not delayed later
      });
    }, { threshold: 0.15 });
    targets.forEach(function (el) {
      var idx = Array.prototype.indexOf.call(el.parentNode.children, el);
      el.style.transitionDelay = Math.min(idx, 6) * 70 + 'ms';
      el.classList.add('rv');
      io.observe(el);
    });
  }

  /* ---------- Motion tilt: mouse everywhere, device tilt on phones (opt-in) ---------- */
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-tilt]'));
  var mouseTilt = store('tilt') !== 'off';
  function apply(el, rx, ry) {
    el.style.transform = 'perspective(900px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
  }
  cards.forEach(function (el) {
    var max = parseFloat(el.dataset.tilt) || 4;
    el.addEventListener('pointermove', function (e) {
      if (reduce || !mouseTilt || e.pointerType !== 'mouse') return;
      var r = el.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transition = 'transform .08s linear';
      apply(el, -y * max * 2, x * max * 2);
    });
    el.addEventListener('pointerleave', function () {
      el.style.transition = 'transform .5s ease';
      apply(el, 0, 0);
    });
  });

  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  function onOrient(e) {
    var g = clamp(e.gamma || 0, -30, 30) / 30;
    var b = clamp((e.beta || 45) - 45, -30, 30) / 30;
    cards.forEach(function (el) {
      var max = parseFloat(el.dataset.tilt) || 4;
      el.style.transition = 'transform .15s linear';
      apply(el, -b * max, g * max);
    });
  }

  var coarse = window.matchMedia('(pointer: coarse)').matches;
  if (!reduce && coarse && 'DeviceOrientationEvent' in window && cards.length) {
    var on = false;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tilt-toggle';
    btn.textContent = 'Enable motion tilt';
    function setOn(v) {
      on = v;
      btn.textContent = on ? 'Motion tilt on' : 'Enable motion tilt';
      btn.setAttribute('aria-pressed', String(on));
      if (on) window.addEventListener('deviceorientation', onOrient);
      else { window.removeEventListener('deviceorientation', onOrient); cards.forEach(function (el) { apply(el, 0, 0); }); }
    }
    btn.addEventListener('click', function () {
      if (on) return setOn(false);
      var D = window.DeviceOrientationEvent;
      if (typeof D.requestPermission === 'function') {
        D.requestPermission().then(function (r) { if (r === 'granted') setOn(true); }).catch(function () {});
      } else setOn(true);
    });
    document.body.appendChild(btn);
  }

  /* ---------- Hero demo: type a link, scan the video, reveal ranked clips, loop ---------- */
  var demo = document.querySelector('[data-demo]');
  if (demo && !reduce) {
    var urlEl = demo.querySelector('#demo-url');
    var full = urlEl.textContent;
    var segs = Array.prototype.slice.call(demo.querySelectorAll('.seg'));
    var clips = Array.prototype.slice.call(demo.querySelectorAll('.reel-clip'));
    var scan = demo.querySelector('.scan');
    var timers = [];
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function clear() { timers.forEach(clearTimeout); timers = []; }

    function countUp(node) {
      var target = parseInt(node.dataset.score, 10) || 0;
      var t0 = null;
      (function step(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / 600);
        node.textContent = Math.round(target * p);
        if (p < 1) requestAnimationFrame(step);
      })(performance.now());
    }

    function reset() {
      demo.classList.add('demo-on');
      segs.concat(clips).forEach(function (n) { n.classList.remove('in'); });
      scan.classList.remove('run');
      urlEl.textContent = '';
      clips.forEach(function (c) { c.querySelector('i').textContent = '0'; });
    }

    function run() {
      clear();
      reset();
      var t = 400;
      for (var i = 0; i < full.length; i++) {
        (function (n) { later(function () { urlEl.textContent = full.slice(0, n + 1); }, t + n * 38); })(i);
      }
      t += full.length * 38 + 350;
      later(function () { void scan.offsetWidth; scan.classList.add('run'); }, t);
      segs.forEach(function (s) {
        var left = parseFloat(s.style.getPropertyValue('--l')) || 0;
        later(function () { s.classList.add('in'); }, t + left * 18);
      });
      t += 1900;
      clips.forEach(function (c, i) {
        later(function () { c.classList.add('in'); countUp(c.querySelector('i')); }, t + i * 380);
      });
      t += clips.length * 380 + 4500;
      later(run, t);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clear(); else run();
    });
    run();
  }
})();
