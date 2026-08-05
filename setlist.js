(function () {
  'use strict';

  var setlist = [];
  var draggedIndex = null;
  var draggedSong = null;
  var searchForm = document.getElementById('song-search-form');
  var searchInput = document.getElementById('song-search');
  var searchStatus = document.getElementById('search-status');
  var searchResults = document.getElementById('search-results');
  var manualForm = document.getElementById('manual-song-form');
  var setlistItems = document.getElementById('setlist-items');
  var setlistCount = document.getElementById('setlist-count');
  var clearButton = document.getElementById('clear-setlist');
  var sendForm = document.getElementById('send-setlist-form');
  var sendButton = document.getElementById('send-setlist');
  var sendStatus = document.getElementById('send-status');
  var sendFallback = document.getElementById('send-fallback');
  var openGmail = document.getElementById('open-gmail');
  var copySetlist = document.getElementById('copy-setlist');
  var formOpenedAt = Date.now();
  var emailText = '';

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character];
    });
  }

  function addSong(song) {
    setlist.push(song);
    renderSetlist();
  }

  function syncSearchResultButtons() {
    if (!searchResults._tracks) return;
    searchResults.querySelectorAll('.add-song').forEach(function (button) {
      var track = searchResults._tracks[Number(button.dataset.resultIndex)];
      var isAdded = setlist.some(function (song) {
        return song.title === track.trackName && song.artist === track.artistName;
      });
      button.textContent = isAdded ? 'Added' : 'Add';
      button.disabled = isAdded;
    });
  }

  function renderSetlist() {
    setlistCount.textContent = setlist.length + (setlist.length === 1 ? ' song' : ' songs');
    clearButton.disabled = setlist.length === 0;
    sendButton.disabled = setlist.length === 0;
    syncSearchResultButtons();

    if (!setlist.length) {
      setlistItems.innerHTML = '<li class="setlist-empty">Your selected songs will appear here.</li>';
      return;
    }

    setlistItems.innerHTML = setlist.map(function (song, index) {
      var artwork = song.artwork ? '<img src="' + escapeHtml(song.artwork) + '" alt="" />' : '<span class="song-artwork-fallback" aria-hidden="true">&#9835;</span>';
      return '<li class="setlist-song" draggable="true" data-index="' + index + '">' +
        '<span class="song-position">' + (index + 1) + '</span>' +
        '<span class="song-artwork">' + artwork + '</span>' +
        '<span class="setlist-song-copy"><strong>' + escapeHtml(song.title) + '</strong><small>' + escapeHtml(song.artist || 'Artist not specified') + '</small></span>' +
        '<span class="song-controls">' +
          '<button type="button" class="song-move" data-action="up" aria-label="Move ' + escapeHtml(song.title) + ' up"' + (index === 0 ? ' disabled' : '') + '>&uarr;</button>' +
          '<button type="button" class="song-move" data-action="down" aria-label="Move ' + escapeHtml(song.title) + ' down"' + (index === setlist.length - 1 ? ' disabled' : '') + '>&darr;</button>' +
          '<button type="button" class="song-remove" data-action="remove" aria-label="Remove ' + escapeHtml(song.title) + '">&times;</button>' +
        '</span></li>';
    }).join('');
  }

  function renderResults(tracks) {
    if (!tracks.length) {
      searchResults.innerHTML = '';
      searchStatus.textContent = 'No songs found. Try another search or add a custom song below.';
      return;
    }

    searchStatus.textContent = tracks.length + ' songs found. Add the ones you would love to hear.';
    searchResults.innerHTML = tracks.map(function (track, index) {
      var artwork = track.artworkUrl100 ? '<img src="' + escapeHtml(track.artworkUrl100.replace('100x100bb', '200x200bb')) + '" alt="" />' : '<span class="song-artwork-fallback" aria-hidden="true">&#9835;</span>';
      return '<article class="search-result" draggable="true" data-result-index="' + index + '">' +
        '<span class="song-artwork">' + artwork + '</span>' +
        '<div><h3>' + escapeHtml(track.trackName) + '</h3><p>' + escapeHtml(track.artistName) + '</p></div>' +
        '<button class="add-song" type="button" data-result-index="' + index + '">Add</button>' +
      '</article>';
    }).join('');
    searchResults._tracks = tracks;
  }

  searchForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var term = searchInput.value.trim();
    if (!term) return;
    searchStatus.textContent = 'Searching the music catalogue...';
    searchResults.innerHTML = '';

    fetch('https://itunes.apple.com/search?country=SG&entity=song&limit=12&term=' + encodeURIComponent(term))
      .then(function (response) {
        if (!response.ok) throw new Error('Search unavailable');
        return response.json();
      })
      .then(function (data) { renderResults(data.results || []); })
      .catch(function () {
        searchStatus.textContent = 'The music search is unavailable right now. You can still add a custom song below.';
      });
  });

  searchResults.addEventListener('click', function (event) {
    var button = event.target.closest('.add-song');
    if (!button) return;
    var track = searchResults._tracks[Number(button.dataset.resultIndex)];
    addSong({ title: track.trackName, artist: track.artistName, artwork: track.artworkUrl100 || '' });
  });

  searchResults.addEventListener('dragstart', function (event) {
    var result = event.target.closest('.search-result');
    if (!result) return;
    var track = searchResults._tracks[Number(result.dataset.resultIndex)];
    draggedSong = { title: track.trackName, artist: track.artistName, artwork: track.artworkUrl100 || '' };
    result.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'copy';
  });

  searchResults.addEventListener('dragend', function () {
    draggedSong = null;
    document.querySelectorAll('.search-result.is-dragging').forEach(function (item) { item.classList.remove('is-dragging'); });
  });

  manualForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var title = document.getElementById('manual-title').value.trim();
    var artist = document.getElementById('manual-artist').value.trim();
    if (!title) return;
    addSong({ title: title, artist: artist, artwork: '' });
    manualForm.reset();
  });

  setlistItems.addEventListener('click', function (event) {
    var button = event.target.closest('[data-action]');
    if (!button) return;
    var item = button.closest('.setlist-song');
    var index = Number(item.dataset.index);
    if (button.dataset.action === 'remove') setlist.splice(index, 1);
    if (button.dataset.action === 'up' && index > 0) setlist.splice(index - 1, 0, setlist.splice(index, 1)[0]);
    if (button.dataset.action === 'down' && index < setlist.length - 1) setlist.splice(index + 1, 0, setlist.splice(index, 1)[0]);
    renderSetlist();
  });

  setlistItems.addEventListener('dragstart', function (event) {
    var item = event.target.closest('.setlist-song');
    if (!item) return;
    draggedIndex = Number(item.dataset.index);
    draggedSong = null;
    item.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
  });

  setlistItems.addEventListener('dragover', function (event) {
    if (draggedIndex === null && !draggedSong) return;
    event.preventDefault();
    var item = event.target.closest('.setlist-song');
    if (item) item.classList.add('is-drag-over');
  });

  setlistItems.addEventListener('dragleave', function (event) {
    var item = event.target.closest('.setlist-song');
    if (item) item.classList.remove('is-drag-over');
  });

  setlistItems.addEventListener('drop', function (event) {
    event.preventDefault();
    var item = event.target.closest('.setlist-song');
    if (draggedSong) {
      var targetIndex = item ? Number(item.dataset.index) : setlist.length;
      setlist.splice(targetIndex, 0, draggedSong);
    } else if (item && draggedIndex !== null) {
      var targetIndex = Number(item.dataset.index);
      setlist.splice(targetIndex, 0, setlist.splice(draggedIndex, 1)[0]);
    } else {
      return;
    }
    draggedIndex = null;
    draggedSong = null;
    renderSetlist();
  });

  setlistItems.addEventListener('dragend', function () {
    draggedIndex = null;
    draggedSong = null;
    document.querySelectorAll('.is-dragging, .is-drag-over').forEach(function (item) { item.classList.remove('is-dragging', 'is-drag-over'); });
  });

  clearButton.addEventListener('click', function () {
    setlist = [];
    renderSetlist();
  });

  sendForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!setlist.length) return;
    if (document.getElementById('setlist-website').value || Date.now() - formOpenedAt < 3000) {
      sendStatus.textContent = 'Please wait a moment, then try again.';
      return;
    }
    var name = document.getElementById('setlist-name').value.trim();
    var greeting = name ? 'Hi J.P.A.G,\n\nI am ' + name + ' and here is my suggested setlist:' : 'Hi J.P.A.G,\n\nHere is my suggested setlist:';
    var songs = setlist.map(function (song, index) { return (index + 1) + '. ' + song.title + (song.artist ? ' - ' + song.artist : ''); }).join('\n');
    var subject = 'My J.P.A.G setlist suggestion';
    emailText = greeting + '\n\n' + songs + '\n\nThank you!';
    openGmail.href = 'https://mail.google.com/mail/?view=cm&fs=1&to=thejpagband@gmail.com&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(emailText);
    sendFallback.hidden = false;
    sendStatus.textContent = 'Opening your email app. If nothing appears, use an option below.';
    window.location.href = 'mailto:thejpagband@gmail.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(emailText);
  });

  copySetlist.addEventListener('click', function () {
    if (!emailText || !navigator.clipboard) {
      sendStatus.textContent = 'Copying is unavailable in this browser. Use Open Gmail instead.';
      return;
    }
    navigator.clipboard.writeText(emailText).then(function () {
      sendStatus.textContent = 'Setlist copied. You can paste it into any email app.';
    }).catch(function () {
      sendStatus.textContent = 'Copying is unavailable in this browser. Use Open Gmail instead.';
    });
  });
})();
