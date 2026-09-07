// Preload for the interview audio test page: the same contextBridge shape the
// app uses, reduced to what the scenarios need.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('testAPI', {
  getConfig: () => ipcRenderer.invoke('test:config'),
  // Mirrors ElectronAPI.sendRealtimeAudio in src/preload/index.ts.
  sendRealtimeAudio: (pcm16) => ipcRenderer.send('realtime:audio', new Uint8Array(pcm16)),
  report: (result) => ipcRenderer.send('test:result', result),
});
