# Video Manager

A desktop application for managing local video files, built with Electron.

---

## What It Does

Video Manager lets you browse, organize, and play video files stored on your PC. Point it at any folder and it will recursively scan all subfolders for video files, extract metadata, and give you a clean interface to work with them.

### Features

- **Folder scanning** — recursively scans a selected folder and all subfolders for video files
- **Metadata extraction** — reads resolution, quality (4K / 1080p / 720p / 480p / SD), duration, and file size via ffprobe
- **List & Grid views** — switch between a detailed table view and a 6-column grid with thumbnail previews
- **Thumbnail previews** — extracts a frame at the 7-second mark of each video for the grid view
- **Sort & Filter** — sort by name, size, duration, quality, or file type; filter by quality, extension, or favorites
- **Search** — live search by filename
- **Favorites** — star any video and filter to favorites only; favorites persist between sessions
- **Video player** — built-in player with prev/next navigation, speed control, volume slider, fullscreen, and picture-in-picture
- **Keyboard shortcuts** — ← → for prev/next, Space for play/pause, F for fullscreen, Escape to close
- **Bulk rename** — rename selected files to UUID (keeps original extension)
- **Bulk delete** — delete selected files with confirmation
- **Duplicate detection** — finds duplicates using 4-frame perceptual hashing with visual similarity scoring; preview, play, and dismiss directly from the results
- **Auto-refresh** — automatically updates the list when files are added or removed from the watched folder
- **Thumbnail caching** — extracted thumbnails are cached to disk for instant loading on subsequent visits
- **Lazy loading** — grid thumbnails load on-demand as you scroll, keeping the UI fast with large libraries
- **Remember last folder** — automatically loads your last selected folder on startup
- **Progressive loading** — file list appears instantly, metadata fills in progressively in the background

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)
- Windows 10/11 (x64)

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/easonwc/videofilemanager.git
cd videofilemanager/video-manager
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run the app

```bash
npm start
```

---

## Building an Installer

To package the app as a Windows `.exe` installer, run from an **Administrator terminal**:

```bash
npm run build
```

The installer will be output to `dist/Video Manager Setup <version>.exe`.

> **Note:** The build requires Windows Developer Mode to be enabled (Settings → System → For Developers) due to symlink creation during packaging. Alternatively, run from an Administrator terminal.

---

## Project Structure

```
video-manager/
├── main.js              # Electron main process (IPC handlers, file system ops)
├── preload.js           # Secure bridge between main and renderer
├── index.html           # App shell and modals
├── renderer/
│   ├── app.js           # UI logic (rendering, filtering, player, etc.)
│   └── style.css        # Dark theme styles
├── assets/
│   ├── icon.svg         # App icon source
│   └── icon.ico         # App icon for Windows
├── scripts/
│   └── make-icon.js     # Icon generation helper
└── package.json
```

---

## Keyboard Shortcuts (Video Player)

| Key | Action |
|-----|--------|
| `←` | Previous video |
| `→` | Next video |
| `Space` | Play / Pause |
| `F` | Toggle fullscreen |
| `Escape` | Exit fullscreen or close player |

---

## Author

William C Eason II — [willeason2@gmail.com](mailto:willeason2@gmail.com)

---

## Changelog

### [1.6.0] - 2026-04-30
**Added**
- Persistent metadata cache — only new or modified files trigger ffprobe; cached files load instantly
- Near-instant startup when reopening a previously scanned folder

### [1.5.0] - 2026-04-09
**Added**
- Auto-loads last selected folder on startup
- Progressive metadata loading — file list appears instantly, metadata fills in background
- 4-frame perceptual hashing for duplicate detection (10%, 30%, 50%, 70% of video)
- Thumbnail previews and play buttons in duplicates modal
- Dismiss button to remove false positives from duplicate groups
- Visual similarity percentage per duplicate

**Fixed**
- Loading overlay no longer flashes on startup

### [1.4.0] - 2026-04-09
**Added**
- Enhanced video player — speed control (0.25x–2x), volume slider, resolution display
- Picture-in-Picture and fullscreen modes
- `Space` to play/pause, `F` for fullscreen keyboard shortcuts
- GPU hardware acceleration for improved 1080p/4K decoding
- Native resolution rendering with `object-fit: contain`
- Interactive duplicate reconciliation — pick a keeper, bulk delete the rest
- Duplicate detection now uses 2% file size tolerance

### [1.3.0] - 2026-04-09
**Changed**
- Full UI reskin to match personal design system (green & black theme)
- Replaced navy blue palette with design system colors (`#0a0a0a` bg, `#00c850` primary, `#141414` surfaces)
- Updated font to Arial as default
- Buttons, modals, tables, spinner, and scrollbars updated to match design system
- Shimmer animation updated to match dark palette

### [1.2.0] - 2026-04-09
**Added**
- Disk-based thumbnail cache — thumbnails saved to `userData/thumbnails/` for instant reloads
- IntersectionObserver lazy loading — thumbnails load as cards scroll into view
- Concurrency limiter — max 5 simultaneous ffmpeg thumbnail extractions
- Shimmer loading animation on grid cards
- Thumbnails scaled to 320px wide during extraction for smaller cache size

### [1.1.0] - 2026-04-09
**Changed**
- Redesigned app icon — green & black film strip with play button
- Added `author` field to package.json
- `make-icon.js` now generates a proper ICO binary without external dependencies

**Fixed**
- Build no longer fails with symlink error when Developer Mode is enabled
- Icon no longer rejected by electron-builder

### [1.0.0] - 2026-04-09
**Added**
- Initial release
- Recursive folder scanning for video files
- Video metadata extraction via ffprobe (resolution, quality, duration, size)
- List view and 6-column grid view with thumbnail previews (7-second mark)
- Sort by name, size, duration, quality, or file type
- Filter by quality, extension, or favorites
- Live search by filename
- Favorites system with persistent storage
- Built-in video player with prev/next navigation and keyboard shortcuts
- Bulk rename to UUID and bulk delete with confirmation
- Duplicate detection by file size and duration
- Auto-refresh via fs.watch
- Windows NSIS installer via electron-builder
