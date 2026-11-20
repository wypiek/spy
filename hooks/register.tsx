import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SpyLine, SpyStats } from '../types'

const PANE = 'spy'
const TITLE = 'spy — live terminal'
const KEEP = 400

// Bump a tag when its value's fields change: an older stored value is declined.
const lines = atom({ plugin: 'spy', key: 'lines' } as const, [], {
  shape: 'lines-1',
})
const stats = atom(
  { plugin: 'spy', key: 'stats' } as const,
  { calls: 0, errors: 0, totalMs: 0, firstAt: 0 },
  { shape: 'stats-1' },
)

// Terminal palette: phosphor green on near-black.
const BG = '#0b0f0c'
const FG = '#3dff7a'
const DIM = '#5f7f68'
const AMBER = '#ffcc4d'
const RED = '#ff5f56'
const CYAN = '#5fd7ff'

const isEnabled = async ($: EngineInterface) =>
  (await $.store.get('enabled')) === true

const open = ($: EngineInterface) => $.ui.open({ id: PANE, title: TITLE })

/** One line saying what a tool call is doing, the way a terminal would echo it. */
const summarize = (e: Record<string, unknown>): string => {
  const s = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : '')
  switch (e.tool) {
    case 'Bash':
      return `$ ${s('command').replace(/\s+/g, ' ')}`
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit':
      return s('file_path') || s('notebook_path')
    case 'Grep':
      return `/${s('pattern')}/ ${s('path') || s('glob')}`.trim()
    case 'Glob':
      return s('pattern')
    case 'WebFetch':
      return s('url')
    case 'WebSearch':
      return s('query')
    case 'Agent':
    case 'Task':
      return s('description') || s('prompt')
    case 'Skill':
      return s('skill')
    default: {
      const first = Object.entries(e).find(
        ([k, v]) =>
          !['tool', 'tool_use_id', 'agentId', 'requestMeta'].includes(k) &&
          (typeof v === 'string' || typeof v === 'number'),
      )

      return first ? `${first[0]}=${String(first[1])}` : ''
    }
  }
}

export const fmtMs = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`
  const m = Math.floor(ms / 60_000)
  const sec = Math.round((ms % 60_000) / 1000)

  return `${m}m${String(sec).padStart(2, '0')}s`
}

/** Session-relative clock, mm:ss.t, so the pace is readable at a glance. */
const fmtClock = (ms: number): string => {
  const t = Math.max(0, ms)
  const m = Math.floor(t / 60_000)
  const sec = Math.floor((t % 60_000) / 1000)
  const tenth = Math.floor((t % 1000) / 100)

  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${tenth}`
}

const clip = (text: string, width: number) =>
  width <= 1 ? '' : text.length > width ? `${text.slice(0, width - 1)}…` : text

const push = ($: EngineInterface, line: SpyLine) =>
  update($, lines, list => [...list, line].slice(-KEEP))

