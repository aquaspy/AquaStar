const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');
const capture = require('../../res/nativeWindowCapture.js');

const MOVIE = 'https://example.test/a/movie.swf?ver=b';
const OTHER = 'https://example.test/other.swf';

const MESSAGES = {};
capture.REASONS.forEach((reason) => {
  MESSAGES[capture.messageKey(reason)] = 'msg:' + reason;
});

function fakeWin(id) {
  const listeners = {};
  return {
    id,
    once(event, fn) {
      (listeners[event] || (listeners[event] = [])).push(fn);
    },
    emit(event) {
      const list = listeners[event] || [];
      listeners[event] = [];
      list.forEach((fn) => fn());
    },
    isDestroyed() {
      return false;
    }
  };
}

function fakeChild(pid) {
  const handlers = { exit: [], error: [] };
  return {
    pid,
    exitCode: null,
    handlers,
    once(event, fn) {
      (handlers[event] || (handlers[event] = [])).push(fn);
    },
    emit(event) {
      const list = handlers[event] || [];
      handlers[event] = [];
      list.forEach((fn) => fn());
    }
  };
}

function src(id, name) {
  return { id, name };
}

function owned(pid, nativeId, title) {
  return { pid, nativeId, title };
}

function setup(partial) {
  const seen = { sources: [], grabs: [], sleeps: 0, lists: 0, access: 0 };
  const extra = partial || {};
  const cap = capture.createCapture({
    listWindows: async (pid) => {
      seen.lists += 1;
      return extra.listWindows ? extra.listWindows(pid, seen) : { ok: false };
    },
    getSources: async (opts) => {
      seen.sources.push(opts);
      return extra.getSources ? extra.getSources(opts, seen) : [];
    },
    grabFrame: async (win, sourceId) => {
      seen.grabs.push(sourceId);
      return extra.grabFrame ? extra.grabFrame(win, sourceId) : Buffer.from([1, 2, 3]);
    },
    screenAccess() {
      seen.access += 1;
      return extra.screenAccess ? extra.screenAccess(seen) : 'granted';
    },
    session: () => (extra.session ? extra.session() : 'x11'),
    sleep: async () => {
      seen.sleeps += 1;
    },
    foregroundPid: async () => (extra.foregroundPid ? extra.foregroundPid() : null),
    messages: extra.messages || MESSAGES
  });
  return { cap, seen };
}

function play(partial, pid, swfUrl) {
  const ctx = setup(partial);
  const win = fakeWin(1);
  const child = fakeChild(pid == null ? 10 : pid);
  const session = ctx.cap.open(win);
  session.spawned(child, swfUrl || MOVIE);
  return Object.assign(ctx, { win, child, session });
}

function playerListed(nativeId, title) {
  return {
    listWindows: async () => ({ ok: true, windows: [owned(10, nativeId, title)] }),
    getSources: async () => [src('window:' + nativeId, title)]
  };
}

test('requiring the capture module does not load electron', () => {
  const root = path.join(__dirname, '../..');
  const script = [
    "const cap = require('./res/nativeWindowCapture.js');",
    'function loaded() {',
    '  return Object.keys(require.cache).some(function (item) {',
    "    return item.indexOf('node_modules/electron') !== -1 || item.indexOf('node_modules\\\\electron') !== -1;",
    '  });',
    '}',
    "if (loaded()) { console.error('electron loaded on require'); process.exit(2); }",
    'cap.createCapture({',
    '  listWindows: function () { return Promise.resolve({ ok: false }); },',
    '  getSources: function () { return Promise.resolve([]); },',
    '  grabFrame: function () { return Promise.resolve(null); },',
    "  screenAccess: function () { return 'skipped'; },",
    "  session: function () { return 'other'; },",
    '  messages: {',
    "    nativeCaptureStarting: 's',",
    "    nativeCaptureClosed: 'c',",
    "    nativeCaptureMacosDenied: 'm',",
    "    nativeCaptureWayland: 'w',",
    "    nativeCaptureAmbiguous: 'a',",
    "    nativeCaptureNoWindow: 'n',",
    "    nativeCaptureEmptyFrame: 'e'",
    '  }',
    '});',
    "if (loaded()) { console.error('electron loaded on createCapture'); process.exit(3); }",
    "console.log('ok');"
  ].join('\n');
  const out = execFileSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(out.trim(), 'ok');
});

