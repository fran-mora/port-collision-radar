# Port Collision Radar — Design

## Overview

A macOS menubar app that continuously monitors listening TCP ports, maps them to processes, and detects collisions. Built with Electron + the `menubar` npm package.

## Architecture

### Main Process (`main.js`)

- Uses `menubar` npm package to create a menubar app with a popover window
- Runs a port scanner on a 3-5 second interval via `lsof -iTCP -sTCP:LISTEN -P -n`
- Parses lsof output into structured data: `{ port, protocol, pid, processName, address }`
- Sends port data to renderer via Electron IPC
- Tracks port history across scans to detect collisions (port ownership changes)
- Menubar icon changes appearance when collisions are detected

### Renderer (`index.html` + `app.js`)

Hybrid UI with two views toggled by the user:

#### Radar View (default)

- Circular radar display with concentric rings for port ranges:
  - Inner ring: well-known ports (0-1023)
  - Middle ring: registered ports (1024-49151)
  - Outer ring: ephemeral ports (49152+)
- Active ports rendered as glowing dots, color-coded by process
- Animated radar sweep line
- Hover tooltip: port number, process name, PID
- Collisions pulse red

#### List View

- Sortable table: Port | Process | PID | Status
- Search/filter bar
- Color-coded status: green (healthy), red (collision), yellow (new)

### Collision Detection

A "collision" is defined as:
- A port that was in use by process A is now in use by process B (ownership change detected across scan intervals)
- Port churn tracking via scan history

## Data Sources (v1)

- System ports only via `lsof -iTCP -sTCP:LISTEN -P -n`
- Maps ports to process names and PIDs
- No Docker integration in v1

## Tech Stack

- Electron (main + renderer process)
- `menubar` npm package for menubar integration
- HTML Canvas or SVG for radar visualization
- Vanilla JS (no framework)
- No build tools beyond npm scripts

## Future (v2+)

- Docker container port mapping
- docker-compose.yml / package.json script parsing for conflict prediction
- Notifications for predicted collisions before service startup
