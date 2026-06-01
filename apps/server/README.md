# Realtime Server

Node.js backend for rooms, Socket.IO/WebSocket events, server-authoritative move validation, persistence, and future matchmaking.

The server will validate every multiplayer move through `@deuces-arena/game-engine` and broadcast official game state to connected web or mobile clients.

Waiting rooms track player ready states before multiplayer games start. A solo player can still start immediately with bot fill, while multi-human rooms require connected humans to be ready first.

## Public Status Endpoints

- `GET /health`: service health plus current lobby activity counts.
- `GET /lobby`: public open-room list and live activity snapshot for web, future mobile clients, and deployment monitoring.