test('a window that was never opened stays on the page route and does not list sources', async () => {
  const { cap, seen } = setup();
  const still = await cap.captureStill(fakeWin(9));
  assert.strictEqual(still.route, 'page');
  assert.deepStrictEqual(seen.sources, []);
  assert.strictEqual(seen.lists, 0);
  assert.deepStrictEqual(seen.grabs, []);
  const verdict = await cap.recordingSource(fakeWin(8));
  assert.strictEqual(verdict.route, 'page');
  assert.deepStrictEqual(seen.sources, []);
});

test('a destroyed native window stays on the page route', async () => {
  const win = fakeWin(3);
  win.isDestroyed = () => true;
  const { cap, seen } = setup(playerListed('7', 'Ruffle - movie.swf'));
  cap.open(win).spawned(fakeChild(10), MOVIE);
  const still = await cap.captureStill(win);
  assert.strictEqual(still.route, 'page');
  assert.deepStrictEqual(seen.sources, []);
});

test('closing the companion drops the session', async () => {
  const win = fakeWin(4);
  const { cap, seen } = setup(playerListed('7', 'Ruffle - movie.swf'));
  cap.open(win).spawned(fakeChild(10), MOVIE);
  win.emit('closed');
  const still = await cap.captureStill(win);
  assert.strictEqual(still.route, 'page');
  assert.deepStrictEqual(seen.sources, []);
});

test('opening the same window twice keeps the playing session', async () => {
  const ctx = play(playerListed('7', 'Ruffle - movie.swf'));
  assert.strictEqual(ctx.cap.open(ctx.win), ctx.session);
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.route, 'source');
  assert.strictEqual(verdict.sourceId, 'window:7');
});

test('a desktop player that is still starting blocks without listing windows', async () => {
  const { cap, seen } = setup();
  const win = fakeWin(1);
  cap.open(win);
  const still = await cap.captureStill(win);
  assert.strictEqual(still.route, 'blocked');
  assert.strictEqual(still.reason, 'starting');
  assert.strictEqual(still.message, 'msg:starting');
  assert.deepStrictEqual(seen.sources, []);
  assert.strictEqual(seen.access, 0);
  assert.deepStrictEqual(seen.grabs, []);
});

test('starting again while the player is live keeps that child', async () => {
  const ctx = play(playerListed('7', 'Ruffle - movie.swf'));
  ctx.session.starting();
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.route, 'source');
  assert.strictEqual(verdict.sourceId, 'window:7');
  assert.strictEqual(verdict.title, 'Ruffle - movie.swf');
  ctx.child.emit('exit');
  const closed = await ctx.cap.captureStill(ctx.win);
  assert.strictEqual(closed.reason, 'closed');
  assert.strictEqual(closed.message, 'msg:closed');
});

test('starting after the player exits blocks as starting', async () => {
  const ctx = play(playerListed('7', 'Ruffle - movie.swf'));
  ctx.child.exitCode = 3;
  ctx.session.starting();
  const still = await ctx.cap.captureStill(ctx.win);
  assert.strictEqual(still.reason, 'starting');
  assert.deepStrictEqual(ctx.seen.sources, []);
});

test('an invalid child leaves the slot and does not throw', async () => {
  const { cap } = setup();
  const win = fakeWin(1);
  const session = cap.open(win);
  assert.doesNotThrow(() => session.spawned({ pid: 0, once() {} }, MOVIE));
  assert.doesNotThrow(() => session.spawned({ pid: 1.2, once() {} }, MOVIE));
  assert.doesNotThrow(() => session.spawned({ pid: 4, once() {} }, null));
  assert.doesNotThrow(() => session.spawned(null, MOVIE));
  const still = await cap.captureStill(win);
  assert.strictEqual(still.reason, 'starting');
});

test('a pid and a matching title resolve to that source id', async () => {
  const png = Buffer.from([9, 8, 7, 6]);
  const ctx = play({
    listWindows: async () => ({ ok: true, windows: [owned(10, '7', 'Ruffle - movie.swf')] }),
    getSources: async () => [src('window:7', 'Ruffle - movie.swf')],
    grabFrame: async (_win, sourceId) => {
      assert.strictEqual(sourceId, 'window:7');
      return png;
    }
  });
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.route, 'source');
  assert.strictEqual(verdict.sourceId, 'window:7');
  assert.strictEqual(verdict.title, 'Ruffle - movie.swf');
  assert.deepStrictEqual(ctx.seen.grabs, []);
  assert.deepStrictEqual(ctx.seen.sources[0], {
    types: ['window'],
    thumbnailSize: { width: 0, height: 0 }
  });
  const still = await ctx.cap.captureStill(ctx.win);
  assert.strictEqual(still.route, 'png');
  assert.strictEqual(still.png, png);
  assert.deepStrictEqual(ctx.seen.grabs, ['window:7']);
});

