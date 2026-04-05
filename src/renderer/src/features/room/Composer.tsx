export function Composer() {
  return (
    <form className="composer">
      <label className="composer__label">
        Message
        <textarea aria-label="Message" className="composer__input" placeholder="Ask the room, or direct a message with @critic" />
      </label>
      <div className="composer__actions">
        <button className="composer__button" type="button">
          Send
        </button>
      </div>
    </form>
  )
}

