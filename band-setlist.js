const storageKey = 'jpag-private-band-setlist-v1';
const catalogRevisionKey = 'jpag-private-band-catalog-revision';
const artworkStorageKey = 'jpag-private-band-artwork-v1';
const catalogRevision = 'song-key-artist-v1';
const $ = (id) => document.getElementById(id);
const songIdentity = (song) => song.title.toLowerCase().replace(/[^a-z0-9]/g, '');

const importedSongs = window.EXCEL_SONGS || [];
const savedState = JSON.parse(localStorage.getItem(storageKey));
let state = savedState || {
  songs: importedSongs,
  setlist: [], showName: '', showDate: '', targetMinutes: ''
};
let libraryView = 'approved';
let dragPayload = null;
let artworkLookupRunning = false;
let editingSongId = null;

if (savedState && localStorage.getItem(catalogRevisionKey) !== catalogRevision) {
  const previousSongs = new Map(state.songs.map(song => [songIdentity(song), song]));
  const previousSongsById = new Map(state.songs.map(song => [song.id, song]));
  const importedByTitle = new Map(importedSongs.map(song => [songIdentity(song), song]));
  const customSongs = state.songs.filter(song => Number(song.id) > 1000000);
  state.songs = [
    ...importedSongs.map(song => ({ ...song, duration: previousSongs.get(songIdentity(song))?.duration || song.duration })),
    ...customSongs
  ];
  state.setlist = state.setlist.map(item => {
    if (item.type !== 'song') return item;
    const oldSong = previousSongsById.get(item.songId);
    const importedSong = oldSong && importedByTitle.get(songIdentity(oldSong));
    return importedSong ? { ...item, songId: importedSong.id } : customSongs.some(song => song.id === item.songId) ? item : null;
  }).filter(Boolean);
  localStorage.setItem(catalogRevisionKey, catalogRevision);
}

if (savedState) {
  const importedDetails = new Map(importedSongs.map(song => [songIdentity(song), song]));
  state.songs.forEach(song => {
    const importedSong = importedDetails.get(songIdentity(song));
    if (!importedSong) return;
    if (!song.duration) song.duration = importedSong.duration;
    song.approved = importedSong.approved;
  });
  localStorage.setItem(storageKey, JSON.stringify(state));
}

const savedArtwork = JSON.parse(localStorage.getItem(artworkStorageKey)) || {};
state.songs.forEach(song => {
  if (savedArtwork[songIdentity(song)]) song.artwork = savedArtwork[songIdentity(song)];
});

function save() {
  state.showName = $('show-name').value;
  state.showDate = $('show-date').value;
  state.targetMinutes = $('target-minutes').value;
  localStorage.setItem(storageKey, JSON.stringify(state));
  localStorage.setItem(artworkStorageKey, JSON.stringify(Object.fromEntries(state.songs.filter(song => song.artwork).map(song => [songIdentity(song), song.artwork]))));
  $('autosave-status').textContent = 'Saved locally';
}

