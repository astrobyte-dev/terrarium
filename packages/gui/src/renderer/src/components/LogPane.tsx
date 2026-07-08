import { useState } from 'react'
import type { LogLine } from '../data/types'

const FILTERS = ['all', 'gateway', 'ollama', 'comfyui', 'daemon'] as const

export function LogPane({ logs }: { logs: LogLine[] }) {
  const [filter, setFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState(false)
  const shown = filter === 'all' ? logs : logs.filter((l) => l.svc === filter)
  return (
    <section className={`logs ${expanded ? 'expanded' : ''}`}>
      <div className="lhead">
        <span className="lt">Unified log</span>
        <div className="filters">
          {FILTERS.map((f) => (
            <button key={f} className={f === filter ? 'on' : ''} type="button" onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <button
          className="log-expand"
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Collapse log' : 'Expand log'}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▾' : '▴'}
        </button>
      </div>
      <div className="logbody">
        {shown.length === 0 ? (
          <div className="log-empty">No recent log activity — lines appear here as your services log.</div>
        ) : (
          shown.map((l) => (
            <div className="logline" key={l.id}>
              <span className="ts">{l.ts}</span>
              <span className={`tag tag-${l.svc}`}>{l.svc}</span>
              <span className="msg">{l.msg}</span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
