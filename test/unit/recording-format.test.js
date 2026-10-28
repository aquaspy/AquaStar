const assert = require('assert');
const format = require('../../res/features/capture/recording-format.js');

const AAC = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
const OPUS = 'video/mp4;codecs=avc1.42E01E,opus';
const H264 = 'video/mp4;codecs=avc1.42E01E';

test('recording file names keep the classic unpadded local timestamp', () => {
  const date = new Date(2026, 9, 28, 18, 5, 9);
  assert.strictEqual(format.recordingFileName(date, 'mp4'), 'Recording-2026-10-28_18-5-9.mp4');
  assert.strictEqual(format.recordingFileName(date, '.webm'), 'Recording-2026-10-28_18-5-9.webm');
});

test('the save dialog filter follows the extension the recorder chose', () => {
  assert.deepStrictEqual(format.saveDialogFilters('mp4'), [{ name: 'MP4 Video', extensions: ['mp4'] }]);
  assert.deepStrictEqual(format.saveDialogFilters('.webm'), [{ name: 'WebM Video', extensions: ['webm'] }]);
  assert.deepStrictEqual(format.saveDialogFilters('mkv'), [{ name: 'MKV Video', extensions: ['mkv'] }]);
});

test('a saved h264-mkv preference is the MP4 choice', () => {
  assert.strictEqual(format.normalizeRecordingFormatId('h264-mkv'), 'h264-mp4');
  assert.strictEqual(format.normalizeRecordingFormatId('vp8-webm'), 'vp8-webm');
  assert.strictEqual(format.normalizeRecordingFormatId('nope'), format.defaultRecordingFormat);
  assert.strictEqual(format.defaultRecordingFormat, 'h264-mp4');
  assert.deepStrictEqual(
    format.recordingMimeCandidates('h264-mkv', true),
    format.recordingMimeCandidates('h264-mp4', true)
  );
});

test('MP4 candidates try AAC, then Opus, then WebM', () => {
  const list = format.recordingMimeCandidates('h264-mp4', true);
  const aac = list.indexOf(AAC);
  const opus = list.indexOf(OPUS);
  const webm = list.findIndex(function (mime) {
    return mime.indexOf('webm') !== -1;
  });
  assert.ok(aac !== -1 && opus !== -1 && webm !== -1);
  assert.ok(aac < opus && opus < webm);

  const quiet = format.recordingMimeCandidates('h264-mp4', false);
  assert.strictEqual(quiet[0], H264);
  quiet.forEach(function (mime) {
    assert.strictEqual(mime.indexOf('opus'), -1);
    assert.strictEqual(mime.indexOf('mp4a'), -1);
  });
});

test('an explicit WebM preference stays on WebM when that codec exists', () => {
  const list = format.recordingMimeCandidates('vp9-webm', true);
  assert.strictEqual(list[0], 'video/webm;codecs=vp9,opus');
  const chosen = format.chooseRecordingFormat('vp9-webm', true, { 'video/webm;codecs=vp9,opus': true });
  assert.strictEqual(chosen.mimeType, 'video/webm;codecs=vp9,opus');
  assert.strictEqual(chosen.extension, 'webm');
  assert.strictEqual(chosen.fellBackToWebm, false);
});

test('AAC wins when MediaRecorder supports it', () => {
  const chosen = format.chooseRecordingFormat('h264-mp4', true, {
    [AAC]: true,
    [OPUS]: true,
    'video/webm;codecs=vp9,opus': true
  });
  assert.strictEqual(chosen.mimeType, AAC);
  assert.strictEqual(chosen.extension, 'mp4');
  assert.strictEqual(chosen.container, 'mp4');
  assert.strictEqual(chosen.audioCodec, 'aac');
  assert.strictEqual(chosen.fellBackToWebm, false);
  assert.strictEqual(chosen.aacUnavailable, false);
});

test('Linux Electron 45 records MP4 with Opus when AAC is missing', () => {
  const supported = {
    'video/mp4': true,
    'video/mp4;codecs=avc1': true,
    [H264]: true,
    'video/mp4;codecs=avc1.4D401E': true,
    'video/mp4;codecs=avc1.640028': true,
    'video/mp4;codecs=avc1,mp4a.40.2': false,
    [AAC]: false,
    'video/mp4;codecs=avc1.4D401E,mp4a.40.2': false,
    'video/mp4;codecs=avc1.640028,mp4a.40.2': false,
    [OPUS]: true,
    'video/mp4;codecs=avc1,opus': true,
    'video/webm;codecs=vp8,opus': true,
    'video/webm;codecs=vp9,opus': true,
    'video/webm;codecs=vp8': true,
    'video/webm;codecs=vp9': true,
    'video/webm': true
  };
  const chosen = format.chooseRecordingFormat('h264-mp4', true, supported);
  assert.strictEqual(chosen.mimeType, OPUS);
  assert.strictEqual(chosen.extension, 'mp4');
  assert.strictEqual(chosen.audioCodec, 'opus');
  assert.strictEqual(chosen.fellBackToWebm, false);
  assert.strictEqual(chosen.aacUnavailable, true);
});

test('WebM is the fallback only when no MP4 type is supported', () => {
  const chosen = format.chooseRecordingFormat('h264-mp4', true, {
    [AAC]: false,
    [OPUS]: false,
    [H264]: false,
    'video/mp4': false,
    'video/webm;codecs=vp9,opus': true,
    'video/webm;codecs=vp8,opus': true
  });
  assert.strictEqual(chosen.mimeType, 'video/webm;codecs=vp9,opus');
  assert.strictEqual(chosen.extension, 'webm');
  assert.strictEqual(chosen.fellBackToWebm, true);
  assert.strictEqual(chosen.aacUnavailable, false);
});

test('video without an audio track stays H.264 MP4', () => {
  const chosen = format.chooseRecordingFormat('h264-mp4', false, {
    [H264]: true,
    'video/webm;codecs=vp8': true
  });
  assert.strictEqual(chosen.mimeType, H264);
  assert.strictEqual(chosen.audioCodec, null);
  assert.strictEqual(chosen.fellBackToWebm, false);
});
