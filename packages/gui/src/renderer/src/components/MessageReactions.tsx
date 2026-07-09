// Facebook-style message reactions. GUI-only (the shared gateway/Telegram session has
// no reaction channel), persisted in localStorage by the parent. One reaction per
// message; picking the same one again clears it.
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

export function MessageReactions({
  reaction,
  open,
  onPick,
}: {
  reaction?: string
  open: boolean
  onPick: (emoji: string) => void
}) {
  return (
    <>
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
