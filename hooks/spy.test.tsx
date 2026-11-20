import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'spy',
  component: 'Pane',
  requestId: 'spy',
  props: {
    title: 'spy — live terminal',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('a Bash call shows up with its command and timing', async ($, on) => {
  on('command.register', () => ({ value: { command: 'spy' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const clock = mock.clock(on, { now: 1_000 })
  mock.store(on)
  on('tool.call', async () => (await clock.sleep(250), { result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ran = $.tool.call({ tool: 'Bash', command: 'npm test' })
  await clock.advance(250)
  await ran

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const header = await ui.find({ type: 'Text', text: /1 calls/ })
    expect(header).toBeTruthy()
    const row = await ui.find({ type: 'Text', text: /\$ npm test/ })
    expect(row?.text).toMatch(/Bash.*\$ npm test.*250ms ✓/)
    await ui.unmount()
  }
})

test('an empty log says it is waiting', async $ => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Waiting/ }))?.text).toMatch(
    /Waiting for Claude/,
  )
  await ui.unmount()
})

const RUN = {
  command: 'spy',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

test('/spy off closes the pane, /spy on opens it', async ($, on) => {
  const calls: string[] = []
  mock.store(on)
  on('ui.open', () => (calls.push('open'), { value: { isPlaced: true } }))
  on('ui.close', () => (calls.push('close'), { value: undefined }))

  const off = await $.command.run({ ...RUN, args: 'off' })
  expect(off.text).toMatch(/hidden/)
  const onRes = await $.command.run({ ...RUN, args: 'on' })
  expect(onRes.text).toMatch(/open/)
  expect(calls).toEqual(['close', 'open'])
})