test('recordingSource asks again instead of reusing a source id', async () => {
  const ctx = play(playerListed('7', 'Ruffle - movie.swf'));
  const first = await ctx.cap.recordingSource(ctx.win);
  const second = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(first.sourceId, 'window:7');
  assert.strictEqual(second.sourceId, 'window:7');
  assert.strictEqual(ctx.seen.sources.length, 2);
});

test('an empty capture frame is blocked', async () => {
  const ctx = play(
    Object.assign(playerListed('7', 'Ruffle - movie.swf'), {
      grabFrame: async () => Buffer.alloc(0)
    })
  );
  const still = await ctx.cap.captureStill(ctx.win);
  assert.strictEqual(still.route, 'blocked');
  assert.strictEqual(still.reason, 'empty-frame');
  assert.strictEqual(still.message, 'msg:empty-frame');
});

test('a missing capture frame is blocked', async () => {
  const ctx = play(
    Object.assign(playerListed('7', 'Ruffle - movie.swf'), {
      grabFrame: async () => null
    })
  );
  const still = await ctx.cap.captureStill(ctx.win);
  assert.strictEqual(still.reason, 'empty-frame');
});

test('a bare Ruffle title matches when the pid does', async () => {
  const ctx = play({
    listWindows: async () => ({ ok: true, windows: [owned(10, '7', 'Ruffle')] }),
    getSources: async () => [src('window:7', 'Ruffle')]
  });
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.route, 'source');
  assert.strictEqual(verdict.sourceId, 'window:7');
  assert.strictEqual(verdict.title, 'Ruffle');
});

test('two identical titles are distinguished by pid', async () => {
  const ctx = play(
    {
      listWindows: async () => ({
        ok: true,
        windows: [owned(10, '1', 'Ruffle - movie.swf'), owned(11, '2', 'Ruffle - movie.swf')]
      }),
      getSources: async () => [src('window:1', 'Ruffle - movie.swf'), src('window:2', 'Ruffle - movie.swf')]
    },
    11
  );
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.sourceId, 'window:2');
  assert.strictEqual(verdict.title, 'Ruffle - movie.swf');
});

test('one named window wins when the pid owns another bare window', async () => {
  const ctx = play({
    listWindows: async () => ({
      ok: true,
      windows: [owned(10, '1', 'Ruffle'), owned(10, '2', 'Ruffle - movie.swf')]
    }),
    getSources: async () => [src('window:1', 'Ruffle'), src('window:2', 'Ruffle - movie.swf')]
  });
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.sourceId, 'window:2');
});

test('a window id above 2^53 matches as a decimal string', async () => {
  const id = '9007199254740993';
  const ctx = play({
    listWindows: async () => ({ ok: true, windows: [owned(10, id, 'Ruffle')] }),
    getSources: async () => [src('window:' + id, 'Ruffle')]
  });
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.sourceId, 'window:9007199254740993');
});

test('a failed os list with one title hit uses that window', async () => {
  const ctx = play({
    listWindows: async () => ({ ok: false }),
    getSources: async () => [src('window:4', 'Ruffle - movie.swf'), src('window:5', 'Notes')]
  });
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.sourceId, 'window:4');
  assert.strictEqual(ctx.seen.sources.length, 1);
  assert.strictEqual(ctx.seen.sleeps, 0);
});

test('a failed os list with two title hits is ambiguous and does not retry', async () => {
  const ctx = play({
    listWindows: async () => ({ ok: false }),
    getSources: async () => [src('window:1', 'Ruffle - movie.swf'), src('window:2', 'copy movie.swf copy')]
  });
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.route, 'blocked');
  assert.strictEqual(verdict.reason, 'ambiguous');
  assert.strictEqual(verdict.message, 'msg:ambiguous');
  assert.strictEqual(ctx.seen.sources.length, 1);
  assert.strictEqual(ctx.seen.sleeps, 0);
  assert.deepStrictEqual(ctx.seen.grabs, []);
});