const markStart = async ($: EngineInterface, now: number) => {
  const st = await read($, stats)
  if (st.firstAt === 0) await update($, stats, s => ({ ...s, firstAt: now }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'spy',
      description: 'Watch Claude work live: /spy on | off | clear',
    })
    if (await isEnabled($)) void open($)

    return next(e)
  })

  on('command.run', { command: 'spy' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const wantOn = arg === '' ? !(await isEnabled($)) : arg === 'on'

    if (arg === 'clear') {
      await update($, lines, () => [])
      await update($, stats, () => ({
        calls: 0,
        errors: 0,
        totalMs: 0,
        firstAt: 0,
      }))

      return { text: 'spy: log cleared.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /spy on | /spy off | /spy clear' }
    }

    await $.store.set('enabled', wantOn)
    if (!wantOn) {
      await $.ui.close({ id: PANE })

      return { text: 'spy: terminal hidden. /spy on to bring it back.' }
    }
    const opened = await open($)

    return {
      text: opened.isPlaced
        ? 'spy: terminal open — watching every tool call live.'
        : `spy: on, but the pane is not shown yet (${opened.reason}).`,
    }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    // Closing the pane by hand counts as /spy off, so it stays hidden.
    if (e.origin.kind === 'person') await $.store.set('enabled', false)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await markStart($, now)
      await push($, {
        id: e.turnId,
        kind: 'turn',
        tool: '',
        summary: e.text.replace(/\s+/g, ' '),
        startedAt: now,
        status: 'ok',
      })
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const startedAt = await $.clock.now()
    await markStart($, startedAt)
    const id = e.tool_use_id || `${e.tool}-${startedAt}`
    await push($, {
      id,
      kind: 'call',
      tool: e.tool,
      summary: summarize(e as unknown as Record<string, unknown>),
      startedAt,
      status: 'running',
      isSubagent: e.agentId !== undefined || undefined,
    })

    const finish = async (status: SpyLine['status']) => {
      const ms = (await $.clock.now()) - startedAt
      await update($, lines, list =>
        list.map(l => (l.id === id ? { ...l, ms, status } : l)),
      )
      await update($, stats, s => ({
        ...s,
        calls: s.calls + 1,
        errors: s.errors + (status === 'ok' ? 0 : 1),
        totalMs: s.totalMs + ms,
      }))
    }

    try {
      const ran = await next(e)
      await finish(
        ran.deny !== undefined ? 'denied' : ran.isError ? 'error' : 'ok',
      )

      return ran
    } catch (err) {
      await finish('error')
      throw err
    }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, lines)
    const st = await read($, stats)
    const cols = Math.max(20, e.props.bodyColumns)
    const rows = Math.max(3, (e.props.scroll?.bodyRows ?? 24) - 3)

    const elapsed = st.firstAt ? (await $.clock.now()) - st.firstAt : 0
    const avg = st.calls ? st.totalMs / st.calls : 0
    const perMin = elapsed > 0 ? (st.calls / elapsed) * 60_000 : 0
    const running = list.filter(l => l.status === 'running').length
    const header =
      `${st.calls} calls · avg ${fmtMs(avg)} · ${perMin.toFixed(1)}/min` +
      (running ? ` · ${running} running` : '') +
      (st.errors ? ` · ${st.errors} failed` : '')

    const t0 = st.firstAt
    const shown = list.slice(-rows)

    return (
      <Box flexDirection="column" backgroundColor={BG} paddingX={1}>
        <Text color={CYAN} mono weight="bold">
          {clip(`● spy  ${header}`, cols - 2)}
        </Text>
        <Text color={DIM} mono>
          {'─'.repeat(Math.max(1, cols - 2))}
        </Text>
        {shown.length === 0 && (
          <Text color={DIM} mono>
            Waiting for Claude to do something…
          </Text>
        )}
        {shown.map(line => {
          const clock = fmtClock(line.startedAt - t0)
          if (line.kind === 'turn') {
            return (
              <Text color={AMBER} mono>
                {clip(`${clock} ▶ ${line.summary || '(continuing)'}`, cols - 2)}
              </Text>
            )
          }
          const mark =
            line.status === 'running'
              ? '…'
              : line.status === 'ok'
                ? '✓'
                : line.status === 'denied'
                  ? '⊘'
                  : '✗'
          const took = line.ms === undefined ? 'running' : fmtMs(line.ms)
          const tail = ` ${took.padStart(7)} ${mark}`
          const head = `${clock} ${line.isSubagent ? '↳' : ' '}${line.tool.padEnd(6)} `
          const room = cols - 2 - head.length - tail.length
          const body = clip(line.summary, room).padEnd(Math.max(0, room))
          const color =
            line.status === 'running'
              ? AMBER
              : line.status === 'ok'
                ? FG
                : RED

          return (
            <Text color={color} mono>
              <Text color={DIM}>{head}</Text>
              {body}
              <Text color={line.status === 'ok' ? DIM : color}>{tail}</Text>
            </Text>
          )
        })}
      </Box>
    )
  })
}
