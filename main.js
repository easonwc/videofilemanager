const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const ffprobePath = require('ffprobe-static').path;
const ffmpegPath = require('ffmpeg-static');
const { v4: uuidv4 } = require('uuid');

const FAVORITES_FILE = path.join(app.getPath('userData'), 'favorites.json');
const THUMB_CACHE_DIR = path.join(app.getPath('userData'), 'thumbnails');

let mainWindow;
let folderWatcher = null;

// Ensure thumbnail cache directory exists
app.whenReady().then(() => {
  if (!fs.existsSync(THUMB_CACHE_DIR)) fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
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

ipcMain.handle('scan-folder', async (_, folderPath) => {
  const files = scanFolder(folderPath);
  const results = [];

  for (const filePath of files) {
    const stat = fs.statSync(filePath);
    const meta = await getVideoMetadata(filePath);
    results.push({
      path: filePath,
      name: path.basename(filePath),
      ext: path.extname(filePath).toLowerCase(),
      size: stat.size,
      modified: stat.mtimeMs,
      width: meta ? meta.width : 0,
      height: meta ? meta.height : 0,
      quality: meta ? meta.quality : 'Unknown',
      duration: meta ? meta.duration : 0
    });
  }

  return results;
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
ipcMain.handle('find-duplicates', async (_, videos) => {
  const groups = {};
  for (const v of videos) {
    const key = `${v.size}_${Math.round(v.duration)}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);
  }
  return Object.values(groups).filter(g => g.length > 1);
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
