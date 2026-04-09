'use strict';

// --- State ---
let allVideos = [];
let filteredVideos = [];
let selectedPaths = new Set();
let favorites = new Set();
let currentFolder = null;
let currentView = 'list'; // 'list' | 'grid'
let thumbnailCache = {};
let currentPlayerIndex = -1;

// --- DOM refs ---
const btnSelectFolder = document.getElementById('btn-select-folder');
const folderPathEl = document.getElementById('folder-path');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const filterQuality = document.getElementById('filter-quality');
const filterExt = document.getElementById('filter-ext');
const filterFavorites = document.getElementById('filter-favorites');
const btnDuplicates = document.getElementById('btn-duplicates');
const btnViewList = document.getElementById('btn-view-list');
const btnViewGrid = document.getElementById('btn-view-grid');
const selectedCountEl = document.getElementById('selected-count');
const btnRenameUuid = document.getElementById('btn-rename-uuid');
const btnDelete = document.getElementById('btn-delete');
const btnSelectAll = document.getElementById('btn-select-all');
const btnDeselectAll = document.getElementById('btn-deselect-all');
const statusMsg = document.getElementById('status-msg');
const videoListEl = document.getElementById('video-list');
const videoGridEl = document.getElementById('video-grid');
const loadingEl = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');

// Player
const playerModal = document.getElementById('player-modal');
const playerBackdrop = document.getElementById('player-backdrop');
const playerTitle = document.getElementById('player-title');
const playerClose = document.getElementById('player-close');
const videoPlayer = document.getElementById('video-player');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const playerIndex = document.getElementById('player-index');

// Duplicates
const duplicatesModal = document.getElementById('duplicates-modal');
const dupBackdrop = document.getElementById('dup-backdrop');
const dupClose = document.getElementById('dup-close');
const dupContent = document.getElementById('dup-content');

// --- Init ---
async function init() {
  const favs = await window.api.getFavorites();
  favorites = new Set(favs);
}
init();

// --- Folder selection ---
btnSelectFolder.addEventListener('click', async () => {
  const folder = await window.api.selectFolder();
  if (!folder) return;
  currentFolder = folder;
  folderPathEl.textContent = folder;
  await window.api.unwatchFolder();
  await loadVideos();
  await window.api.watchFolder(folder);
});

async function loadVideos() {
  showLoading('Scanning videos...');
  selectedPaths.clear();
  thumbnailCache = {};
  try {
    allVideos = await window.api.scanFolder(currentFolder);
    applyFiltersAndRender();
  } catch (e) {
    setStatus('Error scanning folder: ' + e.message);
  }
  hideLoading();
}

// Auto-refresh
window.api.onFolderChanged(() => {
  if (currentFolder) loadVideos();
});

// --- Filters & Sort ---
function applyFiltersAndRender() {
  const search = searchInput.value.toLowerCase();
  const quality = filterQuality.value;
  const ext = filterExt.value;
  const favOnly = filterFavorites.value === 'favorites';
  const sort = sortSelect.value;

  filteredVideos = allVideos.filter(v => {
    if (search && !v.name.toLowerCase().includes(search)) return false;
    if (quality !== 'all' && v.quality !== quality) return false;
    if (ext !== 'all' && v.ext !== ext) return false;
    if (favOnly && !favorites.has(v.path)) return false;
    return true;
  });

  filteredVideos.sort((a, b) => {
    switch (sort) {
      case 'name': return a.name.localeCompare(b.name);
      case 'size': return b.size - a.size;
      case 'duration': return b.duration - a.duration;
      case 'quality': return qualityRank(b.quality) - qualityRank(a.quality);
      case 'ext': return a.ext.localeCompare(b.ext);
      default: return 0;
    }
  });

  renderList();
  renderGrid();
  updateActionBar();
}

function qualityRank(q) {
  return { '4K': 4, '1080p': 3, '720p': 2, '480p': 1, 'SD': 0, 'Unknown': -1 }[q] ?? -1;
}

[searchInput, sortSelect, filterQuality, filterExt, filterFavorites].forEach(el => {
  el.addEventListener('change', applyFiltersAndRender);
});
searchInput.addEventListener('input', applyFiltersAndRender);

