export function Timeline(props: { messages: { id: string; senderId: string; body: string; kind: string }[] }) {
  return (
    <div className="timeline">
      {props.messages.map((message) => {
        const messageClass = message.senderId === 'user' ? 'timeline__bubble timeline__bubble--user' : 'timeline__bubble'

        return (
          <article key={message.id} className={messageClass}>
            <p className="timeline__sender">{message.senderId}</p>
            <p className="timeline__body">{message.body}</p>
          </article>
        )
      })}
    </div>
  )
}

