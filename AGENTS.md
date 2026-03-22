# Project: Morupark Queue Frontend

## Purpose
- Build a frontend for a queue system used for a product giveaway event.
- The backend is already complete; this repository is frontend only.

## Design Reference
- Use the UI from `morupark_design.png` as the visual baseline.
- The original theme is concert ticketing, but the new theme is a product-reward event.

## Tech Stack
- React (no other constraints yet).

## Core Screens (Initial)
- Queue status screen (main): shows waiting state, queue number, progress bar, ETA, total waiting count, and estimated wait rate.
- Actions: refresh, cancel.

## Content Notes
- Replace concert-related copy with product-reward event wording.
- Keep Korean as the primary language unless otherwise requested.

## Integration
- Connect to existing backend APIs for queue status and actions.
- Use real-time updates if the backend exposes them; otherwise poll at a reasonable interval.

## Open Questions (for later)
- Exact API endpoints and payloads.
- Auth/session requirements (if any).
- Brand colors/typography beyond the reference design.
