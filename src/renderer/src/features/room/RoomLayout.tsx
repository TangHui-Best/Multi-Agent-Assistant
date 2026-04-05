import { Composer } from './Composer'
import { ControlPanel } from './ControlPanel'
import { Timeline } from './Timeline'

export interface RoomLayoutProps {
  roomTitle: string
  agents: { id: string; status: string }[]
  messages: { id: string; senderId: string; body: string; kind: string }[]
  mode: 'open' | 'controlled'
}

export function RoomLayout(props: RoomLayoutProps) {
  return (
    <main className="room-layout">
      <aside className="room-sidebar">
        <div className="room-brand">
          <p className="room-brand__eyebrow">Local Room</p>
          <h1>{props.roomTitle}</h1>
        </div>
        <ul className="agent-list">
          {props.agents.map((agent) => (
            <li key={agent.id} className="agent-list__item">
              <span className="agent-list__avatar">{agent.id.slice(0, 1).toUpperCase()}</span>
              <div>
                <p className="agent-list__name">{agent.id}</p>
                <p className="agent-list__status">{agent.status}</p>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <section className="room-main">
        <header className="room-main__header">
          <div>
            <p className="room-main__eyebrow">Shared Discussion</p>
            <h2>Conversation Flow</h2>
          </div>
        </header>
        <Timeline messages={props.messages} />
        <Composer />
      </section>

      <aside className="room-controls">
        <ControlPanel mode={props.mode} />
      </aside>
    </main>
  )
}

