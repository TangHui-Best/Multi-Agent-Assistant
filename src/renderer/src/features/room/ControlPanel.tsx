export function ControlPanel(props: { mode: 'open' | 'controlled' }) {
  return (
    <section className="control-panel">
      <div className="control-panel__section">
        <p className="control-panel__eyebrow">Round Mode</p>
        <h2>{props.mode}</h2>
      </div>
      <div className="control-panel__section">
        <p className="control-panel__eyebrow">Tools</p>
        <button className="control-panel__button" type="button">
          Start Controlled Round
        </button>
        <button className="control-panel__button control-panel__button--secondary" type="button">
          Request Summary
        </button>
      </div>
    </section>
  )
}

