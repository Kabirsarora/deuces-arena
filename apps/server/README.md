# Realtime Server

Node.js backend for rooms, Socket.IO/WebSocket events, server-authoritative move validation, persistence, and future matchmaking.

The server will validate every multiplayer move through `@deuces-arena/game-engine` and broadcast official game state to connected web or mobile clients.

## Public Status Endpoints

- `GET /health`: service health plus current lobby activity counts.
- `GET /lobby`: public open-room list and live activity snapshot for web, future mobile clients, and deployment monitoring.
