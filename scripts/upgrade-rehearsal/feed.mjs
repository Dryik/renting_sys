/**
 * The temporary update feed, and the one file that points the disposable copy
 * at it.
 *
 * electron-updater reads its feed from `resources/app-update.yml` inside the
 * installed application. Rewriting that one file in the throwaway install is
 * how the rehearsal redirects the updater without adding a feed override to
 * production code: the shipped main process keeps reading the GitHub provider
 * it always has, and nothing in `electron/` changes.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

/**
 * Serves exactly the three release artifacts over loopback, and records every
 * request so the report can show what the updater actually fetched.
 *
 * Range requests are supported because `differentialPackage` is on: the
 * updater asks for byte ranges of the previous package when it can.
 */
export async function startUpdateFeed(directory, allowedFileNames, { log } = {}) {
  const allowed = new Set(allowedFileNames);
  const requests = [];

  const server = http.createServer((request, response) => {
    const requestedName = decodeURIComponent(
      new URL(request.url, "http://127.0.0.1").pathname.replace(/^\//, ""),
    );

    requests.push({
      at: new Date().toISOString(),
      method: request.method,
      name: requestedName,
      range: request.headers.range ?? null,
    });

    // Logged as it arrives, not at the end. Whether the updater ever asked for
    // latest.yml is the difference between "it never reached the feed" and "it
    // read the feed and decided there was nothing newer", and a run that hangs
    // on idle never reaches the code that reports the requests afterwards.
    log?.(
      `  feed <- ${request.method} ${requestedName}` +
        `${request.headers.range ? ` range ${request.headers.range}` : ""}`,
    );

    // A whitelist, not a static file server: the feed directory sits next to
    // build output and must not become a way to read the rest of the disk.
    if (!allowed.has(requestedName)) {
      response.writeHead(404).end("not part of this feed");
      return;
    }

    const filePath = path.join(directory, requestedName);

    let stats;
    try {
      stats = fs.statSync(filePath);
    } catch {
      response.writeHead(404).end("missing");
      return;
    }

    const range = parseRange(request.headers.range, stats.size);

    if (range) {
      response.writeHead(206, {
        "content-type": "application/octet-stream",
        "content-length": range.end - range.start + 1,
        "content-range": `bytes ${range.start}-${range.end}/${stats.size}`,
        "accept-ranges": "bytes",
      });
      fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(
        response,
      );
      return;
    }

    response.writeHead(200, {
      "content-type": requestedName.endsWith(".yml")
        ? "text/yaml"
        : "application/octet-stream",
      "content-length": stats.size,
      "accept-ranges": "bytes",
    });
    fs.createReadStream(filePath).pipe(response);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const { port } = server.address();

  return {
    port,
    url: `http://127.0.0.1:${port}/`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(resolve);
      }),
  };
}

function parseRange(header, size) {
  if (!header) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());

  if (!match) {
    return null;
  }

  const [, rawStart, rawEnd] = match;

  if (rawStart === "") {
    const length = Number(rawEnd);
    return length > 0 ? { start: Math.max(0, size - length), end: size - 1 } : null;
  }

  const start = Number(rawStart);
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);

  return start <= end ? { start, end } : null;
}

/**
 * Points one installed copy at the loopback feed.
 *
 * The updater cache directory name is carried over from the shipped file
 * rather than invented, so the rehearsal exercises the same cache path a real
 * client uses.
 */
export function redirectInstalledCopyToFeed(resourcesPath, feedUrl) {
  const configPath = path.join(resourcesPath, "app-update.yml");
  const original = fs.readFileSync(configPath, "utf8");
  const cacheDirName = readYamlScalar(original, "updaterCacheDirName");

  const replacement = [
    "# Rewritten by the upgrade rehearsal. This copy is disposable.",
    "provider: generic",
    `url: ${feedUrl}`,
    ...(cacheDirName ? [`updaterCacheDirName: ${cacheDirName}`] : []),
    "",
  ].join("\n");

  fs.writeFileSync(configPath, replacement, "utf8");

  return { configPath, original, replacement };
}

/**
 * Minimal reader for the flat `key: value` lines electron-builder writes.
 * Enough for latest.yml and app-update.yml; deliberately not a YAML parser.
 */
export function readYamlScalar(text, key) {
  const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(text);

  return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : null;
}
