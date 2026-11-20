export type SpyLine = {
  id: string
  /** 'turn' marks the start of a turn; 'call' is one tool call. */
  kind: 'turn' | 'call'
  tool: string
  summary: string
  startedAt: number
  /** Milliseconds the call took; undefined while it runs. */
  ms?: number
  status: 'running' | 'ok' | 'error' | 'denied'
  /** Set on calls a subagent made. */
  isSubagent?: boolean
}

export type SpyStats = {
  calls: number
  errors: number
  totalMs: number
  firstAt: number
}

declare module 'claude-code' {
  interface PluginState {
    spy: {
      lines: Shaped<SpyLine[]>
      stats: Shaped<SpyStats>
    }
  }
}
