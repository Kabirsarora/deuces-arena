# Web App

Next.js frontend for Deuces Arena.

This app should stay focused on presentation, interaction, and client-side orchestration. Core game rules, move validation, bots, simulations, replay data contracts, and server authority belong in shared packages so a future Expo app can reuse them.

Online rooms support shareable invite URLs with a `?room=ROOMCODE` query parameter. The web app reads that query parameter on load, fills the join form, and updates the URL after a room is created or joined.
