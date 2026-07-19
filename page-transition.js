(function () {
  'use strict';

  var body = document.body;
  if (!body) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function showPage() {
    requestAnimationFrame(function () {
      body.classList.add('page-ready');
      body.classList.remove('page-leaving');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showPage, { once: true });
  } else {
    showPage();
  }

  window.addEventListener('pageshow', function () {
    body.classList.remove('page-leaving');
    body.classList.add('page-ready');
  });

  if (reduceMotion) return;

  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    var link = event.target.closest('a[href]');
    if (!link) return;
    if (link.target && link.target.toLowerCase() === '_blank') return;
    if (link.hasAttribute('download')) return;

    var rawHref = link.getAttribute('href');
    if (!rawHref || rawHref.charAt(0) === '#' || rawHref.indexOf('javascript:') === 0) return;

    var destination;
    try {
      destination = new URL(link.href, window.location.href);
    } catch (error) {
      return;
    }

    if (destination.origin !== window.location.origin) return;

    var current = new URL(window.location.href);
    var sameDocument = destination.pathname === current.pathname && destination.search === current.search;
    if (sameDocument) return;

    event.preventDefault();
    body.classList.remove('page-ready');
    body.classList.add('page-leaving');

    window.setTimeout(function () {
      window.location.href = destination.href;
    }, 330);
  });
})();
