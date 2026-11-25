// Hamburger menu: opens the drawer (site pages) or the sidebar (app pages on small screens).
(function () {
  var body = document.body;
  function set(open) {
    body.classList.toggle('nav-open', open);
    var t = document.querySelectorAll('[data-nav-toggle]');
    for (var i = 0; i < t.length; i++) {
      t[i].setAttribute('aria-expanded', open ? 'true' : 'false');
      t[i].setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-nav-toggle]')) { set(!body.classList.contains('nav-open')); return; }
    if (e.target.closest('[data-nav-close]')) { set(false); return; }
    if (body.classList.contains('nav-open') && e.target.closest('.drawer a, .side a')) set(false);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  window.addEventListener('resize', function () { if (window.innerWidth > 860) set(false); });
})();
