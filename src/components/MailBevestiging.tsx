interface Props {
  naam: string
  email: string
  prijsindicatie: boolean
  emailed: boolean
  onBekijkResultaat: () => void
  onAndereDeur: () => void
}

export function MailBevestiging({
  naam,
  email,
  prijsindicatie,
  emailed,
  onBekijkResultaat,
  onAndereDeur,
}: Props) {
  return (
    <section className="page">
      <div className="page-intro">
        <h1 className="section-title">
          <span className="gold">Onderweg</span> naar uw inbox
        </h1>
        <p className="lead">
          {emailed
            ? `Beste ${naam}, de visualisatie is verstuurd naar ${email}.`
            : `Beste ${naam}, uw aanvraag voor ${email} is ontvangen. Wij sturen de visualisatie zo snel mogelijk toe.`}
        </p>
      </div>

      {prijsindicatie && (
        <p className="note-banner mb-6">
          U heeft gekozen voor een prijsindicatie — wij nemen contact met u op.
        </p>
      )}

      <div className="cta-row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onBekijkResultaat}
        >
          Toch hier bekijken
          <span className="btn-arrow" aria-hidden>
            →
          </span>
        </button>
        <button type="button" className="back-link !mb-0" onClick={onAndereDeur}>
          Andere deur kiezen
        </button>
      </div>
    </section>
  )
}
