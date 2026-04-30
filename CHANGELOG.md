# Changelog

All notable changes to Video Manager will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.6.0] - 2026-04-30

### Added
- Persistent metadata cache — video metadata (quality, resolution, duration) is saved to disk and reused on subsequent loads, keyed by file path + size + modified timestamp
- Only new or modified files trigger ffprobe extraction; cached files load instantly
- Status bar shows "all cached" when no extraction is needed

### Changed
- App startup with a previously scanned folder is now near-instant
- Metadata extraction only runs for uncached files, dramatically reducing reload time for large libraries

---

## [1.5.0] - 2026-04-09

### Added
- Auto-loads last selected folder on startup — no need to re-select every time
- Progressive metadata loading — file list appears instantly, quality/resolution/duration fill in as ffprobe processes each file in the background (6 concurrent)
- 4-frame perceptual hashing for duplicate detection — samples at 10%, 30%, 50%, 70% of each video and averages the visual similarity across all frames
- Thumbnail previews in the duplicates modal for visual comparison
- Play button on each duplicate item — watch videos directly from the modal without losing your place
- Dismiss button (✕) on each duplicate item to remove false positives from a group
- Similarity percentage displayed per duplicate (e.g. "97% match")
- Warning prompt if metadata hasn't finished loading when running duplicate scan

### Changed
- Removed loading overlay flash on startup — progress now shown in status bar only
- Duplicates modal widened to 900px to accommodate thumbnails
- Video player renders above duplicates modal (z-index 300) so previewing works seamlessly
- Duplicate detection is significantly more accurate with multi-frame comparison

### Fixed
- Loading overlay no longer flashes repeatedly during app initialization

---

## [1.4.0] - 2026-04-09

### Added
- Enhanced video player with speed control (0.25x–2x), volume slider, resolution display
- Picture-in-Picture mode — pop the video into a floating window
- Fullscreen mode with dedicated button and `F` keyboard shortcut
- `Space` key to play/pause in the player
- GPU hardware acceleration flags for improved video decoding at 1080p/4K
- Video renders at native resolution with `object-fit: contain` for maximum sharpness
- Interactive duplicate reconciliation — select a "keeper" per group, bulk delete the rest
- KEEP/DELETE badges with visual feedback in duplicate groups
- Duplicate detection now uses 2% file size tolerance to catch near-identical files

### Changed
- Player container widened to 92vw / 1500px max with 78vh video height
- Player backdrop darkened to 90% opacity for better contrast
- Duplicates modal widened to 800px with richer file details (name, quality, size, path)

---

## [1.3.0] - 2026-04-09

### Changed
- Full UI reskin to match personal design system (green & black theme)
- Replaced navy blue palette with design system colors (`#0a0a0a` bg, `#00c850` primary, `#141414` surfaces)
- Updated font to Arial as default
- Buttons now follow design system: dark bg, green hover, red for destructive actions
- Table rows use green-tinted selection highlight
- Modals updated with consistent border and radius
- Spinner updated to green accent
- Custom scrollbar styling added
- Shimmer animation updated to match dark palette

---

## [1.2.0] - 2026-04-09

### Added
- Disk-based thumbnail cache — thumbnails are saved to `userData/thumbnails/` so they only get extracted once per file; subsequent loads are instant
- IntersectionObserver lazy loading — thumbnails only load when their card scrolls into view (with 200px pre-load margin), making initial grid render near-instant regardless of library size
- Concurrency limiter — thumbnail extraction is capped at 5 simultaneous ffmpeg processes to keep the system responsive during large scans
- Shimmer loading animation on grid cards while thumbnails are being extracted
- Thumbnails are now scaled to 320px wide during extraction, reducing file size and memory usage
- `clearThumbCache` API for clearing the disk cache if needed

### Changed
- Grid view now renders all cards immediately and loads thumbnails progressively as you scroll

---

## [1.1.0] - 2026-04-09

### Changed
- Redesigned app icon with a professional green and black color scheme
- Icon now features a film strip with sprocket holes and a green play button circle
- Added `author` field to package.json for proper installer metadata
- Enabled Windows Developer Mode support for builds (resolves symlink error during packaging)
- Updated `make-icon.js` to generate a proper ICO binary without external dependencies

### Fixed
- Build no longer fails with "Cannot create symbolic link" error when Developer Mode is enabled
- Icon no longer rejected by electron-builder due to invalid format

---

## [1.0.0] - 2026-04-09

### Added
- Initial release
- Recursive folder scanning for video files (.mp4, .mkv, .avi, .mov, .wmv, .flv, .webm, .m4v, .mpeg, .mpg)
- Video metadata extraction via ffprobe — resolution, quality (4K/1080p/720p/480p/SD), duration, file size
- List view with sortable table (name, size, duration, quality, type)
- Grid view with 6 columns and thumbnail previews extracted at the 7-second mark
- Sort by name, size, duration, quality, or file type
- Filter by quality, file extension, or favorites
- Live search by filename
- Favorites system with persistent storage
- Built-in video player modal (90vw, large format)
- Previous/next navigation in player
- Keyboard shortcuts in player (← → Escape)
- Bulk rename selected files to UUID
- Bulk delete selected files with confirmation
- Duplicate detection by file size and duration
- Auto-refresh when files are added or removed from the watched folder
- Windows NSIS installer via electron-builder
- Git repository with GitHub remote
