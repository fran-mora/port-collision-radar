const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseLsofOutput } = require('../scanner');

describe('parseLsofOutput', () => {
  it('parses a single listening port', () => {
    const raw = `COMMAND   PID   USER   FD   TYPE   DEVICE SIZE/OFF NODE NAME
node    12345   user   22u  IPv4  0x1234   0t0  TCP *:3000 (LISTEN)`;
    const result = parseLsofOutput(raw);
    assert.deepStrictEqual(result, [{
      port: 3000,
      pid: 12345,
      process: 'node',
      address: '*',
    }]);
  });

  it('parses multiple listening ports', () => {
    const raw = `COMMAND   PID   USER   FD   TYPE   DEVICE SIZE/OFF NODE NAME
node    12345   user   22u  IPv4  0x1234   0t0  TCP *:3000 (LISTEN)
postgres  6789   user   5u  IPv6  0x5678   0t0  TCP [::1]:5432 (LISTEN)
python3  11111   user   3u  IPv4  0x9abc   0t0  TCP 127.0.0.1:8000 (LISTEN)`;
    const result = parseLsofOutput(raw);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].port, 3000);
    assert.strictEqual(result[0].process, 'node');
    assert.strictEqual(result[1].port, 5432);
    assert.strictEqual(result[1].process, 'postgres');
    assert.strictEqual(result[1].address, '[::1]');
    assert.strictEqual(result[2].port, 8000);
    assert.strictEqual(result[2].address, '127.0.0.1');
  });

  it('returns empty array for empty output', () => {
    const result = parseLsofOutput('');
    assert.deepStrictEqual(result, []);
  });

  it('skips malformed lines', () => {
    const raw = `COMMAND   PID   USER   FD   TYPE   DEVICE SIZE/OFF NODE NAME
this is not valid
node    12345   user   22u  IPv4  0x1234   0t0  TCP *:3000 (LISTEN)`;
    const result = parseLsofOutput(raw);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].port, 3000);
  });

  it('deduplicates same port+pid on IPv4 and IPv6', () => {
    const raw = `COMMAND   PID   USER   FD   TYPE   DEVICE SIZE/OFF NODE NAME
node    12345   user   22u  IPv4  0x1234   0t0  TCP *:3000 (LISTEN)
node    12345   user   23u  IPv6  0x5678   0t0  TCP [::]:3000 (LISTEN)`;
    const result = parseLsofOutput(raw);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].port, 3000);
  });

  it('keeps different processes on the same port', () => {
    const raw = `COMMAND   PID   USER   FD   TYPE   DEVICE SIZE/OFF NODE NAME
node    12345   user   22u  IPv4  0x1234   0t0  TCP *:3000 (LISTEN)
node    67890   user   23u  IPv4  0x5678   0t0  TCP 127.0.0.1:3000 (LISTEN)`;
    const result = parseLsofOutput(raw);
    assert.strictEqual(result.length, 2);
  });
});