// --- List View ---
function renderList() {
  videoListEl.innerHTML = '';
  if (filteredVideos.length === 0) {
    videoListEl.innerHTML = '<div class="empty-msg">No videos found.</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'video-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th><input type="checkbox" id="check-all-list" /></th>
        <th>Name</th>
        <th>Quality</th>
        <th>Resolution</th>
        <th>Duration</th>
        <th>Size</th>
        <th>Type</th>
        <th>Fav</th>
        <th>Play</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement('tbody');

  filteredVideos.forEach((v, i) => {
    const tr = document.createElement('tr');
    tr.className = selectedPaths.has(v.path) ? 'selected' : '';
    tr.dataset.path = v.path;

    tr.innerHTML = `
      <td><input type="checkbox" class="row-check" data-path="${v.path}" ${selectedPaths.has(v.path) ? 'checked' : ''} /></td>
      <td class="name-cell" title="${v.path}">${v.name}</td>
      <td><span class="badge badge-${v.quality}">${v.quality}</span></td>
      <td>${v.width && v.height ? v.width + 'x' + v.height : '-'}</td>
      <td>${formatDuration(v.duration)}</td>
      <td>${formatSize(v.size)}</td>
      <td>${v.ext}</td>
      <td><button class="fav-btn ${favorites.has(v.path) ? 'fav-active' : ''}" data-path="${v.path}">★</button></td>
      <td><button class="play-btn" data-index="${i}">▶</button></td>
    `;

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  videoListEl.appendChild(table);

  // Check-all
  document.getElementById('check-all-list').addEventListener('change', (e) => {
    if (e.target.checked) filteredVideos.forEach(v => selectedPaths.add(v.path));
    else filteredVideos.forEach(v => selectedPaths.delete(v.path));
    applyFiltersAndRender();
  });

  // Row checkboxes
  videoListEl.querySelectorAll('.row-check').forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      const p = e.target.dataset.path;
      if (e.target.checked) selectedPaths.add(p);
      else selectedPaths.delete(p);
      updateActionBar();
      const row = e.target.closest('tr');
      row.className = selectedPaths.has(p) ? 'selected' : '';
    });
  });

  // Row click to select
  videoListEl.querySelectorAll('tbody tr').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      const p = tr.dataset.path;
      if (selectedPaths.has(p)) selectedPaths.delete(p);
      else selectedPaths.add(p);
      tr.className = selectedPaths.has(p) ? 'selected' : '';
      tr.querySelector('.row-check').checked = selectedPaths.has(p);
      updateActionBar();
    });
  });

  // Play buttons
  videoListEl.querySelectorAll('.play-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPlayer(parseInt(btn.dataset.index));
    });
  });

  // Favorite buttons
  videoListEl.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(btn.dataset.path);
    });
  });
}

// --- Grid View ---
function renderGrid() {
  videoGridEl.innerHTML = '';
  if (filteredVideos.length === 0) return;

  filteredVideos.forEach((v, i) => {
    const card = document.createElement('div');
    card.className = 'grid-card' + (selectedPaths.has(v.path) ? ' selected' : '');
    card.dataset.path = v.path;

    card.innerHTML = `
      <div class="grid-thumb-wrap">
        <img class="grid-thumb" src="" data-path="${v.path}" alt="thumbnail" />
        <div class="grid-play-overlay" data-index="${i}">▶</div>
        <div class="grid-fav-btn ${favorites.has(v.path) ? 'fav-active' : ''}" data-path="${v.path}">★</div>
      </div>
      <div class="grid-info">
        <div class="grid-name" title="${v.path}">${v.name}</div>
        <div class="grid-meta">
          <span class="badge badge-${v.quality}">${v.quality}</span>
          <span>${formatDuration(v.duration)}</span>
          <span>${formatSize(v.size)}</span>
        </div>
      </div>
    `;

    videoGridEl.appendChild(card);

    // Load thumbnail lazily
    loadThumbnail(v.path, card.querySelector('.grid-thumb'));

    // Card click = select/deselect
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('grid-play-overlay') ||
          e.target.classList.contains('grid-fav-btn')) return;
      const p = card.dataset.path;
      if (selectedPaths.has(p)) selectedPaths.delete(p);
      else selectedPaths.add(p);
      card.classList.toggle('selected', selectedPaths.has(p));
      updateActionBar();
    });

    // Play overlay click
    card.querySelector('.grid-play-overlay').addEventListener('click', (e) => {
      e.stopPropagation();
      openPlayer(parseInt(e.target.dataset.index));
    });

    // Fav button
    card.querySelector('.grid-fav-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(e.target.dataset.path);
    });
  });
}

async function loadThumbnail(filePath, imgEl) {
  if (thumbnailCache[filePath]) {
    imgEl.src = thumbnailCache[filePath];
    return;
  }
  const data = await window.api.getThumbnail(filePath);
  if (data) {
    thumbnailCache[filePath] = data;
    imgEl.src = data;
  } else {
    imgEl.src = '';
    imgEl.classList.add('no-thumb');
  }
}

// --- View toggle ---
btnViewList.addEventListener('click', () => {
  currentView = 'list';
  videoListEl.classList.remove('hidden');
  videoGridEl.classList.add('hidden');
  btnViewList.classList.add('active');
  btnViewGrid.classList.remove('active');
});

btnViewGrid.addEventListener('click', () => {
  currentView = 'grid';
  videoGridEl.classList.remove('hidden');
  videoListEl.classList.add('hidden');
  btnViewGrid.classList.add('active');
  btnViewList.classList.remove('active');
});

// --- Select all / deselect ---
btnSelectAll.addEventListener('click', () => {
  filteredVideos.forEach(v => selectedPaths.add(v.path));
  applyFiltersAndRender();
});
btnDeselectAll.addEventListener('click', () => {
  selectedPaths.clear();
  applyFiltersAndRender();
});

