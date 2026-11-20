# spy

A Claude plugin that lets you watch Claude work. `/spy on` opens a live terminal pane beside the chat that streams every tool call Claude makes — shell commands, file reads and edits, searches, web fetches, subagents — each stamped with when it started, how long it took, and whether it succeeded. A header keeps a running tally: total calls, average call time, calls per minute, anything still running and anything that failed. `/spy off` hides the pane until you turn it back on.

```
● spy  42 calls · avg 180ms · 9.3/min · 1 running
──────────────────────────────────────────────────────────────
00:00.0 ▶ add a dark mode toggle to the settings page
00:01.2  Grep   /theme/ src                          41ms ✓
00:01.4  Read   src/settings/Settings.tsx             9ms ✓
00:03.8  Edit   src/settings/Settings.tsx            22ms ✓
00:04.1  Bash   $ npm test -- settings              3.41s ✓
00:07.9 ↳Bash   $ npx tsc --noEmit                  running …
```

## Install

At the prompt of a Claude Code session:

```
/plugin install spy --marketplace wypiek/spy
```

Answer `y` to add the marketplace, then pick a scope.

## Commands

| Command | What it does |
| --- | --- |
| `/spy on` | Open the live terminal pane (and keep it open in future sessions) |
| `/spy off` | Hide the pane until `/spy on` |
| `/spy` | Toggle |
| `/spy clear` | Clear the log and reset the stats |

Closing the pane by hand counts as `/spy off`. The on/off choice is remembered across sessions.

## Legend

- `▶` a new turn, with the prompt that started it
- `✓` done · `✗` failed · `⊘` denied · `…` still running
- `↳` a call made by a subagent
- Times on the left are relative to the first thing spy saw, so you can read the pace at a glance.

## Developing

```
claude --plugin-dir /path/to/spy    # load from a checkout
claude plugin validate .
claude plugin test .
```