function seconds(duration) {
  const match = /^(\d+):(\d{1,2})$/.exec(duration || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function formattedTime(total) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function render() {
  const filter = $('library-search').value.toLowerCase().trim();
  const library = $('song-library');
  library.innerHTML = '';
  const approvedSongs = state.songs.filter(song => song.approved !== false);
  const missingDurationSongs = state.songs.filter(song => !song.duration);
  const visibleSongs = state.songs.filter(song => {
    const matchesSearch = `${song.title} ${song.artist} ${song.key} ${song.performer || ''}`.toLowerCase().includes(filter);
    const matchesView = libraryView === 'approved' ? song.approved !== false : libraryView === 'missing-duration' ? !song.duration : true;
    return matchesSearch && matchesView;
  });
  $('approved-count').textContent = approvedSongs.length;
  $('missing-duration-count').textContent = missingDurationSongs.length;
  ['approved', 'all', 'missing-duration'].forEach(view => {
    const button = $(`show-${view}`);
    const active = libraryView === view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active);
  });
  visibleSongs.forEach(song => {
    const card = $('song-card-template').content.cloneNode(true);
    card.querySelector('h3').textContent = song.title;
    card.querySelector('.artist').textContent = song.artist || 'No artist listed';
    if (song.artwork) {
      const artwork = card.querySelector('.song-artwork img');
      artwork.src = song.artwork;
      artwork.hidden = false;
      card.querySelector('.song-artwork span').hidden = true;
    }
    const meta = card.querySelector('.song-meta');
    [song.key, song.duration, song.tempo && `${song.tempo} BPM`, song.performer].filter(Boolean).forEach(value => { const tag = document.createElement('span'); tag.textContent = value; meta.append(tag); });
    if (song.approved !== false) { const tag = document.createElement('span'); tag.className = 'approved-tag'; tag.textContent = 'APPROVED'; meta.append(tag); }
    card.querySelector('.add-song').onclick = () => { state.setlist.push({ type: 'song', songId: song.id }); save(); render(); };
    card.querySelector('.edit-song').onclick = () => editSong(song);
    card.querySelector('.delete-song').onclick = () => { if (confirm(`Delete "${song.title}" from your library?`)) { state.songs = state.songs.filter(item => item.id !== song.id); state.setlist = state.setlist.filter(item => item.songId !== song.id); save(); render(); } };
    const durationButton = card.querySelector('.duration-button');
    if (!song.duration) durationButton.hidden = false;
    durationButton.onclick = () => {
      const duration = prompt(`Official duration for "${song.title}" (m:ss):`, song.duration || '');
      if (duration === null) return;
      if (!/^\d+:\d{1,2}$/.test(duration.trim())) { alert('Use minutes:seconds, for example 3:45.'); return; }
      song.duration = duration.trim(); save(); render();
    };
    enableLibraryDrag(card.querySelector('.song-card'), song.id);
    library.append(card);
  });

  const list = $('setlist'); list.innerHTML = '';
  list.ondragover = event => event.preventDefault();
  list.ondrop = event => {
    event.preventDefault();
    if (dragPayload?.type !== 'library') return;
    state.setlist.push({ type: 'song', songId: dragPayload.songId }); save(); render();
  };
  let number = 0, duration = 0, breaks = 0;
  state.setlist.forEach((item, index) => {
    if (item.type === 'break') {
      breaks++; const row = document.createElement('li'); row.className = 'break-item'; row.innerHTML = `<span>SET BREAK</span><span class="drag-handle" title="Drag to reorder">DRAG</span><button aria-label="Remove set break" title="Remove break">x</button>`; row.querySelector('button').onclick = () => removeItem(index); enableDrag(row, index); list.append(row); return;
    }
    const song = state.songs.find(entry => entry.id === item.songId); if (!song) return;
    number++; duration += seconds(song.duration);
    const row = document.createElement('li'); row.className = 'set-item';
    row.innerHTML = `<span class="track-number">${String(number).padStart(2, '0')}</span><div><h3></h3><p></p><div class="item-tags"></div>${song.notes ? '<p class="set-notes"></p>' : ''}</div><div class="item-actions"><span class="drag-handle" title="Drag to reorder">DRAG</span><button class="up" title="Move up">&#8593;</button><button class="down" title="Move down">&#8595;</button><button class="remove" title="Remove">x</button></div>`;
    row.querySelector('h3').textContent = song.title; row.querySelector('p').textContent = song.performer || song.artist || 'Original';
    [song.key, song.duration, song.tempo && `${song.tempo} BPM`, song.performer].filter(Boolean).forEach(value => { const tag = document.createElement('span'); tag.textContent = value; row.querySelector('.item-tags').append(tag); });
    if (song.notes) row.querySelector('.set-notes').textContent = song.notes;
    row.querySelector('.up').onclick = () => moveItem(index, -1); row.querySelector('.down').onclick = () => moveItem(index, 1); row.querySelector('.remove').onclick = () => removeItem(index); enableDrag(row, index); list.append(row);
  });
  $('empty-setlist').hidden = state.setlist.length > 0;
  const targetSeconds = Number(state.targetMinutes || 0) * 60;
  const remaining = targetSeconds - duration;
  $('song-count').textContent = number; $('total-time').textContent = formattedTime(duration);
  $('time-remaining').textContent = targetSeconds ? formattedTime(Math.abs(remaining)) : '--';
  $('time-remaining-label').textContent = targetSeconds ? remaining < 0 ? 'OVER TARGET' : 'TIME LEFT' : 'SET A TARGET';
  $('time-remaining').classList.toggle('is-over', targetSeconds && remaining < 0);
  $('setlist-title').textContent = state.showName || 'Untitled set';
}

function moveItem(index, direction) {
  const target = index + direction; if (target < 0 || target >= state.setlist.length) return;
  [state.setlist[index], state.setlist[target]] = [state.setlist[target], state.setlist[index]]; save(); render();
}
function removeItem(index) { state.setlist.splice(index, 1); save(); render(); }
function resetSongForm() {
  editingSongId = null;
  ['song-title','song-artist','song-key','song-duration','song-tempo','song-performer','song-notes'].forEach(id => { $(id).value = ''; });
  $('save-song').textContent = 'Add song';
}
function editSong(song) {
  editingSongId = song.id;
  $('song-title').value = song.title;
  $('song-artist').value = song.artist || '';
  $('song-key').value = song.key || '';
  $('song-duration').value = song.duration || '';
  $('song-tempo').value = song.tempo || '';
  $('song-performer').value = song.performer || '';
  $('song-notes').value = song.notes || '';
  $('save-song').textContent = 'Save changes';
  $('song-form').hidden = false;
  $('song-title').focus();
}
function enableLibraryDrag(card, songId) {
  card.draggable = true;
  card.ondragstart = () => { dragPayload = { type: 'library', songId }; card.classList.add('is-dragging'); };
  card.ondragend = () => { dragPayload = null; card.classList.remove('is-dragging'); document.querySelectorAll('.is-drag-over').forEach(item => item.classList.remove('is-drag-over')); };
}
function enableDrag(row, index) {
  row.draggable = true;
  row.ondragstart = () => { dragPayload = { type: 'setlist', index }; row.classList.add('is-dragging'); };
  row.ondragend = () => { dragPayload = null; row.classList.remove('is-dragging'); document.querySelectorAll('.is-drag-over').forEach(item => item.classList.remove('is-drag-over')); };
  row.ondragover = event => { event.preventDefault(); if (dragPayload && (dragPayload.type !== 'setlist' || dragPayload.index !== index)) row.classList.add('is-drag-over'); };
  row.ondragleave = () => row.classList.remove('is-drag-over');
  row.ondrop = event => { event.preventDefault(); event.stopPropagation(); row.classList.remove('is-drag-over'); if (!dragPayload) return; if (dragPayload.type === 'library') { state.setlist.splice(index, 0, { type: 'song', songId: dragPayload.songId }); save(); render(); return; } if (dragPayload.index === index) return; const [item] = state.setlist.splice(dragPayload.index, 1); state.setlist.splice(dragPayload.index < index ? index - 1 : index, 0, item); save(); render(); };
}
function renderCatalogueResults(tracks) {
  const results = $('catalogue-results');
  results.innerHTML = '';
  tracks.forEach(track => {
    const row = document.createElement('article');
    row.className = 'catalogue-result';
    const artwork = document.createElement('div'); artwork.className = 'song-artwork';
    if (track.artworkUrl100) { const image = document.createElement('img'); image.src = track.artworkUrl100.replace('100x100bb', '200x200bb'); image.alt = ''; artwork.append(image); } else artwork.textContent = 'NOTE';
    const copy = document.createElement('div'); const title = document.createElement('h3'); const artist = document.createElement('p'); title.textContent = track.trackName; artist.textContent = track.artistName; copy.append(title, artist);
    const add = document.createElement('button'); add.type = 'button'; add.textContent = 'Add'; add.onclick = () => {
      const existingSong = state.songs.find(song => songIdentity(song) === songIdentity({ title: track.trackName }));
      const artworkUrl = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '200x200bb') : '';
      if (existingSong) { existingSong.artwork = artworkUrl; $('catalogue-status').textContent = `Artwork added to ${existingSong.title}.`; }
      else { state.songs.push({ id: Date.now(), title: track.trackName, artist: '', key: '', duration: track.trackTimeMillis ? formattedTime(Math.round(track.trackTimeMillis / 1000)) : '', tempo: '', performer: '', notes: '', artwork: artworkUrl, approved: true }); $('catalogue-status').textContent = `${track.trackName} added to your library.`; }
      save(); render();
    };
    row.append(artwork, copy, add); results.append(row);
  });
}
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function addApprovedArtwork() {
  if (artworkLookupRunning) return;
  const songs = state.songs.filter(song => song.approved !== false && !song.artwork);
  if (!songs.length) { $('artwork-status').textContent = 'Every approved song already has cover art.'; return; }
  artworkLookupRunning = true;
  $('auto-artwork').disabled = true;
  let matched = 0;
  for (let index = 0; index < songs.length; index++) {
    const song = songs[index];
    $('artwork-status').textContent = `Finding cover ${index + 1} of ${songs.length}: ${song.title}`;
    try {
      const response = await fetch(`https://itunes.apple.com/search?country=SG&entity=song&limit=5&term=${encodeURIComponent(song.title)}`);
      if (!response.ok) throw new Error('Search unavailable');
      const data = await response.json();
      const track = (data.results || []).find(result => songIdentity({ title: result.trackName }) === songIdentity(song) && result.artworkUrl100);
      if (track) { song.artwork = track.artworkUrl100.replace('100x100bb', '200x200bb'); matched++; save(); }
    } catch (_) {
      // Leave unmatched artwork blank so it can be found manually through catalogue search.
    }
    await pause(1300);
  }
  artworkLookupRunning = false;
  $('auto-artwork').disabled = false;
  $('artwork-status').textContent = `Added ${matched} cover${matched === 1 ? '' : 's'}. Search any remaining song manually to attach its artwork.`;
  render();
}

