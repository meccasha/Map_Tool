const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  readData: name => ipcRenderer.invoke('read-data', name),
  saveProject: payload => ipcRenderer.invoke('save-project', payload),
  openProject: () => ipcRenderer.invoke('open-project'),
  projectOpened: target => ipcRenderer.invoke('project-opened', target),
  newProject: () => ipcRenderer.invoke('new-project'),
  importBoundaries: () => ipcRenderer.invoke('import-boundaries'),
  exportPNG: payload => ipcRenderer.invoke('export-png', payload),
  dirty: update => ipcRenderer.send('dirty', update),
  editText: action => ipcRenderer.send('edit-text', action),
  onAction: callback => ipcRenderer.on('menu-action', (_, action) => callback(action))
});
