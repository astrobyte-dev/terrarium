/** One active request per resource. Pending interactive requests precede background work. */
export class RequestQueue {
  private pending: { priority: number; execute: () => Promise<void>; reject: (e: Error) => void; signal?: AbortSignal }[] = []
  private active = false
  get busy(): boolean { return this.active }
  get waiting(): number { return this.pending.length }
  run<T>(work: () => Promise<T>, signal?: AbortSignal, priority = 0): Promise<T> {
    if (signal?.aborted) return Promise.reject(new Error('Request cancelled'))
    return new Promise<T>((resolve, reject) => {
      const item = { priority, signal, reject, execute: async () => { try { resolve(await work()) } catch (e) { reject(e) } } }
      this.pending.push(item)
      this.pending.sort((a, b) => a.priority - b.priority)
      void this.next()
    })
  }
  private async next(): Promise<void> {
    if (this.active) return
    const item = this.pending.shift()
    if (!item) return
    if (item.signal?.aborted) { item.reject(new Error('Request cancelled')); void this.next(); return }
    this.active = true
    try { await item.execute() } finally { this.active = false; void this.next() }
  }
}
