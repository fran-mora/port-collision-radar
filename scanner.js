function parseLsofOutput(raw) {
  if (!raw || !raw.trim()) return [];
  const lines = raw.trim().split('\n');
  const dataLines = lines.slice(1);
  const seen = new Set();
  const results = [];

  for (const line of dataLines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;
    if (!line.includes('(LISTEN)')) continue;

    const process = parts[0];
    const pid = parseInt(parts[1], 10);

    // NAME field is second-to-last (last is "(LISTEN)")
    const nameField = parts[parts.length - 2];
    const lastColon = nameField.lastIndexOf(':');
    if (lastColon === -1) continue;

    const address = nameField.substring(0, lastColon);
    const port = parseInt(nameField.substring(lastColon + 1), 10);
    if (isNaN(port) || isNaN(pid)) continue;

    // Deduplicate: same port+pid seen on both IPv4 and IPv6
    const key = port + ':' + pid;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({ port, pid, process, address });
  }

  return results;
}

module.exports = { parseLsofOutput };
