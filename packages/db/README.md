# Database

Prisma schema, database client, migrations, and seed scripts for users, matches, moves, replay data, ratings, cosmetics, and future AI coach usage.

This package should stay reusable by the server, scripts, analytics tools, and future workers.

The first schema stores match/player/move history in a way that can support replays, ranked stats, and future ML training exports. It intentionally leaves simulation and model score fields nullable until those systems exist.
