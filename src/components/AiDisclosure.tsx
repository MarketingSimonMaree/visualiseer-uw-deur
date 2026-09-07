/** Zichtbare AI-melding in de visualisator-UI. */
export function AiDisclosure({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span
        className="ai-badge"
        title="Betreft een visualisatie gegenereerd met AI. Hieraan kunnen geen rechten worden ontleend."
      >
        AI
      </span>
    )
  }

  return (
    <aside className="ai-disclosure" role="note">
      <span className="ai-disclosure-badge" aria-hidden>
        AI
      </span>
      <p>
        Deze visualisatie wordt gemaakt met AI. Het is een impressie — hieraan
        kunnen geen rechten worden ontleend.
      </p>
    </aside>
  )
}
