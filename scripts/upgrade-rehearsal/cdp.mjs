/**
 * A minimal Chrome DevTools Protocol client, just enough to evaluate
 * expressions inside a packaged application's renderer.
 *
 * The renderer smoke can call `webContents.executeJavaScript` because it runs
 * the main process in-process. The rehearsal cannot: the application under
 * test is a separate installed executable, so the only way in is the debugging
 * port it is launched with.
 *
 * Node 22 ships a global WebSocket, so this needs no dependency.
 */
import { setTimeout as delay } from "node:timers/promises";

/**
 * Waits for the debugging port to answer, then attaches to the first page
 * target. A packaged Electron app exposes one page per BrowserWindow.
 */
export async function connectToApp(port, { timeoutMs = 60_000, log } = {}) {
  const target = await waitForPageTarget(port, timeoutMs, log);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;
  let closedReason = null;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    const entry = pending.get(message.id);

    if (!entry) {
      return;
    }

    pending.delete(message.id);

    if (message.error) {
      entry.reject(new Error(`CDP error: ${JSON.stringify(message.error)}`));
      return;
    }

    entry.resolve(message.result);
  });

  socket.addEventListener("close", () => {
    closedReason ??= "the debugging socket closed";
    for (const entry of pending.values()) {
      entry.reject(new Error(closedReason));
    }
    pending.clear();
  });

  await waitForOpen(socket);

  function send(method, params = {}) {
    if (socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(closedReason ?? "the socket is not open"));
    }

    const id = nextId++;

    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  return {
    target,

    /**
     * Evaluates an expression in the page and returns its value. Promises are
     * awaited, so callers can hand over an async IIFE the way the renderer
     * smoke does.
     */
    async evaluate(expression) {
      const result = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        // The seeding steps call into IPC, which can take a while on a cold
        // runner; the default would give up too early.
        timeout: 120_000,
      });

      if (result.exceptionDetails) {
        const text =
          result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text;
        throw new Error(`page threw: ${text}`);
      }

      return result.result?.value;
    },

    /** True while the page is still answering. */
    get connected() {
      return socket.readyState === WebSocket.OPEN;
    },

    close(reason = "closed by the rehearsal") {
      closedReason = reason;
      try {
        socket.close();
      } catch {
        // Already gone; nothing to do.
      }
    },
  };
}

/**
 * A packaged app takes a moment to open its window, and the first launch also
 * runs migrations, so this polls rather than assuming the port is immediately
 * live.
 */
async function waitForPageTarget(port, timeoutMs, log) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "no response yet";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find(
        (candidate) =>
          candidate.type === "page" && candidate.webSocketDebuggerUrl,
      );

      if (page) {
        return page;
      }

      lastError = `the port answered with ${targets.length} target(s), none a page`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    log?.(`  waiting for the debugging port on ${port}: ${lastError}`);
    await delay(1000);
  }

  throw new Error(
    `no debuggable page appeared on port ${port} within ${Math.round(
      timeoutMs / 1000,
    )}s (${lastError})`,
  );
}

function waitForOpen(socket) {
  if (socket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("could not open the debugging socket")),
      { once: true },
    );
  });
}

/**
 * Polls an expression until it reports done. Used for the update sequence,
 * where progress arrives as main-process events the page records.
 */
export async function pollUntil(client, expression, isDone, { timeoutMs, intervalMs = 1000, log }) {
  const deadline = Date.now() + timeoutMs;
  let last;

  while (Date.now() < deadline) {
    last = await client.evaluate(expression);

    if (isDone(last)) {
      return last;
    }

    log?.(`  ${JSON.stringify(last)}`);
    await delay(intervalMs);
  }

  throw new Error(
    `gave up after ${Math.round(timeoutMs / 1000)}s; last value ${JSON.stringify(last)}`,
  );
}
