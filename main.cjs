const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
let window, projectPath = null, pendingOpenPath = null, dirty = false, dirtyRevision = 0, pendingClose = false;
let fileQueue = Promise.resolve();
const serial = handler => (...args) => { const operation = fileQueue.then(() => handler(...args)); fileQueue = operation.catch(() => {}); return operation; };
const send = action => window?.webContents.send('menu-action', action);
const title = () => window?.setTitle(`${dirty ? '● ' : ''}${projectPath ? path.basename(projectPath, '.atlas') : 'Untitled'} — Atlas Ink`);
async function mayDiscard() {
  if (!dirty) return true;
  const r = await dialog.showMessageBox(window, { type: 'question', buttons: ['Keep editing', 'Discard changes'], defaultId: 0, cancelId: 0, message: 'Discard unsaved changes?', detail: 'Save your project first to keep it editable.' });
  return r.response === 1;
}
function createWindow() {
  window = new BrowserWindow({ width: 1440, height: 940, minWidth: 960, minHeight: 660, backgroundColor: '#f5f7fa', icon: path.join(__dirname, 'app/icon.png'), show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.loadFile(path.join(__dirname, 'app/index.html'));
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (url !== window.webContents.getURL()) { event.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  window.on('close', event => {
    if (!dirty) return;
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(window, { type: 'question', buttons: ['Save project', 'Discard changes', 'Keep editing'], defaultId: 0, cancelId: 2, message: 'Save your work before closing?' });
    if (choice === 1) { dirty = false; window.close(); }
    if (choice === 0) { pendingClose = true; send('save'); }
  });
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'New project', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
      { label: 'Open project…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
      { type: 'separator' },
      { label: 'Save project', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
      { label: 'Save project as…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as') },
      { label: 'Export PNG…', accelerator: 'CmdOrCtrl+E', click: () => send('export') },
      { type: 'separator' }, { label: 'Import historical boundary layer…', click: () => send('import') },
      { type: 'separator' }, { role: process.platform === 'darwin' ? 'close' : 'quit' }
    ] },
    { label: 'Edit', submenu: [ { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') }, { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('redo') }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' } ] },
    { label: 'View', submenu: [ { label: 'Fit map', accelerator: 'CmdOrCtrl+0', click: () => send('fit') }, { role: 'togglefullscreen' } ] },
    { label: 'Help', submenu: [ { label: 'Tools and map sources', click: () => send('help') } ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
ipcMain.handle('read-data', async (_, name) => {
  if (typeof name !== 'string' || !/^[a-z0-9-]+\.json$/.test(name)) throw new Error('Invalid bundled map name');
  return JSON.parse(await fs.readFile(path.join(__dirname, 'app/data', name), 'utf8'));
});
ipcMain.handle('save-project', serial(async (_, payload) => {
  try {
  if (!payload || typeof payload.json !== 'string' || payload.json.length > 100_000_000) throw new Error('Invalid project');
  let target = payload.saveAs ? null : projectPath;
  if (!target) {
    const result = await dialog.showSaveDialog(window, { title: 'Save editable project', defaultPath: `${String(payload.name || 'Untitled').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0,100)}.atlas`, filters: [{ name: 'Atlas Ink project', extensions: ['atlas'] }] });
    if (result.canceled) { pendingClose = false; return { canceled: true }; }
    target = result.filePath;
  }
  const temp = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, payload.json, 'utf8');
  await fs.rename(temp, target);
  projectPath = target; const current = payload.revision === dirtyRevision; if (current) dirty = false; title();
  if (pendingClose) { pendingClose = false; if (current) window.close(); }
  return { canceled: false, name: path.basename(target), current };
  } catch (error) { pendingClose = false; throw error; }
}));
ipcMain.handle('open-project', serial(async () => {
  if (!await mayDiscard()) return { canceled: true };
  const result = await dialog.showOpenDialog(window, { title: 'Open editable project', properties: ['openFile'], filters: [{ name: 'Atlas Ink project', extensions: ['atlas'] }] });
  if (result.canceled) return { canceled: true };
  const target = result.filePaths[0];
  const info = await fs.stat(target); if (info.size > 100_000_000) throw new Error('This project is too large');
  pendingOpenPath = target;
  return { canceled: false, json: await fs.readFile(target, 'utf8') };
}));
ipcMain.handle('project-opened', () => { if (!pendingOpenPath) throw new Error('No selected project'); projectPath = pendingOpenPath; pendingOpenPath = null; dirty = false; title(); });
ipcMain.handle('new-project', serial(async () => { if (!await mayDiscard()) return false; projectPath = null; dirty = false; title(); return true; }));
ipcMain.handle('import-boundaries', async () => {
  const result = await dialog.showOpenDialog(window, { title: 'Import GeoJSON boundary layer', properties: ['openFile'], filters: [{ name: 'GeoJSON', extensions: ['geojson', 'json'] }] });
  if (result.canceled) return { canceled: true };
  const target = result.filePaths[0]; const info = await fs.stat(target);
  if (info.size > 50_000_000) throw new Error('Choose a GeoJSON file smaller than 50 MB');
  return { canceled: false, name: path.basename(target), json: await fs.readFile(target, 'utf8') };
});
ipcMain.handle('export-png', async (_, payload) => {
  if (!payload || typeof payload.data !== 'string' || !payload.data.startsWith('data:image/png;base64,') || payload.data.length > 200_000_000) throw new Error('Invalid PNG');
  const result = await dialog.showSaveDialog(window, { title: 'Export current map view', defaultPath: `${String(payload.name || 'Map').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0,100)}.png`, filters: [{ name: 'PNG image', extensions: ['png'] }] });
  if (result.canceled) return { canceled: true };
  await fs.writeFile(result.filePath, Buffer.from(payload.data.split(',')[1], 'base64'));
  return { canceled: false, name: path.basename(result.filePath) };
});
ipcMain.on('dirty', (_, update) => { if (!update || !Number.isSafeInteger(update.revision)) return; dirty = !!update.value; dirtyRevision = update.revision; title(); });
ipcMain.on('edit-text', (_, action) => { if (action === 'undo') window.webContents.undo(); if (action === 'redo') window.webContents.redo(); });
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