// --- Action bar ---
function updateActionBar() {
  const count = selectedPaths.size;
  selectedCountEl.textContent = `${count} selected`;
  btnRenameUuid.disabled = count === 0;
  btnDelete.disabled = count === 0;
}

// --- Rename to UUID ---
btnRenameUuid.addEventListener('click', async () => {
  if (selectedPaths.size === 0) return;
  const confirm = window.confirm(`Rename ${selectedPaths.size} file(s) to UUID? This cannot be undone.`);
  if (!confirm) return;
  showLoading('Renaming files...');
  const results = await window.api.renameToUuid([...selectedPaths]);
  selectedPaths.clear();
  // Update favorites for renamed files
  results.forEach(r => {
    if (r.success && favorites.has(r.old)) {
      favorites.delete(r.old);
      favorites.add(r.new);
    }
  });
  await saveFavorites();
  await loadVideos();
  hideLoading();
  const failed = results.filter(r => !r.success).length;
  setStatus(`Renamed ${results.length - failed} file(s).${failed ? ` ${failed} failed.` : ''}`);
});

// --- Delete ---
btnDelete.addEventListener('click', async () => {
  if (selectedPaths.size === 0) return;
  const confirm = window.confirm(`Delete ${selectedPaths.size} file(s)? This cannot be undone.`);
  if (!confirm) return;
  showLoading('Deleting files...');
  const results = await window.api.deleteFiles([...selectedPaths]);
  selectedPaths.clear();
  await loadVideos();
  hideLoading();
  const failed = results.filter(r => !r.success).length;
  setStatus(`Deleted ${results.length - failed} file(s).${failed ? ` ${failed} failed.` : ''}`);
});

// --- Favorites ---
async function toggleFavorite(filePath) {
  if (favorites.has(filePath)) favorites.delete(filePath);
  else favorites.add(filePath);
  await saveFavorites();
  applyFiltersAndRender();
}

async function saveFavorites() {
  await window.api.setFavorites([...favorites]);
}

// --- Duplicates ---
btnDuplicates.addEventListener('click', async () => {
  const groups = await window.api.findDuplicates(allVideos);
  dupContent.innerHTML = '';
  if (groups.length === 0) {
    dupContent.innerHTML = '<p class="empty-msg">No duplicates found.</p>';
  } else {
    groups.forEach((group, gi) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'dup-group';
      groupEl.innerHTML = `<div class="dup-group-title">Group ${gi + 1} — ${group.length} files (${formatSize(group[0].size)}, ${formatDuration(group[0].duration)})</div>`;
      group.forEach(v => {
        const item = document.createElement('div');
        item.className = 'dup-item';
        item.innerHTML = `<span class="dup-path" title="${v.path}">${v.path}</span>`;
        groupEl.appendChild(item);
      });
      dupContent.appendChild(groupEl);
    });
  }
  duplicatesModal.classList.remove('hidden');
});

dupClose.addEventListener('click', () => duplicatesModal.classList.add('hidden'));
dupBackdrop.addEventListener('click', () => duplicatesModal.classList.add('hidden'));

// --- Video Player ---
function openPlayer(index) {
  currentPlayerIndex = index;
  playVideo(index);
  playerModal.classList.remove('hidden');
}

function playVideo(index) {
  const v = filteredVideos[index];
  if (!v) return;
  videoPlayer.src = v.path;
  playerTitle.textContent = v.name;
  playerIndex.textContent = `${index + 1} / ${filteredVideos.length}`;
  btnPrev.disabled = index === 0;
  btnNext.disabled = index === filteredVideos.length - 1;
  videoPlayer.play();
}

function closePlayer() {
  videoPlayer.pause();
  videoPlayer.src = '';
  playerModal.classList.add('hidden');
}

playerClose.addEventListener('click', closePlayer);
playerBackdrop.addEventListener('click', closePlayer);

btnPrev.addEventListener('click', () => {
  if (currentPlayerIndex > 0) {
    currentPlayerIndex--;
    playVideo(currentPlayerIndex);
  }
});

btnNext.addEventListener('click', () => {
  if (currentPlayerIndex < filteredVideos.length - 1) {
    currentPlayerIndex++;
    playVideo(currentPlayerIndex);
  }
});

document.addEventListener('keydown', (e) => {
  if (playerModal.classList.contains('hidden')) return;
  if (e.key === 'Escape') closePlayer();
  if (e.key === 'ArrowLeft') btnPrev.click();
  if (e.key === 'ArrowRight') btnNext.click();
});

// --- Helpers ---
function formatDuration(secs) {
  if (!secs) return '-';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatSize(bytes) {
  if (!bytes) return '-';
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  return (bytes / 1e3).toFixed(0) + ' KB';
}

function showLoading(msg) {
  loadingText.textContent = msg || 'Loading...';
  loadingEl.classList.remove('hidden');
}

function hideLoading() {
  loadingEl.classList.add('hidden');
}

function setStatus(msg) {
  statusMsg.textContent = msg;
  setTimeout(() => { statusMsg.textContent = ''; }, 4000);
}