test('a bare Ruffle title is not a hit when the os list failed', async () => {
  const ctx = play({
    listWindows: async () => ({ ok: false }),
    getSources: async () => [src('window:1', 'Ruffle')]
  });
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.reason, 'no-window');
  assert.strictEqual(ctx.seen.sources.length, 5);
  assert.strictEqual(ctx.seen.sleeps, 4);
});

test('an empty os list does not steal another process title', async () => {
  const ctx = play({
    listWindows: async () => ({ ok: true, windows: [] }),
    getSources: async () => [src('window:3', 'Ruffle - movie.swf')]
  });
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.route, 'blocked');
  assert.strictEqual(verdict.reason, 'no-window');
  assert.strictEqual(verdict.sourceId, undefined);
  assert.strictEqual(ctx.seen.sources.length, 5);
  assert.deepStrictEqual(ctx.seen.grabs, []);
});

test('a pid the capturer did not list does not use a foreign window', async () => {
  const ctx = play({
    listWindows: async () => ({ ok: true, windows: [owned(10, '50', 'Ruffle - movie.swf')] }),
    getSources: async () => [src('window:3', 'Ruffle - movie.swf')]
  });
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.reason, 'no-window');
  assert.strictEqual(verdict.sourceId, undefined);
  assert.strictEqual(ctx.seen.sources.length, 5);
});

test('several pid hits that do not narrow are ambiguous', async () => {
  const ctx = play({
    listWindows: async () => ({
      ok: true,
      windows: [owned(10, '1', 'Foo'), owned(10, '2', 'Bar')]
    }),
    getSources: async () => [src('window:1', 'Foo'), src('window:2', 'Bar')]
  });
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.reason, 'ambiguous');
  assert.strictEqual(ctx.seen.sources.length, 1);
  assert.strictEqual(ctx.seen.sleeps, 0);
});

test('an osascript probe with one matching title is unique', async () => {
  const ctx = play({
    listWindows: async () => ({
      ok: true,
      windows: [owned(10, '', 'Ruffle - movie.swf')]
    }),
    getSources: async () => [src('window:4', 'Ruffle - movie.swf'), src('window:5', 'Other')]
  });
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.route, 'source');
  assert.strictEqual(verdict.sourceId, 'window:4');
  assert.strictEqual(verdict.title, 'Ruffle - movie.swf');
});

test('an osascript probe cannot tell two identical titles apart', async () => {
  const ctx = play({
    listWindows: async () => ({
      ok: true,
      windows: [owned(10, '', 'Ruffle - movie.swf')]
    }),
    getSources: async () => [src('window:1', 'Ruffle - movie.swf'), src('window:2', 'Ruffle - movie.swf')]
  });
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.route, 'blocked');
  assert.strictEqual(verdict.reason, 'ambiguous');
  assert.strictEqual(ctx.seen.sleeps, 0);
});

test('the file name is the decoded last path segment', async () => {
  const decoded = play(
    {
      listWindows: async () => ({ ok: false }),
      getSources: async () => [src('window:9', 'Ruffle - my game.swf')]
    },
    10,
    'file:///tmp/my%20game.swf#relaunch-1'
  );
  const hit = await decoded.cap.recordingSource(decoded.win);
  assert.strictEqual(hit.sourceId, 'window:9');

  const encodedOnly = play(
    {
      listWindows: async () => ({ ok: false }),
      getSources: async () => [src('window:9', 'Ruffle - my%20game.swf')]
    },
    10,
    'file:///tmp/my%20game.swf'
  );
  const miss = await encodedOnly.cap.recordingSource(encodedOnly.win);
  assert.strictEqual(miss.reason, 'no-window');

  const raw = play(
    {
      listWindows: async () => ({ ok: false }),
      getSources: async () => [src('window:6', 'Ruffle - 100%.swf')]
    },
    10,
    'file:///tmp/100%.swf'
  );
  const kept = await raw.cap.recordingSource(raw.win);
  assert.strictEqual(kept.sourceId, 'window:6');
});

test('the first two misses retry and the third match is the source', async () => {
  let n = 0;
  const ctx = play({
    listWindows: async () => ({ ok: true, windows: [owned(10, '7', 'Ruffle - movie.swf')] }),
    getSources: async () => {
      n += 1;
      if (n < 3) return [];
      return [src('window:7', 'Ruffle - movie.swf')];
    }
  });
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.route, 'source');
  assert.strictEqual(verdict.sourceId, 'window:7');
  assert.strictEqual(ctx.seen.sources.length, 3);
  assert.strictEqual(ctx.seen.sleeps, 2);
});

