const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const ffprobePath = require('ffprobe-static').path;
const ffmpegPath = require('ffmpeg-static');
const { v4: uuidv4 } = require('uuid');

// --- Hardware acceleration flags for better video playback ---
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-hardware-overlays', 'single-fullscreen,single-on-top,underlay');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder,CanvasOopRasterization');
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const FAVORITES_FILE = path.join(app.getPath('userData'), 'favorites.json');
const LAST_FOLDER_FILE = path.join(app.getPath('userData'), 'last-folder.json');
const THUMB_CACHE_DIR = path.join(app.getPath('userData'), 'thumbnails');
const META_CACHE_FILE = path.join(app.getPath('userData'), 'metadata-cache.json');

// --- Metadata cache ---
let metaCache = {}; // key -> { width, height, quality, duration }

function loadMetaCache() {
  try {
    if (fs.existsSync(META_CACHE_FILE)) {
      metaCache = JSON.parse(fs.readFileSync(META_CACHE_FILE, 'utf8'));
    }
  } catch (e) { metaCache = {}; }
}

function saveMetaCache() {
  try {
    fs.writeFileSync(META_CACHE_FILE, JSON.stringify(metaCache), 'utf8');
  } catch (e) {}
}

// Cache key: path + size + modified time — if any change, re-extract
function metaCacheKey(filePath, size, mtimeMs) {
  return `${filePath}|${size}|${Math.round(mtimeMs)}`;
}

let mainWindow;
let folderWatcher = null;

// Ensure thumbnail cache directory exists
app.whenReady().then(() => {
  if (!fs.existsSync(THUMB_CACHE_DIR)) fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
  loadMetaCache();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    title: 'Video Manager'
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (folderWatcher) folderWatcher.close();
  if (process.platform !== 'darwin') app.quit();
});

// --- Favorites ---
function loadFavorites() {
  try {
    if (fs.existsSync(FAVORITES_FILE)) {
      return JSON.parse(fs.readFileSync(FAVORITES_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function saveFavorites(favs) {
  fs.writeFileSync(FAVORITES_FILE, JSON.stringify(favs), 'utf8');
}

ipcMain.handle('get-favorites', () => loadFavorites());

ipcMain.handle('set-favorites', (_, favs) => {
  saveFavorites(favs);
  return true;
});

// --- Last folder persistence ---
ipcMain.handle('get-last-folder', () => {
  try {
    if (fs.existsSync(LAST_FOLDER_FILE)) {
      const folder = JSON.parse(fs.readFileSync(LAST_FOLDER_FILE, 'utf8'));
      if (folder && fs.existsSync(folder)) return folder;
    }
  } catch (e) {}
  return null;
});

ipcMain.handle('set-last-folder', (_, folder) => {
  fs.writeFileSync(LAST_FOLDER_FILE, JSON.stringify(folder), 'utf8');
  return true;
});

// --- Folder selection ---
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

// --- Recursive video scan ---
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpeg', '.mpg'];

function scanFolder(folderPath) {
  let files = [];
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(scanFolder(fullPath));
      } else if (entry.isFile() && VIDEO_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  } catch (e) {}
  return files;
}

function getVideoMetadata(filePath) {
  return new Promise((resolve) => {
    execFile(ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      filePath
    ], (err, stdout) => {
      if (err) return resolve(null);
      try {
        const data = JSON.parse(stdout);
        const videoStream = data.streams.find(s => s.codec_type === 'video');
        const format = data.format;
        const height = videoStream ? parseInt(videoStream.height) : 0;
        const width = videoStream ? parseInt(videoStream.width) : 0;
        const duration = parseFloat(format.duration) || 0;
        const size = parseInt(format.size) || 0;

        let quality = 'SD';
        if (height >= 2160) quality = '4K';
        else if (height >= 1080) quality = '1080p';
        else if (height >= 720) quality = '720p';
        else if (height >= 480) quality = '480p';

        resolve({ width, height, quality, duration, size });
      } catch (e) {
        resolve(null);
      }
    });
  });
}

// Phase 1: quick file-system scan — returns immediately with basic info + cached metadata
ipcMain.handle('scan-folder', async (_, folderPath) => {
  const files = scanFolder(folderPath);
  const results = [];

  for (const filePath of files) {
    try {
      const stat = fs.statSync(filePath);
      const cacheKey = metaCacheKey(filePath, stat.size, stat.mtimeMs);
      const cached = metaCache[cacheKey];

      results.push({
        path: filePath,
        name: path.basename(filePath),
        ext: path.extname(filePath).toLowerCase(),
        size: stat.size,
        modified: stat.mtimeMs,
        width: cached ? cached.width : 0,
        height: cached ? cached.height : 0,
        quality: cached ? cached.quality : 'Loading...',
        duration: cached ? cached.duration : 0,
        _cacheKey: cacheKey,
        _cached: !!cached
      });
    } catch (e) {}
  }

  return results;
});

// Phase 2: progressive metadata extraction — sends updates as each file completes
const META_CONCURRENCY = 6;

ipcMain.handle('extract-metadata', async (_, fileInfos) => {
  // fileInfos is an array of { path, _cacheKey, _cached }
  // Skip files that already have cached metadata
  const toExtract = fileInfos.filter(f => !f._cached);
  const total = toExtract.length;

  if (total === 0) {
    // Everything was cached — send 100% immediately
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('metadata-update', { path: null, progress: 100, allCached: true });
    }
    return true;
  }

  let completed = 0;

  async function processFile(fileInfo) {
    const meta = await getVideoMetadata(fileInfo.path);
    completed++;

    const result = {
      width: meta ? meta.width : 0,
      height: meta ? meta.height : 0,
      quality: meta ? meta.quality : 'Unknown',
      duration: meta ? meta.duration : 0
    };

    // Save to cache
    if (fileInfo._cacheKey) {
      metaCache[fileInfo._cacheKey] = result;
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('metadata-update', {
        path: fileInfo.path,
        ...result,
        progress: Math.round((completed / total) * 100)
      });
    }
  }

  // Process in batches for concurrency
  const queue = [...toExtract];
  const workers = [];
  for (let i = 0; i < META_CONCURRENCY; i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const f = queue.shift();
        if (f) await processFile(f);
      }
    })());
  }
  await Promise.all(workers);

  // Persist cache to disk after extraction completes
  saveMetaCache();
  return true;
});

