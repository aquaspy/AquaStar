#!/usr/bin/env node
/**
 * Build assets/boxmover.swf — AVM1 interactive stage (arrow keys move a square).
 * Usage: node plugins/example-companion/flash/build-boxmover.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

function encodeRect(xmin, xmax, ymin, ymax) {
  const vals = [xmin, xmax, ymin, ymax];
  let max = 1;
  vals.forEach(function (v) {
    const a = Math.abs(v);
    if (a > max) max = a;
  });
  let nBits = 1;
  while ((1 << (nBits - 1)) <= max) nBits++;
  let bits = '';
  function writeUB(val, n) {
    bits += (val >>> 0).toString(2).padStart(n, '0').slice(-n);
  }
  function writeSB(val, n) {
    let v = val < 0 ? ((1 << n) + val) : val;
    bits += (v >>> 0).toString(2).padStart(n, '0').slice(-n);
  }
  writeUB(nBits, 5);
  writeSB(xmin, nBits);
  writeSB(xmax, nBits);
  writeSB(ymin, nBits);
  writeSB(ymax, nBits);
  while (bits.length % 8 !== 0) bits += '0';
  const out = Buffer.alloc(bits.length / 8);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return out;
}

function tag(type, data) {
  data = data || Buffer.alloc(0);
  if (data.length < 63) {
    const header = Buffer.alloc(2);
    header.writeUInt16LE((type << 6) | data.length, 0);
    return Buffer.concat([header, data]);
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE((type << 6) | 0x3f, 0);
  header.writeInt32LE(data.length, 2);
  return Buffer.concat([header, data]);
}

function ui16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n & 0xffff, 0);
  return b;
}

function action(code, payload) {
  payload = payload || Buffer.alloc(0);
  if (code < 0x80) return Buffer.from([code]);
  return Buffer.concat([Buffer.from([code]), ui16(payload.length), payload]);
}

function pushItems(items) {
  let payload = Buffer.alloc(0);
  items.forEach(function (it) {
    if (it[0] === 's') {
      payload = Buffer.concat([payload, Buffer.from([0x00]), Buffer.from(it[1], 'utf8'), Buffer.from([0])]);
    } else if (it[0] === 'i') {
      const b = Buffer.alloc(5);
      b[0] = 0x07;
      b.writeInt32LE(it[1] | 0, 1);
      payload = Buffer.concat([payload, b]);
    } else if (it[0] === 'c') {
      payload = Buffer.concat([payload, Buffer.from([0x08, it[1] & 0xff])]);
    }
  });
  return action(0x96, payload);
}

function constantPool(strings) {
  let payload = ui16(strings.length);
  strings.forEach(function (s) {
    payload = Buffer.concat([payload, Buffer.from(s, 'utf8'), Buffer.from([0])]);
  });
  return action(0x88, payload);
}

function buildDoAction() {
  // Spec: ActionDefineFunction's code bytes follow AFTER the action record
  // (not inside Length). Length covers name/params/CodeSize field only.
  const P = [
    'box', 'createEmptyMovieClip', 'beginFill', 'moveTo', 'lineTo', 'endFill',
    '_x', '_y', 'onEnterFrame', 'Key', 'isDown', 'LEFT', 'RIGHT', 'UP', 'DOWN', '_root'
  ];
  const getRoot = Buffer.concat([pushItems([['c', 15]]), action(0x1c)]);
  const getBox = Buffer.concat([pushItems([['c', 0]]), action(0x1c)]);
  const pi = function (n) { return pushItems([['i', n]]); };
  const pc = function (n) { return pushItems([['c', n]]); };

  function callVoid(objBuf, methodIdx, argBufs) {
    const n = argBufs.length;
    let args = Buffer.alloc(0);
    argBufs.forEach(function (a) { args = Buffer.concat([args, a]); });
    return Buffer.concat([
      objBuf, args,
      pushItems([['i', n], ['c', methodIdx]]),
      action(0x52),
      action(0x17)
    ]);
  }

  function callKeep(objBuf, methodIdx, argBufs) {
    const n = argBufs.length;
    let args = Buffer.alloc(0);
    argBufs.forEach(function (a) { args = Buffer.concat([args, a]); });
    return Buffer.concat([
      objBuf, args,
      pushItems([['i', n], ['c', methodIdx]]),
      action(0x52)
    ]);
  }

  const createBox = Buffer.concat([
    callKeep(getRoot, 1, [pc(0), pi(10)]), // name, depth
    pc(0),
    action(0x1d)
  ]);

  const draw = Buffer.concat([
    callVoid(getBox, 2, [pi(0x4da3ff)]),
    callVoid(getBox, 3, [pi(0), pi(0)]),
    callVoid(getBox, 4, [pi(40), pi(0)]),
    callVoid(getBox, 4, [pi(40), pi(40)]),
    callVoid(getBox, 4, [pi(0), pi(40)]),
    callVoid(getBox, 4, [pi(0), pi(0)]),
    callVoid(getBox, 5, [])
  ]);

  const place = Buffer.concat([
    getBox, pi(60), pc(6), action(0x4f),
    getBox, pi(60), pc(7), action(0x4f)
  ]);

  function keyMove(keyIdx, xyIdx, delta) {
    const getKey = Buffer.concat([pc(9), action(0x1c)]);
    const keyConst = Buffer.concat([getKey, pc(keyIdx), action(0x4e)]);
    const isDown = Buffer.concat([
      getKey, keyConst,
      pushItems([['i', 1], ['c', 10]]),
      action(0x52)
    ]);
    const move = Buffer.concat([
      getBox,
      getBox, pc(xyIdx), action(0x4e),
      pi(delta), action(0x47),
      pc(xyIdx), action(0x4f)
    ]);
    const ifPayload = Buffer.alloc(2);
    ifPayload.writeInt16LE(move.length, 0);
    return Buffer.concat([isDown, action(0x12), action(0x9d, ifPayload), move]);
  }

  function clamp(xyIdx, minV, maxV) {
    const getV = Buffer.concat([getBox, pc(xyIdx), action(0x4e)]);
    const setMin = Buffer.concat([getBox, pi(minV), pc(xyIdx), action(0x4f)]);
    const setMax = Buffer.concat([getBox, pi(maxV), pc(xyIdx), action(0x4f)]);
    const ifMin = Buffer.alloc(2); ifMin.writeInt16LE(setMin.length, 0);
    const ifMax = Buffer.alloc(2); ifMax.writeInt16LE(setMax.length, 0);
    return Buffer.concat([
      getV, pi(minV), action(0x48), action(0x12), action(0x9d, ifMin), setMin,
      pi(maxV), getV, action(0x48), action(0x12), action(0x9d, ifMax), setMax
    ]);
  }

  const enterBody = Buffer.concat([
    keyMove(11, 6, -4),
    keyMove(12, 6, 4),
    keyMove(13, 7, -4),
    keyMove(14, 7, 4),
    clamp(6, 0, 500),
    clamp(7, 0, 340)
  ]);

  // DefineFunction header only (code follows in stream)
  const defHeaderPayload = Buffer.concat([
    Buffer.from([0]), // empty name
    ui16(0),           // num params
    ui16(enterBody.length)
  ]);
  const defineFnHeader = action(0x9b, defHeaderPayload);

  // _root.onEnterFrame = function... 
  // Push object, (defineFn pushes fn when header+body executed), name, SetMember
  // Stream order: push _root; DefineFunction header; [body bytes]; push "onEnterFrame"; SetMember
  // After DefineFunction header+body, function is on stack. Need object under it.
  // Correct order: push _root; DefineFunction+body (pushes fn); push name; SetMember
  // SetMember pops name, value, object — so stack bottom→top: object, value, name
  const assign = Buffer.concat([
    getRoot,
    defineFnHeader,
    enterBody,
    pc(8),
    action(0x4f)
  ]);

  return Buffer.concat([
    constantPool(P),
    createBox,
    draw,
    place,
    assign,
    action(0x00)
  ]);
}

function buildSwf() {
  const rectBuf = encodeRect(0, 550 * 20, 0, 400 * 20);
  const setBg = tag(9, Buffer.from([0x12, 0x12, 0x12]));
  const doAction = tag(12, buildDoAction());
  const showFrame = tag(1, Buffer.alloc(0));
  const end = tag(0, Buffer.alloc(0));
  const mid = Buffer.alloc(4);
  mid.writeUInt16LE(0x1800, 0);
  mid.writeUInt16LE(1, 2);
  const afterSig = Buffer.concat([rectBuf, mid, setBg, doAction, showFrame, end]);
  const fileLen = 8 + afterSig.length;
  const out = Buffer.alloc(fileLen);
  out.write('FWS');
  out[3] = 8;
  out.writeUInt32LE(fileLen, 4);
  afterSig.copy(out, 8);
  return out;
}

const outPath = path.join(__dirname, '..', 'assets', 'boxmover.swf');
fs.writeFileSync(outPath, buildSwf());
console.log('Wrote', outPath, '(' + fs.statSync(outPath).size + ' bytes)');
