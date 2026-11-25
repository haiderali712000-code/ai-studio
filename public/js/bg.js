// Site-wide moving background: rotating rings, floating film frames, drifting streaks, pointer + scroll parallax.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(cls, vars) {
    var n = document.createElement('i');
    n.className = cls;
    for (var k in vars) n.style.setProperty(k, vars[k]);
    return n;
  }
  function layer(depth, scroll) {
    var d = document.createElement('div');
    d.className = 'fx-layer';
    d.style.setProperty('--d', depth);
    d.style.setProperty('--s', scroll);
    return d;
  }

  function build() {
    var bg = document.createElement('div');
    bg.className = 'bg-fx';
    bg.setAttribute('aria-hidden', 'true');

    // 1. Giant outlined word
    var wordLayer = layer(8, -0.03);
    var word = document.createElement('span');
    word.className = 'fx-word';
    word.textContent = 'Clip';
    wordLayer.appendChild(word);
    bg.appendChild(wordLayer);

    // 2. Concentric rings
    var rings = layer(14, -0.05);
    ['r1', 'r2', 'r3', 'r4', 'r5'].forEach(function (r) { rings.appendChild(el('ring ' + r, {})); });
    bg.appendChild(rings);

    // 3. Streaks
    var streaks = layer(22, -0.08);
    for (var i = 0; i < 16; i++) {
      streaks.appendChild(el('streak', {
        left: Math.random() * 100 + '%',
        top: Math.random() * 100 + '%',
        '--len': 40 + Math.random() * 90 + 'px',
        '--dur': 14 + Math.random() * 18 + 's',
        '--delay': -Math.random() * 20 + 's'
      }));
    }
    bg.appendChild(streaks);

    // 4. Floating film frames (two depths for parallax)
    var tiles = [
      { c: 't-teal', x: 22, y: -3, w: 210, h: 150, r: '-14deg', dx: '18px', dy: '26px', dr: '5deg', dur: 15, depth: 0 },
      { c: 't-sand', x: 79, y: -5, w: 300, h: 250, r: '12deg', dx: '-22px', dy: '30px', dr: '-4deg', dur: 18, depth: 1 },
      { c: 't-red', x: 33, y: 47, w: 250, h: 130, r: '-6deg', dx: '14px', dy: '-24px', dr: '4deg', dur: 17, depth: 1 },
      { c: 't-sand2', x: 57, y: 71, w: 130, h: 150, r: '8deg', dx: '-16px', dy: '-20px', dr: '6deg', dur: 13, depth: 0, opt: 1 },
      { c: 't-teal2', x: 5, y: 62, w: 160, h: 115, r: '-18deg', dx: '20px', dy: '22px', dr: '-5deg', dur: 16, depth: 0, opt: 1 },
      { c: 't-dark', x: 89, y: 50, w: 180, h: 125, r: '16deg', dx: '-18px', dy: '18px', dr: '5deg', dur: 19, depth: 1, opt: 1 },
      { c: 't-teal', x: 10, y: 14, w: 120, h: 90, r: '10deg', dx: '12px', dy: '16px', dr: '-6deg', dur: 12, depth: 0, opt: 1 }
    ];
    var far = layer(30, -0.1);
    var near = layer(52, -0.16);
    tiles.forEach(function (t) {
      var n = el('tile ' + t.c + (t.opt ? ' opt' : ''), {
        left: t.x + '%', top: t.y + '%', width: t.w + 'px', height: t.h + 'px',
        '--r': t.r, '--dx': t.dx, '--dy': t.dy, '--dr': t.dr, '--dur': t.dur + 's',
        '--delay': -Math.random() * t.dur + 's'
      });
      (t.depth ? near : far).appendChild(n);
    });
    bg.appendChild(far);
    bg.appendChild(near);

    document.body.insertBefore(bg, document.body.firstChild);

    if (reduce) return;

    // Pointer parallax (smoothed) and scroll parallax
    var tx = 0, ty = 0, cx = 0, cy = 0, sy = 0, queued = false;
    window.addEventListener('pointermove', function (e) {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      kick();
    }, { passive: true });
    window.addEventListener('scroll', function () { sy = window.scrollY; kick(); }, { passive: true });

    function kick() { if (!queued) { queued = true; requestAnimationFrame(frame); } }
    function frame() {
      queued = false;
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      bg.style.setProperty('--px', cx.toFixed(3));
      bg.style.setProperty('--py', cy.toFixed(3));
      bg.style.setProperty('--sy', sy);
      if (Math.abs(tx - cx) > 0.003 || Math.abs(ty - cy) > 0.003) kick();
    }
  }

  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();
