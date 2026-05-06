'use strict';

// --- State ---
let allVideos = [];
let filteredVideos = [];
let selectedPaths = new Set();
let favorites = new Set();
let currentFolder = null;
let currentView = 'list'; // 'list' | 'grid'
let thumbnailCache = {};  // in-memory cache (path -> base64)
let currentPlayerIndex = -1;
let isOperationInProgress = false; // flag to suppress fs.watch during bulk ops

// --- Debounce utility ---
function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, delay);
  };
}

// --- Thumbnail concurrency queue ---
const THUMB_CONCURRENCY = 5;
let thumbActiveCount = 0;
const thumbQueue = [];

function enqueueThumbnail(filePath, imgEl) {
  // Already in memory cache
  if (thumbnailCache[filePath]) {
    imgEl.src = thumbnailCache[filePath];
    return;
  }
  thumbQueue.push({ filePath, imgEl });
  drainThumbQueue();
}

function drainThumbQueue() {
  while (thumbActiveCount < THUMB_CONCURRENCY && thumbQueue.length > 0) {
    const { filePath, imgEl } = thumbQueue.shift();
    // Skip if img element is no longer in the DOM (card was re-rendered)
    if (!imgEl.isConnected) { drainThumbQueue(); return; }
    thumbActiveCount++;
    window.api.getThumbnail(filePath).then(data => {
      thumbActiveCount--;
      if (data) {
        thumbnailCache[filePath] = data;
        if (imgEl.isConnected) imgEl.src = data;
      } else {
        if (imgEl.isConnected) imgEl.classList.add('no-thumb');
      }
      drainThumbQueue();
    });
  }
}

// --- IntersectionObserver for lazy thumbnail loading ---
let thumbObserver = null;

function setupThumbObserver() {
  if (thumbObserver) thumbObserver.disconnect();
  thumbObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const imgEl = entry.target;
        const filePath = imgEl.dataset.path;
        if (filePath && !imgEl.dataset.queued) {
          imgEl.dataset.queued = '1';
          thumbObserver.unobserve(imgEl);
          enqueueThumbnail(filePath, imgEl);
        }
      }
    });
  }, { rootMargin: '200px' }); // pre-load 200px before entering viewport
}

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

  // Auto-load last folder
  const lastFolder = await window.api.getLastFolder();
  if (lastFolder) {
    currentFolder = lastFolder;
    folderPathEl.textContent = lastFolder;
    await loadVideos();
    await window.api.watchFolder(lastFolder);
  }
}
init();

// --- Folder selection ---
btnSelectFolder.addEventListener('click', async () => {
  const folder = await window.api.selectFolder();
  if (!folder) return;
  currentFolder = folder;
  folderPathEl.textContent = folder;
  await window.api.setLastFolder(folder);
  await window.api.unwatchFolder();
  await loadVideos();
  await window.api.watchFolder(folder);
});

async function loadVideos() {
  selectedPaths.clear();
  thumbnailCache = {};
  thumbQueue.length = 0;
  thumbActiveCount = 0;
  window.api.offMetadataUpdate();

  try {
    // Phase 1: instant file list (no loading overlay — it's fast)
    setStatus('Scanning files...', false);
    allVideos = await window.api.scanFolder(currentFolder);
    applyFiltersAndRender();

    // Phase 2: progressive metadata — only for uncached files
    if (allVideos.length > 0) {
      const uncached = allVideos.filter(v => !v._cached);

      if (uncached.length === 0) {
        setStatus(`${allVideos.length} videos loaded (all cached).`);
      } else {
        setStatus(`Extracting metadata for ${uncached.length} new file(s)...`, false);

        window.api.onMetadataUpdate((data) => {
          if (data.allCached) {
            setStatus(`${allVideos.length} videos loaded (all cached).`);
            return;
          }

          const video = allVideos.find(v => v.path === data.path);
          if (video) {
            video.width = data.width;
            video.height = data.height;
            video.quality = data.quality;
            video.duration = data.duration;
          }

          // Only re-render at 25%, 50%, 75%, and 100% to avoid DOM thrashing
          if (data.progress === 25 || data.progress === 50 || data.progress === 75 || data.progress === 100) {
            applyFiltersAndRender();
          }

          if (data.progress < 100) {
            setStatus(`Extracting metadata... ${data.progress}%`, false);
          } else {
            setStatus(`${allVideos.length} videos loaded.`);
          }
        });

        window.api.extractMetadata(allVideos.map(v => ({ path: v.path, _cacheKey: v._cacheKey, _cached: v._cached })));
      }
    } else {
      setStatus('No videos found.');
    }
  } catch (e) {
    setStatus('Error scanning folder: ' + e.message);
  }
}

