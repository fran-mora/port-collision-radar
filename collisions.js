class CollisionDetector {
  constructor() {
    this.portMap = new Map();
    this.isFirstScan = true;
  }

  update(ports) {
    const collisions = [];
    const currentPorts = new Set();

    for (const entry of ports) {
      currentPorts.add(entry.port);
      const prev = this.portMap.get(entry.port);

      if (!prev) {
        this.portMap.set(entry.port, {
          ...entry,
          firstSeen: Date.now(),
          status: this.isFirstScan ? 'healthy' : 'new',
          collisionAge: 0,
        });
      } else if (prev.pid !== entry.pid) {
        collisions.push({
          port: entry.port,
          previousProcess: prev.process,
          previousPid: prev.pid,
          currentProcess: entry.process,
          currentPid: entry.pid,
        });
        this.portMap.set(entry.port, {
          ...entry,
          firstSeen: Date.now(),
          status: 'collision',
          collisionAge: 0,
        });
      } else {
        const record = this.portMap.get(entry.port);
        record.collisionAge++;
        if (record.status === 'collision' && record.collisionAge > 3) {
          record.status = 'healthy';
        } else if (record.status === 'new' && record.collisionAge > 2) {
          record.status = 'healthy';
        }
      }
    }

    // Remove ports that are no longer listening
    const toDelete = [];
    for (const port of this.portMap.keys()) {
      if (!currentPorts.has(port)) toDelete.push(port);
    }
    for (const port of toDelete) {
      this.portMap.delete(port);
    }

    this.isFirstScan = false;
    return collisions;
  }

  hasCollisions() {
    for (const record of this.portMap.values()) {
      if (record.status === 'collision') return true;
    }
    return false;
  }

  getPortData() {
    return Array.from(this.portMap.entries()).map(([port, record]) => ({
      port,
      pid: record.pid,
      process: record.process,
      address: record.address,
      status: record.status,
    }));
  }
}

module.exports = { CollisionDetector };
