# Nightfall Seven

Nightfall Seven is an original browser-based zombie survival FPS built with
Three.js, Vite, and TypeScript. Hold a fixed position in a smoke-filled quarantine
district through six escalating nights. Animated shamblers, runners, crawlers, and
brutes advance through the street while weapon recoil, headshots, blood effects,
lighting, audio, and perks build an increasingly intense survival loop.

## Play locally

Requirements:

- Node.js 22
- npm

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Controls

### Desktop

- Mouse — steer
- Left click — fire
- Right click — aim down sights
- `R` — reload
- `1`, `2`, `3` — switch unlocked weapons

### Mobile

- Hold anywhere — aim and fire
- Drag while holding — steer

The survivor stays in place on both desktop and mobile; survival depends on
target priority, accuracy, reload timing, and perk choices.

## Production

```bash
npm run build
npm start
```

The repository produces a static Vite build in `dist` and can be imported
directly into Vercel with no server runtime.

## YouTube Playables package

```bash
npm run pack:playables
```

This rebuilds the game and writes `release/nightfall-seven-playables.zip`, the
archive to upload in the YouTube Playables console. `index.html` sits at the root
of the archive.

The Playables package is the web build minus assets that only matter to
link-unfurling crawlers: `og.png` and its `og:image` tag are dropped, along with
three unreferenced template SVGs. The Vercel deployment keeps them, so social
previews still work there. The script fails the build if a packaged file is
referenced but missing, a file name uses characters outside `A-Za-z0-9._-`, an
absolute path or non-SDK external URL appears in `index.html`, the SDK does not
precede the game module, or the payload exceeds the Playables limits.

The production build loads the YouTube Playables v1 SDK before the game
bundle. YouTube pause/resume events control the simulation, rendering, input,
animations, timers, and Web Audio lifecycle. YouTube's audio setting is the
master audio authority, and build assets use package-safe relative paths.

Player profile data and active-night checkpoints use YouTube Playables cloud
saves exclusively. The game does not use local storage, IndexedDB, cookies, or
another browser persistence fallback.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fahmeddcodd%2Frange-seven)

## Technology

- Vite 8
- TypeScript
- Three.js
- Vanilla HTML and CSS

## Model credits

- FPS AKM rig by J-Toastie
- Zombie character and animation set by bachosoftdesign

Review the original asset licenses before redistributing the included models
outside this project.