test('a generation change does not return the first pid source id', async () => {
  const win = fakeWin(1);
  const childA = fakeChild(10);
  const childB = fakeChild(20);
  let session;
  const { cap } = setup({
    listWindows: async (pid) => {
      if (pid === 10) {
        session.spawned(childB, OTHER);
        return { ok: true, windows: [owned(10, '5', 'Ruffle - movie.swf')] };
      }
      return { ok: true, windows: [owned(20, '8', 'Ruffle - other.swf')] };
    },
    getSources: async (_opts, seen) => {
      if (seen.sources.length === 1) return [src('window:5', 'Ruffle - movie.swf')];
      return [src('window:8', 'Ruffle - other.swf')];
    }
  });
  session = cap.open(win);
  session.spawned(childA, MOVIE);
  const verdict = await cap.recordingSource(win);
  assert.strictEqual(verdict.route, 'source');
  assert.strictEqual(verdict.sourceId, 'window:8');
});

test('a second generation change blocks instead of using a dead pid', async () => {
  const win = fakeWin(1);
  const children = [fakeChild(10), fakeChild(20), fakeChild(30)];
  const urls = [MOVIE, OTHER, 'https://example.test/third.swf'];
  let wave = 0;
  let session;
  const { cap } = setup({
    listWindows: async (pid) => {
      wave += 1;
      if (wave === 1) session.spawned(children[1], urls[1]);
      else if (wave === 2) session.spawned(children[2], urls[2]);
      return { ok: true, windows: [owned(pid, String(pid), 'Ruffle - movie.swf')] };
    },
    getSources: async () => [
      src('window:10', 'Ruffle - movie.swf'),
      src('window:20', 'Ruffle - other.swf'),
      src('window:30', 'Ruffle - third.swf')
    ]
  });
  session = cap.open(win);
  session.spawned(children[0], MOVIE);
  const verdict = await cap.recordingSource(win);
  assert.strictEqual(verdict.route, 'blocked');
  assert.strictEqual(verdict.reason, 'no-window');
  assert.strictEqual(verdict.sourceId, undefined);
});

test('an older player exiting leaves the newer player running', async () => {
  const childA = fakeChild(10);
  const childB = fakeChild(20);
  const { cap } = setup({
    listWindows: async (pid) => ({
      ok: true,
      windows: [owned(pid, String(pid), pid === 10 ? 'Ruffle - movie.swf' : 'Ruffle - other.swf')]
    }),
    getSources: async () => [src('window:10', 'Ruffle - movie.swf'), src('window:20', 'Ruffle - other.swf')]
  });
  const win = fakeWin(1);
  const session = cap.open(win);
  session.spawned(childA, MOVIE);
  session.spawned(childB, OTHER);
  childA.emit('exit');
  const verdict = await cap.recordingSource(win);
  assert.strictEqual(verdict.route, 'source');
  assert.strictEqual(verdict.sourceId, 'window:20');
  childB.emit('exit');
  const after = await cap.captureStill(win);
  assert.strictEqual(after.reason, 'closed');
});

test('spawning the same child twice does not close on the first extra exit event', async () => {
  const child = fakeChild(10);
  const { cap } = setup(playerListed('7', 'Ruffle - movie.swf'));
  const win = fakeWin(1);
  const session = cap.open(win);
  session.spawned(child, MOVIE);
  session.spawned(child, MOVIE);
  assert.strictEqual(child.handlers.exit.length, 1);
  assert.strictEqual(child.handlers.error.length, 1);
  const before = await cap.recordingSource(win);
  assert.strictEqual(before.route, 'source');
  assert.strictEqual(before.sourceId, 'window:7');
  child.emit('exit');
  const after = await cap.captureStill(win);
  assert.strictEqual(after.reason, 'closed');
});

test('denied or restricted screen access does not list windows', async () => {
  for (const status of ['denied', 'restricted']) {
    const ctx = play(
      Object.assign(playerListed('7', 'Ruffle - movie.swf'), {
        screenAccess: () => status
      })
    );
    const verdict = await ctx.cap.recordingSource(ctx.win);
    assert.strictEqual(verdict.reason, 'macos-denied');
    assert.strictEqual(verdict.message, 'msg:macos-denied');
    assert.deepStrictEqual(ctx.seen.sources, []);
    assert.strictEqual(ctx.seen.lists, 0);
  }
});

