# Database

Prisma schema, database client, migrations, and seed scripts for users, matches, moves, replay data, ratings, cosmetics, and future AI coach usage.

This package should stay reusable by the server, scripts, analytics tools, and future workers.

The first schema stores match/player/move history in a way that can support replays, ranked stats, and future ML training exports. It intentionally leaves simulation and model score fields nullable until those systems exist.

Cosmetic tables are data-only foundations for non-pay-to-win unlocks such as card backs, table themes, avatars, profile borders, emotes, and win animations. They support earned, supporter, promotional, and admin-granted unlock sources without changing gameplay power.

Prisma ORM 7 reads the connection URL from `prisma.config.ts`. Keep `DATABASE_URL` out of `schema.prisma` so CLI commands such as `prisma generate`, `prisma migrate dev`, and `prisma studio` use the same config path.

For local migration and seed commands, copy `.env.example` to `.env` in this package and use the database provider's direct, unpooled connection string. The ignored `.env` file is loaded automatically and must never be committed.

```bash
npm run db:generate --workspace @deuces-arena/db
npm run db:migrate --workspace @deuces-arena/db
npm run db:seed --workspace @deuces-arena/db
npm run db:studio --workspace @deuces-arena/db
```