// Auto-refresh (debounced to prevent rapid-fire reloads)
const debouncedReload = debounce(() => {
  if (currentFolder && !isOperationInProgress) loadVideos();
}, 1500);

window.api.onFolderChanged(() => {
  debouncedReload();
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

  // Event delegation — single listener on the table handles all interactions
  document.getElementById('check-all-list').addEventListener('change', (e) => {
    if (e.target.checked) filteredVideos.forEach(v => selectedPaths.add(v.path));
    else filteredVideos.forEach(v => selectedPaths.delete(v.path));
    applyFiltersAndRender();
  });

  videoListEl.addEventListener('click', (e) => {
    const target = e.target;

    // Play button
    if (target.classList.contains('play-btn')) {
      e.stopPropagation();
      openPlayer(parseInt(target.dataset.index));
      return;
    }

    // Favorite button
    if (target.classList.contains('fav-btn')) {
      e.stopPropagation();
      toggleFavorite(target.dataset.path);
      return;
    }

    // Checkbox
    if (target.classList.contains('row-check')) {
      const p = target.dataset.path;
      if (target.checked) selectedPaths.add(p);
      else selectedPaths.delete(p);
      updateActionBar();
      const row = target.closest('tr');
      row.className = selectedPaths.has(p) ? 'selected' : '';
      return;
    }

    // Row click (not on input/button)
    const tr = target.closest('tr');
    if (tr && tr.dataset.path) {
      const p = tr.dataset.path;
      if (selectedPaths.has(p)) selectedPaths.delete(p);
      else selectedPaths.add(p);
      tr.className = selectedPaths.has(p) ? 'selected' : '';
      const cb = tr.querySelector('.row-check');
      if (cb) cb.checked = selectedPaths.has(p);
      updateActionBar();
    }
  });
}

// --- Grid View ---
function renderGrid() {
  videoGridEl.innerHTML = '';
  if (filteredVideos.length === 0) return;

  setupThumbObserver();

  filteredVideos.forEach((v, i) => {
    const card = document.createElement('div');
    card.className = 'grid-card' + (selectedPaths.has(v.path) ? ' selected' : '');
    card.dataset.path = v.path;

    card.innerHTML = `
      <div class="grid-thumb-wrap">
        <img class="grid-thumb" data-path="${v.path}" alt="thumbnail" />
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

    const imgEl = card.querySelector('.grid-thumb');

    // If already in memory cache, set immediately — no observer needed
    if (thumbnailCache[v.path]) {
      imgEl.src = thumbnailCache[v.path];
    } else {
      // Observe for lazy loading
      thumbObserver.observe(imgEl);
    }

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
  isOperationInProgress = true;
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
  isOperationInProgress = false;
  const failed = results.filter(r => !r.success).length;
  setStatus(`Renamed ${results.length - failed} file(s).${failed ? ` ${failed} failed.` : ''}`);
});

// --- Delete ---
btnDelete.addEventListener('click', async () => {
  if (selectedPaths.size === 0) return;
  const confirm = window.confirm(`Delete ${selectedPaths.size} file(s)? This cannot be undone.`);
  if (!confirm) return;
  isOperationInProgress = true;
  showLoading('Deleting files...');
  const results = await window.api.deleteFiles([...selectedPaths]);
  selectedPaths.clear();
  await loadVideos();
  hideLoading();
  isOperationInProgress = false;
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
const dupSummary = document.getElementById('dup-summary');
const dupInstructions = document.getElementById('dup-instructions');
const dupDeleteBtn = document.getElementById('dup-delete-selected');
let duplicateGroups = [];

btnDuplicates.addEventListener('click', async () => {
  // Check if metadata is loaded
  const noMeta = allVideos.filter(v => !v.duration);
  if (noMeta.length > 0) {
    const proceed = window.confirm(`${noMeta.length} video(s) still loading metadata. Duplicates found may be incomplete.\n\nContinue anyway?`);
    if (!proceed) return;
  }

  showLoading('Scanning for duplicates...');
  window.api.onDupProgress((msg) => {
    if (msg) loadingText.textContent = msg;
  });

  duplicateGroups = await window.api.findDuplicates(allVideos.filter(v => v.duration > 0));

  window.api.offDupProgress();
  hideLoading();
  renderDuplicates();
  duplicatesModal.classList.remove('hidden');
});

function renderDuplicates() {
  dupContent.innerHTML = '';
  dupDeleteBtn.disabled = true;

  if (duplicateGroups.length === 0) {
    dupContent.innerHTML = '<p class="empty-msg">No duplicates found.</p>';
    dupSummary.textContent = '';
    dupInstructions.classList.add('hidden');
    return;
  }

  const totalFiles = duplicateGroups.reduce((sum, g) => sum + g.length, 0);
  dupSummary.textContent = `${duplicateGroups.length} group(s), ${totalFiles} files`;
  dupInstructions.classList.remove('hidden');

  duplicateGroups.forEach((group, gi) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'dup-group';
    groupEl.dataset.group = gi;

    groupEl.innerHTML = `<div class="dup-group-title">
      Group ${gi + 1} — ${group.length} files
      <span class="dup-group-meta">${formatDuration(group[0].duration)} · ~${formatSize(group[0].size)}</span>
    </div>`;

    group.forEach((v, vi) => {
      const item = document.createElement('div');
      item.className = 'dup-item';
      item.dataset.group = gi;
      item.dataset.index = vi;
      item.dataset.path = v.path;

      item.innerHTML = `
        <label class="dup-radio-label">
          <input type="radio" name="dup-group-${gi}" value="${vi}" class="dup-radio" />
          <span class="dup-keep-badge hidden">KEEP</span>
          <span class="dup-delete-badge hidden">DELETE</span>
        </label>
        <div class="dup-thumb-wrap">
          <img class="dup-thumb" data-path="${v.path}" alt="" />
          <button class="dup-play-btn" data-path="${v.path}" title="Play">▶</button>
        </div>
        <div class="dup-item-info">
          <span class="dup-name" title="${v.path}">${v.name}</span>
          <span class="dup-item-meta">${v.quality} · ${formatSize(v.size)} · ${formatDuration(v.duration)} · ${v.ext}${v.similarity != null ? ` · <span class="dup-similarity">${v.similarity}% match</span>` : ''}</span>
          <span class="dup-item-path">${v.path}</span>
        </div>
        <button class="dup-dismiss-btn" data-group="${gi}" data-index="${vi}" title="Not a duplicate — remove from group">✕</button>
      `;

      groupEl.appendChild(item);

      // Load thumbnail
      const thumbImg = item.querySelector('.dup-thumb');
      if (thumbnailCache[v.path]) {
        thumbImg.src = thumbnailCache[v.path];
      } else {
        window.api.getThumbnail(v.path).then(data => {
          if (data) {
            thumbnailCache[v.path] = data;
            thumbImg.src = data;
          }
        });
      }
    });

    dupContent.appendChild(groupEl);
  });

  // Radio button change handlers
  dupContent.querySelectorAll('.dup-radio').forEach(radio => {
    radio.addEventListener('change', () => {
      const groupIdx = radio.closest('.dup-item').dataset.group;
      const keepIdx = radio.value;

      // Update badges in this group
      const groupItems = dupContent.querySelectorAll(`.dup-item[data-group="${groupIdx}"]`);
      groupItems.forEach(item => {
        const keepBadge = item.querySelector('.dup-keep-badge');
        const delBadge = item.querySelector('.dup-delete-badge');
        if (item.dataset.index === keepIdx) {
          keepBadge.classList.remove('hidden');
          delBadge.classList.add('hidden');
          item.classList.remove('dup-marked-delete');
          item.classList.add('dup-marked-keep');
        } else {
          keepBadge.classList.add('hidden');
          delBadge.classList.remove('hidden');
          item.classList.add('dup-marked-delete');
          item.classList.remove('dup-marked-keep');
        }
      });

      updateDupDeleteButton();
    });
  });

  // Play button handlers — play video without closing duplicates modal
  dupContent.querySelectorAll('.dup-play-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const filePath = btn.dataset.path;
      // Open player on top of the duplicates modal
      videoPlayer.src = filePath;
      const v = allVideos.find(v => v.path === filePath);
      playerTitle.textContent = v ? v.name : filePath;
      playerIndex.textContent = 'Duplicate preview';
      btnPrev.disabled = true;
      btnNext.disabled = true;
      playerResolution.textContent = v && v.width ? `${v.width}×${v.height} · ${v.quality}` : '';
      playerModal.classList.remove('hidden');
      videoPlayer.play();
    });
  });

  // Dismiss button handlers — remove false positive from duplicate group
  dupContent.querySelectorAll('.dup-dismiss-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const gi = parseInt(btn.dataset.group);
      const vi = parseInt(btn.dataset.index);

      if (duplicateGroups[gi]) {
        duplicateGroups[gi].splice(vi, 1);
        // Remove the whole group if less than 2 remain
        if (duplicateGroups[gi].length < 2) {
          duplicateGroups.splice(gi, 1);
        }
      }
      renderDuplicates();
    });
  });
}

function updateDupDeleteButton() {
  // Enable delete button if at least one group has a selection
  const anySelected = dupContent.querySelector('.dup-radio:checked');
  const filesToDelete = getFilesToDelete();
  dupDeleteBtn.disabled = filesToDelete.length === 0;
  if (filesToDelete.length > 0) {
    dupDeleteBtn.textContent = `🗑 Delete ${filesToDelete.length} Duplicate(s)`;
  } else {
    dupDeleteBtn.textContent = '🗑 Delete Unselected Duplicates';
  }
}

function getFilesToDelete() {
  const toDelete = [];
  duplicateGroups.forEach((group, gi) => {
    const selected = dupContent.querySelector(`input[name="dup-group-${gi}"]:checked`);
    if (!selected) return; // no keeper chosen for this group yet
    const keepIdx = parseInt(selected.value);
    group.forEach((v, vi) => {
      if (vi !== keepIdx) toDelete.push(v.path);
    });
  });
  return toDelete;
}

dupDeleteBtn.addEventListener('click', async () => {
  const toDelete = getFilesToDelete();
  if (toDelete.length === 0) return;

  const confirm = window.confirm(`Delete ${toDelete.length} duplicate file(s)? This cannot be undone.\n\nThe files you selected as "KEEP" will remain.`);
  if (!confirm) return;

  showLoading('Deleting duplicates...');
  duplicatesModal.classList.add('hidden');
  const results = await window.api.deleteFiles(toDelete);
  await loadVideos();
  hideLoading();

  const failed = results.filter(r => !r.success).length;
  setStatus(`Deleted ${results.length - failed} duplicate(s).${failed ? ` ${failed} failed.` : ''}`);
});

dupClose.addEventListener('click', () => duplicatesModal.classList.add('hidden'));
dupBackdrop.addEventListener('click', () => duplicatesModal.classList.add('hidden'));

// --- Video Player ---
const playerPip = document.getElementById('player-pip');
const playerFullscreen = document.getElementById('player-fullscreen');
const playerSpeed = document.getElementById('player-speed');
const playerVolume = document.getElementById('player-volume');
const playerResolution = document.getElementById('player-resolution');

function openPlayer(index) {
  currentPlayerIndex = index;
  playerSpeed.value = '1';
  videoPlayer.playbackRate = 1;
  videoPlayer.volume = parseFloat(playerVolume.value);
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
  playerResolution.textContent = v.width && v.height ? `${v.width}×${v.height} · ${v.quality}` : '';
  videoPlayer.playbackRate = parseFloat(playerSpeed.value);
  videoPlayer.play();
}

function closePlayer() {
  videoPlayer.pause();
  videoPlayer.src = '';
  playerModal.classList.add('hidden');
  // Exit PiP if active
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(() => {});
  }
  // Don't close duplicates modal — player may have been opened from there
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

// Speed control
playerSpeed.addEventListener('change', () => {
  videoPlayer.playbackRate = parseFloat(playerSpeed.value);
});

// Volume control
playerVolume.addEventListener('input', () => {
  videoPlayer.volume = parseFloat(playerVolume.value);
});

// Picture-in-Picture
playerPip.addEventListener('click', async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await videoPlayer.requestPictureInPicture();
    }
  } catch (e) {}
});

// Fullscreen toggle
playerFullscreen.addEventListener('click', () => {
  const wrap = document.getElementById('player-video-wrap');
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    wrap.requestFullscreen().catch(() => {
      // Fallback: try the video element directly
      videoPlayer.requestFullscreen().catch(() => {});
    });
  }
});

document.addEventListener('keydown', (e) => {
  if (playerModal.classList.contains('hidden')) return;
  if (e.key === 'Escape') {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      closePlayer();
    }
  }
  if (e.key === 'ArrowLeft') btnPrev.click();
  if (e.key === 'ArrowRight') btnNext.click();
  if (e.key === 'f' || e.key === 'F') playerFullscreen.click();
  if (e.key === ' ') {
    e.preventDefault();
    videoPlayer.paused ? videoPlayer.play() : videoPlayer.pause();
  }
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

function setStatus(msg, autoClear = true) {
  statusMsg.textContent = msg;
  if (autoClear) {
    setTimeout(() => {
      if (statusMsg.textContent === msg) statusMsg.textContent = '';
    }, 4000);
  }
}
