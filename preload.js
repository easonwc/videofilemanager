const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
  extractMetadata: (filePaths) => ipcRenderer.invoke('extract-metadata', filePaths),
  onMetadataUpdate: (cb) => ipcRenderer.on('metadata-update', (_, data) => cb(data)),
  offMetadataUpdate: () => ipcRenderer.removeAllListeners('metadata-update'),
  getThumbnail: (filePath) => ipcRenderer.invoke('get-thumbnail', filePath),
  renameToUuid: (filePaths) => ipcRenderer.invoke('rename-to-uuid', filePaths),
  deleteFiles: (filePaths) => ipcRenderer.invoke('delete-files', filePaths),
  findDuplicates: (videos) => ipcRenderer.invoke('find-duplicates', videos),
  onDupProgress: (cb) => ipcRenderer.on('dup-progress', (_, msg) => cb(msg)),
  offDupProgress: () => ipcRenderer.removeAllListeners('dup-progress'),
  watchFolder: (folderPath) => ipcRenderer.invoke('watch-folder', folderPath),
  unwatchFolder: () => ipcRenderer.invoke('unwatch-folder'),
  getFavorites: () => ipcRenderer.invoke('get-favorites'),
  setFavorites: (favs) => ipcRenderer.invoke('set-favorites', favs),
  getLastFolder: () => ipcRenderer.invoke('get-last-folder'),
  setLastFolder: (folder) => ipcRenderer.invoke('set-last-folder', folder),
  clearThumbCache: () => ipcRenderer.invoke('clear-thumb-cache'),
  onFolderChanged: (cb) => ipcRenderer.on('folder-changed', cb),
  offFolderChanged: (cb) => ipcRenderer.removeListener('folder-changed', cb)
});
