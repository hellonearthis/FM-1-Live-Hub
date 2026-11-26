const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fm1Desktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
  toggleDevTools: () => ipcRenderer.invoke('fm1:toggle-devtools'),
});
