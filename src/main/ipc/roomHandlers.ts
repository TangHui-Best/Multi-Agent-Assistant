import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/channels'

interface RoomHandlerService {
  getSnapshot(): unknown
  acceptUserMessage(payload: unknown): unknown
}

export function registerRoomHandlers(roomService: RoomHandlerService) {
  ipcMain.handle(IPC_CHANNELS.getSnapshot, () => roomService.getSnapshot())
  ipcMain.handle(IPC_CHANNELS.sendMessage, (_event, payload) => roomService.acceptUserMessage(payload))
}