test('screen access that is still not determined after a miss is macos-denied', async () => {
  const ctx = play(
    Object.assign(playerListed('7', 'Ruffle'), {
      getSources: async () => [],
      screenAccess: () => 'not-determined'
    })
  );
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.reason, 'macos-denied');
  assert.strictEqual(ctx.seen.sources.length, 5);
  assert.strictEqual(ctx.seen.lists, 5);
});

test('a wayland miss is the wayland message and not a screen source', async () => {
  const ctx = play({
    session: () => 'wayland',
    listWindows: async () => ({ ok: true, windows: [owned(10, '50', 'Ruffle - movie.swf')] }),
    getSources: async () => [src('screen:0:0', 'Entire screen')]
  });
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.route, 'blocked');
  assert.strictEqual(verdict.reason, 'wayland');
  assert.strictEqual(verdict.message, 'msg:wayland');
  assert.strictEqual(verdict.sourceId, undefined);
  assert.strictEqual(ctx.seen.sources.length, 5);
  assert.deepStrictEqual(ctx.seen.grabs, []);
});

test('a wayland session still captures a window the tools can see', async () => {
  const ctx = play(
    Object.assign(playerListed('7', 'Ruffle - movie.swf'), {
      session: () => 'wayland'
    })
  );
  const verdict = await ctx.cap.recordingSource(ctx.win);
  assert.strictEqual(verdict.route, 'source');
  assert.strictEqual(verdict.sourceId, 'window:7');
  assert.strictEqual(ctx.seen.sources.length, 1);
});

test('retarget returns the companion whose playing pid is in front', async () => {
  const { cap } = setup({ foregroundPid: async () => 42 });
  const companion = fakeWin(1);
  const other = fakeWin(2);
  const front = fakeChild(42);
  cap.open(companion).spawned(front, MOVIE);
  cap.open(other).spawned(fakeChild(7), OTHER);
  assert.strictEqual(await cap.retarget(other), companion);
  front.exitCode = 0;
  assert.strictEqual(await cap.retarget(other), null);
});

test('retarget returns null when the foreground pid is null or the probe throws', async () => {
  const quiet = setup({ foregroundPid: async () => null });
  const win = fakeWin(1);
  quiet.cap.open(win).spawned(fakeChild(42), MOVIE);
  assert.strictEqual(await quiet.cap.retarget(win), null);

  const broken = setup({
    foregroundPid: async () => {
      throw new Error('no display');
    }
  });
  broken.cap.open(fakeWin(2)).spawned(fakeChild(42), MOVIE);
  assert.strictEqual(await broken.cap.retarget(null), null);
});

test('a missing catalog key throws', async () => {
  const { cap } = setup({ messages: {} });
  const win = fakeWin(1);
  cap.open(win);
  await assert.rejects(cap.captureStill(win));
});

test('locale catalogs have a message for every capture reason', () => {
  const en = require('../../res/po/en-US.js').titleMessages;
  const pt = require('../../res/po/pt-BR.js').titleMessages;
  const template = require('../../res/po/template.js').titleMessages;
  const english = {
    nativeCaptureStarting: 'The desktop player is still starting.',
    nativeCaptureClosed: 'The desktop player is not running.',
    nativeCaptureMacosDenied:
      'Screen recording permission is off. Allow AquaStar to record the screen in System Settings, then try again.',
    nativeCaptureWayland:
      "This Wayland session cannot capture another application's window. Use an X11 session to screenshot or record the desktop player.",
    nativeCaptureAmbiguous: 'More than one desktop player window matches, so nothing was captured.',
    nativeCaptureNoWindow: 'Could not find the desktop player window.',
    nativeCaptureEmptyFrame: 'The capture came back empty.'
  };
  assert.strictEqual(capture.messageKey('macos-denied'), 'nativeCaptureMacosDenied');
  assert.strictEqual(capture.messageKey('no-window'), 'nativeCaptureNoWindow');
  assert.strictEqual(capture.messageKey('empty-frame'), 'nativeCaptureEmptyFrame');
  capture.REASONS.forEach((reason) => {
    const key = capture.messageKey(reason);
    assert.strictEqual(en[key], english[key]);
    assert.strictEqual(typeof pt[key], 'string');
    assert.ok(pt[key].length > 0);
    assert.notStrictEqual(pt[key], en[key]);
    assert.ok(Object.prototype.hasOwnProperty.call(template, key));
  });
});
