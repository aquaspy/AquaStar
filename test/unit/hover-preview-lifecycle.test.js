const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function harness(file) {
  const pending = [],
    timers = new Map();
  let serial = 0,
    preview = [];
  const context = vm.createContext({
    URL,
    console,
    document: {},
    clearInterval() {},
    window: {
      AquaStarWikiNameVariants: {
        findPageOverride: () => null,
        findNameOverride: () => null,
        toWikiSlug: (name) => name.toLowerCase(),
        disambiguationSuffixes: ['', '-merge', '-ac']
      },
      aquastarWiki: {
        fetchWikiPage: (url) =>
          new Promise((resolve, reject) =>
            pending.push({ url, resolve: (html) => resolve({ ok: true, html }), reject })
          )
      }
    },
    $: () => ({
      mousemove() {},
      remove() {
        preview = [];
      }
    }),
    setTimeout: (fn) => {
      timers.set(++serial, fn);
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
    DOMParser: function () {
      this.parseFromString = (html) => ({ html });
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../..', file), 'utf8'), context);
  context.isDisambiguationPage = (doc) => doc.html.includes('disambiguation');
  context.extractItemImages = (doc) => (doc.html.includes('empty') ? [] : [{ src: doc.html.split('>').pop() }]);
  context.renderPreview = (images) => {
    preview = images.map((image) => image.src);
  };
  context.$ = (value) =>
    value && value.html
      ? {
          find: () => ({
            each(fn) {
              fn.call({ href: '/child' });
            }
          })
        }
      : value && value.href
        ? { attr: () => value.href }
        : {
            remove() {
              preview = [];
            }
          };
  return {
    context,
    pending,
    get preview() {
      return preview;
    },
    tick() {
      const callbacks = Array.from(timers.values());
      timers.clear();
      callbacks.forEach((fn) => fn());
    }
  };
}
async function settle() {
  for (let i = 0; i < 15; i++) await Promise.resolve();
}
for (const file of [
  'lite/ui/wiki/hoverPreview.js',
  'plugins/adventure-quest-worlds/features/wikiview/hoverPreview.js'
]) {
  test(file + ': latest hover wins, including reverse request completion', async () => {
    const h = harness(file);
    h.context.hovered('https://aqwwiki.wikidot.com/a');
    h.tick();
    h.context.hovered('https://aqwwiki.wikidot.com/b');
    h.tick();
    assert.strictEqual(h.pending.length, 2);
    h.pending[1].resolve('B');
    await settle();
    assert.deepStrictEqual(h.preview, ['B']);
    h.pending[0].resolve('A');
    await settle();
    assert.deepStrictEqual(h.preview, ['B']);
  });
  test(file + ': unhover removes immediately, ignores late results and allows rehover', async () => {
    const h = harness(file);
    h.context.hoveredName('A');
    h.tick();
    h.pending[0].resolve('A');
    await settle();
    assert.deepStrictEqual(h.preview, ['A']);
    h.context.unhovered();
    assert.deepStrictEqual(h.preview, []);
    h.context.hoveredName('B');
    h.tick();
    h.context.unhovered();
    h.pending[1].resolve('B');
    await settle();
    assert.deepStrictEqual(h.preview, []);
    h.context.hoveredName('B');
    h.tick();
    h.pending[2].resolve('B');
    await settle();
    assert.deepStrictEqual(h.preview, ['B']);
  });
  test(file + ': repeated enter keeps debounce and active variants still resolve', async () => {
    const h = harness(file);
    h.context.hoveredName('A');
    h.context.hoveredName('A');
    h.tick();
    assert.strictEqual(h.pending.length, 1);
    h.pending[0].resolve('empty');
    await settle();
    assert.strictEqual(h.pending.length, 2);
    h.pending[1].resolve('A merge');
    await settle();
    assert.deepStrictEqual(h.preview, ['A merge']);
  });
  test(file + ': abandoned disambiguation child cannot continue to variants', async () => {
    const h = harness(file);
    h.context.hoveredName('A');
    h.tick();
    h.pending[0].resolve('disambiguation');
    await settle();
    assert.strictEqual(h.pending.length, 2);
    assert.strictEqual(h.pending[1].url, 'https://aqwwiki.wikidot.com/child');
    h.context.unhovered();
    h.pending[1].reject(new Error('network'));
    await settle();
    assert.strictEqual(h.pending.length, 2);
    assert.deepStrictEqual(h.preview, []);
  });
  test(file + ': leaving a preview releases the image-loading timer', () => {
    const h = harness(file);
    const cleared = [];
    h.context.setInterval = () => 42;
    h.context.clearInterval = (id) => cleared.push(id);
    h.context.waitForImg('#preview img:last', () => {});
    h.context.unhovered();
    assert.ok(cleared.includes(42));
  });
  for (const response of ['empty', 'disambiguation']) {
    test(file + ': unhover stops ' + response + ' follow-up requests', async () => {
      const h = harness(file);
      h.context.hoveredName('A');
      h.tick();
      h.context.unhovered();
      h.pending[0].resolve(response);
      await settle();
      assert.strictEqual(h.pending.length, 1);
    });
  }
}
