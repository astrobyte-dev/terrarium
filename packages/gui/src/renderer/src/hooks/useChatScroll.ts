import { useLayoutEffect, useRef, useState } from 'react'

/** Follow incoming text only while the reader is already near the bottom. */
export function useChatScroll(content: unknown) {
  const logRef = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const [away, setAway] = useState(false)
  const jumpToLatest = () => {
    following.current = true
    setAway(false)
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }
  const onScroll = () => {
    const log = logRef.current
    if (!log) return
    following.current = log.scrollHeight - log.scrollTop - log.clientHeight < 80
    setAway(!following.current)
  }
  useLayoutEffect(() => {
    if (following.current) jumpToLatest()
  }, [content])
  return { logRef, away, onScroll, jumpToLatest }
}
