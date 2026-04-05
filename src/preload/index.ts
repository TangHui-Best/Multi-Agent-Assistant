import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/channels'

contextBridge.exposeInMainWorld('roomApi', {
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getSnapshot),
  sendMessage: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.sendMessage, payload)
})

