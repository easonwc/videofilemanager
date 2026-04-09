const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
  getThumbnail: (filePath) => ipcRenderer.invoke('get-thumbnail', filePath),
  renameToUuid: (filePaths) => ipcRenderer.invoke('rename-to-uuid', filePaths),
  deleteFiles: (filePaths) => ipcRenderer.invoke('delete-files', filePaths),
  findDuplicates: (videos) => ipcRenderer.invoke('find-duplicates', videos),
  watchFolder: (folderPath) => ipcRenderer.invoke('watch-folder', folderPath),
  unwatchFolder: () => ipcRenderer.invoke('unwatch-folder'),
  getFavorites: () => ipcRenderer.invoke('get-favorites'),
  setFavorites: (favs) => ipcRenderer.invoke('set-favorites', favs),
  onFolderChanged: (cb) => ipcRenderer.on('folder-changed', cb),
  offFolderChanged: (cb) => ipcRenderer.removeListener('folder-changed', cb)
});