// --- Thumbnail extraction (with disk cache) ---
function thumbCachePath(filePath) {
  // Use a hash of the file path as the cache filename
  let hash = 0;
  for (let i = 0; i < filePath.length; i++) {
    hash = ((hash << 5) - hash) + filePath.charCodeAt(i);
    hash |= 0;
  }
  return path.join(THUMB_CACHE_DIR, `${Math.abs(hash)}.jpg`);
}

ipcMain.handle('get-thumbnail', async (_, filePath) => {
  const cachePath = thumbCachePath(filePath);

  // Return from disk cache if it exists
  if (fs.existsSync(cachePath)) {
    try {
      const data = fs.readFileSync(cachePath);
      return 'data:image/jpeg;base64,' + data.toString('base64');
    } catch (e) {}
  }

  // Extract via ffmpeg and save to disk cache
  return new Promise((resolve) => {
    execFile(ffmpegPath, [
      '-ss', '7',
      '-i', filePath,
      '-frames:v', '1',
      '-q:v', '2',
      '-vf', 'scale=320:-1',
      '-y',
      cachePath
    ], (err) => {
      if (err || !fs.existsSync(cachePath)) return resolve(null);
      try {
        const data = fs.readFileSync(cachePath);
        resolve('data:image/jpeg;base64,' + data.toString('base64'));
      } catch (e) {
        resolve(null);
      }
    });
  });
});

// --- Clear thumbnail cache ---
ipcMain.handle('clear-thumb-cache', () => {
  try {
    const files = fs.readdirSync(THUMB_CACHE_DIR);
    files.forEach(f => fs.unlinkSync(path.join(THUMB_CACHE_DIR, f)));
    return files.length;
  } catch (e) {
    return 0;
  }
});

// --- Rename to UUID ---
ipcMain.handle('rename-to-uuid', async (_, filePaths) => {
  const results = [];
  for (const filePath of filePaths) {
    const ext = path.extname(filePath);
    const dir = path.dirname(filePath);
    const newName = uuidv4() + ext;
    const newPath = path.join(dir, newName);
    try {
      fs.renameSync(filePath, newPath);
      results.push({ old: filePath, new: newPath, success: true });
    } catch (e) {
      results.push({ old: filePath, success: false, error: e.message });
    }
  }
  return results;
});

// --- Delete files ---
ipcMain.handle('delete-files', async (_, filePaths) => {
  const results = [];
  for (const filePath of filePaths) {
    try {
      fs.unlinkSync(filePath);
      results.push({ path: filePath, success: true });
    } catch (e) {
      results.push({ path: filePath, success: false, error: e.message });
    }
  }
  return results;
});

// --- Find duplicates ---
// --- Perceptual hashing for duplicate detection ---

// Extract a tiny 9x8 grayscale raw frame from a video at a given timestamp
function extractHashFrame(filePath, timestamp) {
  return new Promise((resolve) => {
    execFile(ffmpegPath, [
      '-ss', String(timestamp),
      '-i', filePath,
      '-frames:v', '1',
      '-vf', 'scale=9:8,format=gray',
      '-f', 'rawvideo',
      '-pix_fmt', 'gray',
      '-y',
      'pipe:1'
    ], { encoding: 'buffer', maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout || stdout.length < 72) return resolve(null);
      resolve(stdout);
    });
  });
}

