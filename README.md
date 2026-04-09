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
- **Video player** — built-in player with prev/next navigation and keyboard shortcuts (← → Escape)
- **Bulk rename** — rename selected files to UUID (keeps original extension)
- **Bulk delete** — delete selected files with confirmation
- **Duplicate detection** — finds duplicates by matching file size and duration
- **Auto-refresh** — automatically updates the list when files are added or removed from the watched folder

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

The installer will be output to `dist/Video Manager Setup 1.0.0.exe`.

> **Note:** The build requires Administrator privileges on Windows due to electron-builder's code signing tools. If the build fails, try clearing the cache at `C:\Users\<you>\AppData\Local\electron-builder\Cache\winCodeSign` and re-running from an admin terminal.

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
| `Escape` | Close player |

---

## Author

William C Eason II — [willeason2@gmail.com](mailto:willeason2@gmail.com)
