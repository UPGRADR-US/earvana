# earvana: tinnitus relief

A calm ambient sound mixer where users can layer multiple nature audio tracks simultaneously, each looping seamlessly with crossfade so there are never any gaps or jarring cuts.

## Run & Operate

- `pnpm --filter @workspace/nature-sounds run dev` — run the frontend (port assigned by workflow)
- `pnpm run typecheck` — full typecheck across all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (react-vite artifact)
- Audio: Web Audio API (no third-party audio libraries)
- Styling: Tailwind CSS + shadcn/ui

## Where things live

- `artifacts/nature-sounds/src/sounds.ts` — track definitions (names, file paths, icons); edit this to add/remove tracks
- `artifacts/nature-sounds/src/hooks/useAudioEngine.ts` — Web Audio API crossfade loop engine
- `artifacts/nature-sounds/src/App.tsx` — main UI
- `artifacts/nature-sounds/src/index.css` — theme / color palette
- `artifacts/nature-sounds/public/sounds/` — drop your .mp3/.ogg audio files here

## How to add audio tracks

1. Drop your audio files (MP3 or OGG recommended) into `artifacts/nature-sounds/public/sounds/`
2. Edit `artifacts/nature-sounds/src/sounds.ts` — add an entry to the `TRACKS` array with the filename matching your file
3. The app will pick it up automatically on next reload

## Architecture decisions

- Web Audio API is used instead of HTML `<audio>` elements to enable precise gain scheduling for crossfade
- Each track has its own crossfade engine: two AudioBufferSourceNodes ping-pong with overlapping gain ramps (CROSSFADE_DURATION = 3s)
- Audio context is created on first user interaction (browser autoplay policy requirement)
- Per-track GainNode → master GainNode → AudioContext.destination signal chain
- Missing or undecodable audio files show a warning state on the card without crashing

## Product

Users open the app and play one or more ambient nature sounds — rain, forest, ocean waves, campfire, wind, thunder, stream, or night crickets. Each sound loops forever with a smooth crossfade so it sounds like a continuous, natural environment. Tracks can be layered and mixed with independent volume controls.

## User preferences

- User supplies their own audio track files (drop into `public/sounds/`)

## Gotchas

- Browser autoplay policy: AudioContext must be created inside a user gesture (click). The hook handles this automatically.
- Audio files must be in `public/sounds/` and their filenames must match the `file` field in `src/sounds.ts`
- Crossfade timing assumes audio files are longer than CROSSFADE_DURATION (3 seconds). Very short clips will still loop but the crossfade overlap may be audible.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
