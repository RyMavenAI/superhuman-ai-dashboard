# 🧠 Superhuman AI Dashboard

Mission control for Maven AI. Real-time observability into every tool call, memory lookup, and action happening behind the scenes during your WhatsApp conversations.

## Features

- **Real-time activity feed** — see every tool call as it happens via WebSocket
- **Persistent history** — SQLite DB stores all activities across sessions
- **Detail view** — click any activity to see full arguments + result
- **Filter by tool** — drill into specific call types (web searches, file reads, etc.)
- **Stats bar** — total calls, last hour, session count

## How It Works

Reads OpenClaw's session JSONL transcript files from:
```
~/.openclaw/agents/main/sessions/*.jsonl
```
Parses tool calls and results, stores them in SQLite, and pushes live updates via WebSocket.

## Quick Start

```bash
npm install
npm start
# → http://localhost:3000
```

## Stack

- **Backend**: Node.js + Express + WebSocket (ws)
- **DB**: SQLite via better-sqlite3
- **File watching**: chokidar
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
