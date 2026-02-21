# Port Collision Radar

**A macOS menubar app that watches your listening ports so you don't have to.**

<!-- TODO: Add demo GIF here -->

## What it does

Port Collision Radar sits in your menubar and continuously scans for TCP ports in LISTEN state. When two processes fight over the same port, it lights up red. You get a live radar visualization, a sortable list view, and instant collision alerts -- all without opening a terminal.

## Features

- Animated radar display -- ports mapped by number, color-coded by process
- Real-time collision detection when a port's owning process changes
- Menubar tray icon that turns red on collisions
- Sortable, filterable list view as an alternative to the radar
- Hover tooltips showing port, process name, PID, and bind address
- Scans every 4 seconds with zero configuration
- Lightweight Electron app, runs as a background agent (no Dock icon)

## Install

### Homebrew (recommended)

```sh
brew tap fran-mora/homebrew-tap
brew install --cask port-collision-radar
```

### Manual

Download the latest `.dmg` from [GitHub Releases](https://github.com/fran-mora/port-collision-radar/releases), open it, and drag to Applications.

## How it works

Every 4 seconds the app shells out to `lsof -iTCP -sTCP:LISTEN -P -n` and parses the output to build a map of port -> process. A `CollisionDetector` tracks state across scans: if a port that was owned by process A is now owned by process B, that's a collision. Ports age through `new` -> `healthy` status, and collisions auto-resolve after a few clean scans.

The radar maps port numbers (0--65535) to angle and uses concentric rings for well-known (0--1023), registered (1024--49151), and ephemeral (49152+) ranges. The tray icon is a hand-built PNG generated pixel-by-pixel at runtime -- no image assets required.

## Building from source

```sh
git clone https://github.com/fran-mora/port-collision-radar.git
cd port-collision-radar
npm install
npm start          # run in dev mode
npm test           # run unit tests
npm run build      # produce a universal .dmg in dist/
```

Requires Node.js 18+ and Xcode Command Line Tools.

## License

[MIT](LICENSE)
