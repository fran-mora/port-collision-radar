const { describe, it } = require('node:test');
const assert = require('node:assert');
const { CollisionDetector } = require('../collisions');

describe('CollisionDetector', () => {
  it('reports no collisions on first scan', () => {
    const detector = new CollisionDetector();
    const ports = [
      { port: 3000, pid: 100, process: 'node', address: '*' },
    ];
    const collisions = detector.update(ports);
    assert.deepStrictEqual(collisions, []);
  });

  it('reports no collision when same process keeps port', () => {
    const detector = new CollisionDetector();
    const ports = [
      { port: 3000, pid: 100, process: 'node', address: '*' },
    ];
    detector.update(ports);
    const collisions = detector.update(ports);
    assert.deepStrictEqual(collisions, []);
  });

  it('detects collision when different process takes over a port', () => {
    const detector = new CollisionDetector();
    detector.update([
      { port: 3000, pid: 100, process: 'node', address: '*' },
    ]);
    const collisions = detector.update([
      { port: 3000, pid: 200, process: 'python3', address: '*' },
    ]);
    assert.strictEqual(collisions.length, 1);
    assert.strictEqual(collisions[0].port, 3000);
    assert.strictEqual(collisions[0].previousProcess, 'node');
    assert.strictEqual(collisions[0].currentProcess, 'python3');
  });

  it('tracks new ports as status "new"', () => {
    const detector = new CollisionDetector();
    detector.update([
      { port: 3000, pid: 100, process: 'node', address: '*' },
    ]);
    detector.update([
      { port: 3000, pid: 100, process: 'node', address: '*' },
      { port: 8080, pid: 200, process: 'python3', address: '*' },
    ]);
    const data = detector.getPortData();
    const p3000 = data.find(d => d.port === 3000);
    const p8080 = data.find(d => d.port === 8080);
    assert.strictEqual(p3000.status, 'healthy');
    assert.strictEqual(p8080.status, 'new');
  });

  it('clears collision status after a few scans', () => {
    const detector = new CollisionDetector();
    detector.update([
      { port: 3000, pid: 100, process: 'node', address: '*' },
    ]);
    detector.update([
      { port: 3000, pid: 200, process: 'python3', address: '*' },
    ]);
    assert.strictEqual(detector.hasCollisions(), true);

    for (let i = 0; i < 5; i++) {
      detector.update([
        { port: 3000, pid: 200, process: 'python3', address: '*' },
      ]);
    }
    assert.strictEqual(detector.hasCollisions(), false);
    const data = detector.getPortData();
    assert.strictEqual(data.find(d => d.port === 3000).status, 'healthy');
  });

  it('removes ports that stop listening', () => {
    const detector = new CollisionDetector();
    detector.update([
      { port: 3000, pid: 100, process: 'node', address: '*' },
      { port: 5432, pid: 200, process: 'postgres', address: '*' },
    ]);
    detector.update([
      { port: 3000, pid: 100, process: 'node', address: '*' },
    ]);
    const data = detector.getPortData();
    assert.strictEqual(data.length, 1);
    assert.strictEqual(data[0].port, 3000);
  });

  it('hasCollisions returns false when no collisions exist', () => {
    const detector = new CollisionDetector();
    detector.update([
      { port: 3000, pid: 100, process: 'node', address: '*' },
    ]);
    assert.strictEqual(detector.hasCollisions(), false);
  });
});
