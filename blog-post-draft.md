# I built a radar for your ports

Every developer has been there. You run `npm start` and get hit with:

```
Error: listen EADDRINUSE: address already in use :::3000
```

You sigh. You run `lsof -i :3000`. You kill the rogue process. You move on with your life — until it happens again tomorrow.

I got tired of this. So I built **Port Collision Radar**, a macOS menubar app that watches your listening TCP ports in real-time and tells you the moment something takes over a port it shouldn't.

![Port Collision Radar demo](https://raw.githubusercontent.com/fran-mora/port-collision-radar/main/demo.gif)

## What it actually does

The app sits in your menubar and scans `lsof` every 4 seconds. It tracks which process owns which port. When ownership changes — say, a zombie Node process grabs port 3000 before your dev server can — it flags it as a **collision**.

There are two views:

- **Radar view** — a circular visualization where ports appear as color-coded dots. Inner ring is well-known ports (0–1023), middle ring is registered ports (1024–49151), outer ring is ephemeral. The dots are colored by process, so you can instantly see clustering.
- **List view** — a searchable table with port numbers, process names, PIDs, and status.

Collisions pulse red. New ports glow yellow. Everything else is calm cyan.

## Why a radar?

Because staring at `netstat` output is miserable. I wanted something I could glance at in my menubar and immediately know if something was wrong. The radar metaphor clicked — ports are "out there" on your system, and you're scanning for them.

It's also just... fun? There's something satisfying about watching your ports orbit on a little radar while you work.

## The stack

It's dead simple:

- **Electron** + **menubar** npm package for the macOS menubar integration
- **Vanilla JS** — no React, no framework, no build tools
- **Canvas API** for the radar animation
- **lsof** for port scanning (the same tool you'd use in the terminal)
- **electron-builder** for packaging as a signed + notarized universal dmg

The entire app is ~600 lines of code across 6 files.

## Try it

```bash
brew tap fran-mora/homebrew-tap
brew install --cask port-collision-radar
```

Or grab the `.dmg` from [GitHub Releases](https://github.com/fran-mora/port-collision-radar/releases).

The source is open: [github.com/fran-mora/port-collision-radar](https://github.com/fran-mora/port-collision-radar)

## What's next

A few ideas I'm considering for v2:

- Docker container port mapping awareness
- Network-wide scanning (not just localhost)
- Historical port usage timeline
- Notifications when specific ports get claimed

If any of those sound useful, let me know — or open an issue.

---

*Built with frustration and Electron by [Francesco Moramarco](https://github.com/fran-mora).*
