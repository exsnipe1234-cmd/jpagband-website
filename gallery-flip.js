(function () {
  'use strict';

  document.querySelectorAll('.gallery-flip-card').forEach(function (card) {
    card.addEventListener('click', function () {
      var isFlipped = card.classList.toggle('is-flipped');
      card.setAttribute('aria-pressed', String(isFlipped));
    });
  });
})();
