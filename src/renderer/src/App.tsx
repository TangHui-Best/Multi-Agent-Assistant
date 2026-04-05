import { RoomLayout } from './features/room/RoomLayout'
import { useRoomViewModel } from './features/room/useRoomViewModel'

export default function App() {
  const model = useRoomViewModel()

  return (
    <RoomLayout
      roomTitle={model.roomTitle}
      agents={model.agents}
      messages={model.messages}
      mode={model.mode}
    />
  )
}