// Compute dHash (difference hash) from 9x8 grayscale pixel buffer
// Produces a 64-bit hash: compare each pixel to its right neighbor
function computeDHash(pixelBuffer) {
  let hash = BigInt(0);
  let bit = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = pixelBuffer[y * 9 + x];
      const right = pixelBuffer[y * 9 + x + 1];
      if (left > right) {
        hash |= (BigInt(1) << BigInt(bit));
      }
      bit++;
    }
  }
  return hash;
}

// Hamming distance between two 64-bit hashes
function hammingDistance(a, b) {
  let xor = a ^ b;
  let dist = 0;
  while (xor > 0n) {
    dist += Number(xor & 1n);
    xor >>= 1n;
  }
  return dist;
}

// --- Find duplicates ---
ipcMain.handle('find-duplicates', async (_, videos) => {
  const HASH_THRESHOLD = 10; // max hamming distance to consider a match
  const DURATION_TOLERANCE = 2; // seconds

  // Send progress updates
  function sendProgress(msg) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('dup-progress', msg);
    }
  }

  // Step 1: Group by similar duration (within tolerance)
  sendProgress('Grouping by duration...');
  const durationGroups = {};
  for (const v of videos) {
    if (!v.duration) continue; // skip if metadata not loaded yet
    const durKey = Math.round(v.duration / DURATION_TOLERANCE) * DURATION_TOLERANCE;
    if (!durationGroups[durKey]) durationGroups[durKey] = [];
    durationGroups[durKey].push(v);
  }

  // Filter to only groups with 2+ videos
  const candidates = Object.values(durationGroups).filter(g => g.length > 1);
  if (candidates.length === 0) return [];

  // Step 2: Extract perceptual hashes at 4 timestamps per video (10%, 30%, 50%, 70%)
  const SAMPLE_POINTS = [0.10, 0.30, 0.50, 0.70];
  const allCandidates = candidates.flat();
  sendProgress(`Extracting visual fingerprints for ${allCandidates.length} candidates...`);

  const hashMap = new Map(); // path -> BigInt[] (array of 4 hashes)
  const HASH_CONCURRENCY = 6;
  let hashDone = 0;

  async function hashFile(v) {
    const hashes = [];
    for (const pct of SAMPLE_POINTS) {
      const ts = Math.max(v.duration * pct, 0.5);
      const pixels = await extractHashFrame(v.path, ts);
      if (pixels) {
        hashes.push(computeDHash(pixels));
      }
    }
    if (hashes.length > 0) {
      hashMap.set(v.path, hashes);
    }
    hashDone++;
    if (hashDone % 5 === 0 || hashDone === allCandidates.length) {
      sendProgress(`Fingerprinting... ${hashDone}/${allCandidates.length}`);
    }
  }

  // Process with concurrency
  const queue = [...allCandidates];
  const workers = [];
  for (let i = 0; i < HASH_CONCURRENCY; i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const v = queue.shift();
        if (v) await hashFile(v);
      }
    })());
  }
  await Promise.all(workers);

  // Step 3: Within each duration group, compare hashes across all 4 frames
  sendProgress('Comparing fingerprints...');
  const duplicateGroups = [];

  // Compare two videos by averaging hamming distance across all shared sample frames
  function compareHashes(hashesA, hashesB) {
    const count = Math.min(hashesA.length, hashesB.length);
    if (count === 0) return 999;
    let totalDist = 0;
    for (let k = 0; k < count; k++) {
      totalDist += hammingDistance(hashesA[k], hashesB[k]);
    }
    return totalDist / count;
  }

  for (const group of candidates) {
    const used = new Set();
    for (let i = 0; i < group.length; i++) {
      if (used.has(i)) continue;
      const hashesA = hashMap.get(group[i].path);
      if (!hashesA) continue;

      const cluster = [{ ...group[i], similarity: 100 }];
      for (let j = i + 1; j < group.length; j++) {
        if (used.has(j)) continue;
        const hashesB = hashMap.get(group[j].path);
        if (!hashesB) continue;

        const avgDist = compareHashes(hashesA, hashesB);
        if (avgDist <= HASH_THRESHOLD) {
          const similarity = Math.round((1 - avgDist / 64) * 100);
          cluster.push({ ...group[j], similarity });
          used.add(j);
        }
      }
      if (cluster.length > 1) {
        used.add(i);
        duplicateGroups.push(cluster);
      }
    }
  }

  sendProgress('');
  return duplicateGroups;
});

// --- fs.watch for auto-refresh ---
ipcMain.handle('watch-folder', (_, folderPath) => {
  if (folderWatcher) folderWatcher.close();
  folderWatcher = fs.watch(folderPath, { recursive: true }, (eventType, filename) => {
    if (filename) {
      mainWindow.webContents.send('folder-changed');
    }
  });
  return true;
});

ipcMain.handle('unwatch-folder', () => {
  if (folderWatcher) {
    folderWatcher.close();
    folderWatcher = null;
  }
  return true;
});
