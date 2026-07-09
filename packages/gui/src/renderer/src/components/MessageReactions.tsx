// Facebook-style message reactions. GUI-only (the shared gateway/Telegram session has
// no reaction channel), persisted in localStorage by the parent. One reaction per
// message; picking the same one again clears it.
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

export function MessageReactions({
  reaction,
  open,
  onOpen,
  onPick,
}: {
  reaction?: string
  open: boolean
  onOpen: () => void
  onPick: (emoji: string) => void
}) {
  return (
    <>
      <button className="react-trigger" type="button" aria-label="React to message" onClick={onOpen}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8" />
          <path d="M9 9.5h.01M15 9.5h.01" />
        </svg>
      </button>
      {open && (
        <div className="react-picker" role="menu">
          {REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              className={`react-opt ${reaction === e ? 'on' : ''}`}
              onClick={() => onPick(e)}
              aria-label={`React ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      {reaction && (
        <span className="react-badge" aria-label={`Reacted ${reaction}`}>
          {reaction}
        </span>
      )}
    </>
  )
}
