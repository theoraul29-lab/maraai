# mini-maraai

A self-contained, in-memory prototype of the Mara AI conversation engine.

## Overview

`mini-maraai` is an early standalone proof-of-concept written as a single
Express server (`server.js`). It demonstrates three core capabilities:

- **Chat** — conversational responses powered by OpenAI `gpt-4o-mini` with
  an in-memory conversation history.
- **Learning** — ingest raw text documents, chunk them, extract bullet-point
  ideas via LLM, and store them in a simple in-memory knowledge base.
- **Autonomous reflection** — a background loop (every 60 s) synthesises new
  insights from recent knowledge base entries.

> **Note:** All state is held in process memory. Restarting the server clears
> the knowledge base and chat history. For persistence, use the main
> `maraai` application which stores everything in SQLite via Drizzle ORM.

## Prerequisites

- Node.js ≥ 18
- An OpenAI API key with access to `gpt-4o-mini`

## Setup

```bash
cd mini-maraai
npm install
cp .env.example .env   # then fill in OPENAI_API_KEY
```

## Running

```bash
node server.js
# Server starts on http://localhost:3000 (or $PORT)
```

## API

| Method | Path     | Body                                      | Description                        |
|--------|----------|-------------------------------------------|------------------------------------|
| GET    | `/`      | —                                         | Health check                       |
| POST   | `/chat`  | `{ "message": "Hello Mara" }`             | Send a message, receive a reply    |
| POST   | `/learn` | `{ "content": "...", "title": "Doc A" }` | Feed a document into the knowledge base |

## Environment variables

| Variable         | Required | Description                    |
|------------------|----------|--------------------------------|
| `OPENAI_API_KEY` | Yes      | OpenAI API key                 |
| `PORT`           | No       | HTTP port (default: `3000`)    |