$('open-song-form').onclick = () => { resetSongForm(); $('song-form').hidden = false; $('song-title').focus(); };
$('cancel-song').onclick = () => { resetSongForm(); $('song-form').hidden = true; };
$('save-song').onclick = () => {
  const title = $('song-title').value.trim(); if (!title) { $('song-title').focus(); return; }
  const duration = $('song-duration').value.trim();
  if (duration && !/^\d+:\d{1,2}$/.test(duration)) { alert('Use minutes:seconds for duration, for example 3:45.'); return; }
  const details = { title, artist: $('song-artist').value.trim(), key: $('song-key').value.trim(), duration, tempo: $('song-tempo').value, performer: $('song-performer').value.trim(), notes: $('song-notes').value.trim() };
  const editingSong = state.songs.find(song => song.id === editingSongId);
  if (editingSong) Object.assign(editingSong, details);
  else state.songs.push({ id: Date.now(), ...details, approved: true });
  resetSongForm(); $('song-form').hidden = true; save(); render();
};
$('library-search').oninput = render;
$('catalogue-search-form').onsubmit = event => {
  event.preventDefault();
  const term = $('catalogue-search').value.trim();
  if (!term) return;
  $('catalogue-status').textContent = 'Searching the music catalogue...';
  $('catalogue-results').innerHTML = '';
  fetch(`https://itunes.apple.com/search?country=SG&entity=song&limit=8&term=${encodeURIComponent(term)}`)
    .then(response => { if (!response.ok) throw new Error('Search unavailable'); return response.json(); })
    .then(data => { const tracks = data.results || []; $('catalogue-status').textContent = tracks.length ? `${tracks.length} songs found. Add one to keep its artwork.` : 'No songs found. Try another search.'; renderCatalogueResults(tracks); })
    .catch(() => { $('catalogue-status').textContent = 'Online search is unavailable. Your saved library still works offline.'; });
};
$('auto-artwork').onclick = addApprovedArtwork;
['approved', 'all', 'missing-duration'].forEach(view => { $(`show-${view}`).onclick = () => { libraryView = view; render(); }; });
['show-name','show-date','target-minutes'].forEach(id => $(id).oninput = () => { save(); render(); });
$('add-break').onclick = () => { state.setlist.push({ type: 'break' }); save(); render(); };
$('clear-setlist').onclick = () => { if (state.setlist.length && confirm('Clear every song from this setlist? Your library will remain.')) { state.setlist = []; save(); render(); } };
['dragover', 'drop'].forEach(eventName => $('empty-setlist').addEventListener(eventName, event => {
  event.preventDefault();
  if (eventName === 'dragover' && dragPayload?.type === 'library') $('empty-setlist').classList.add('is-drag-over');
  if (eventName === 'drop' && dragPayload?.type === 'library') { $('empty-setlist').classList.remove('is-drag-over'); state.setlist.push({ type: 'song', songId: dragPayload.songId }); save(); render(); }
}));
const templates = {
  busking: { name: 'Busking Set', minutes: 60, breaks: 0 },
  wedding: { name: 'Wedding Reception', minutes: 90, breaks: 1 },
  bar: { name: 'Bar Set', minutes: 120, breaks: 2 },
  mall: { name: 'Mall Set', minutes: 45, breaks: 0 }
};
document.querySelectorAll('.template-button').forEach(button => button.onclick = () => {
  const template = templates[button.dataset.template];
  if (state.setlist.length && !confirm(`Apply the ${button.textContent} template? This clears the current setlist.`)) return;
  state.showName = template.name; state.targetMinutes = template.minutes; state.setlist = Array.from({ length: template.breaks }, () => ({ type: 'break' }));
  $('show-name').value = state.showName; $('target-minutes').value = state.targetMinutes; save(); render();
});
$('export-setlist').onclick = () => {
  const lines = [`${state.showName || 'Untitled set'}${state.showDate ? ` - ${state.showDate}` : ''}`, '']; let number = 0;
  state.setlist.forEach(item => { if (item.type === 'break') { lines.push('--- SET BREAK ---'); return; } const song = state.songs.find(entry => entry.id === item.songId); if (song) { number++; lines.push(`${number}. ${song.title}${song.artist ? ` - ${song.artist}` : ''}${song.key ? ` [${song.key}]` : ''}${song.duration ? ` (${song.duration})` : ''}`); } });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${(state.showName || 'setlist').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.txt`; link.click(); URL.revokeObjectURL(link.href);
};

$('show-name').value = state.showName; $('show-date').value = state.showDate; $('target-minutes').value = state.targetMinutes || ''; render();
