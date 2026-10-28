// MediaRecorder container and codec choice for a game recording.
// The sandboxed preload cannot require this file. It asks the main process,
// which is the only place that applies the list.

const AAC_MIMES = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.4D401E,mp4a.40.2',
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2'
];

const OPUS_MIMES = [
    'video/mp4;codecs=avc1.42E01E,opus',
    'video/mp4;codecs=avc1,opus'
];

const MP4_VIDEO = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1.4D401E',
    'video/mp4;codecs=avc1.640028',
    'video/mp4;codecs=avc1',
    'video/mp4'
];

const WEBM_AUDIO = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus'
];

const WEBM_VIDEO = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
];

const DEFAULT_ID = 'h264-mp4';

const recordingFormatChoices = [
    { id: 'h264-mp4', label: 'MP4 (H.264)' },
    { id: 'vp9-webm', label: 'WebM (VP9)' },
    { id: 'vp8-webm', label: 'WebM (VP8)' }
];

function unique(list) {
    const seen = Object.create(null);
    const out = [];
    list.forEach(function (mime) {
        if (seen[mime]) return;
        seen[mime] = true;
        out.push(mime);
    });
    return out;
}

// h264-mkv was the Electron 11 default. This Chromium records H.264 in MP4.
function normalizeRecordingFormatId(id) {
    if (id === 'h264-mkv' || id === 'h264-mp4') return 'h264-mp4';
    if (id === 'vp9-webm' || id === 'vp8-webm') return id;
    return DEFAULT_ID;
}

function recordingMimeCandidates(preferredId, hasAudio) {
    const id = normalizeRecordingFormatId(preferredId);
    const mp4 = hasAudio ? AAC_MIMES.concat(OPUS_MIMES, MP4_VIDEO) : MP4_VIDEO.slice();
    const webm = hasAudio ? WEBM_AUDIO.concat(WEBM_VIDEO) : WEBM_VIDEO.slice();
    if (id === 'vp9-webm') {
        const first = hasAudio ? 'video/webm;codecs=vp9,opus' : 'video/webm;codecs=vp9';
        return unique([first].concat(webm, mp4));
    }
    if (id === 'vp8-webm') {
        const first = hasAudio ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8';
        return unique([first].concat(webm, mp4));
    }
    return unique(mp4.concat(webm));
}

function audioCodecOf(mime) {
    if (mime.indexOf('mp4a.40.2') !== -1) return 'aac';
    if (mime.indexOf('opus') !== -1) return 'opus';
    return null;
}

function chooseRecordingFormat(preferredId, hasAudio, supported) {
    const list = recordingMimeCandidates(preferredId, hasAudio);
    let mime = null;
    for (let i = 0; i < list.length; i++) {
        if (supported && supported[list[i]] === true) {
            mime = list[i];
            break;
        }
    }
    if (!mime) mime = hasAudio ? 'video/webm;codecs=vp8,opus' : 'video/webm';
    const container = mime.indexOf('video/mp4') === 0 ? 'mp4' : 'webm';
    const wantedMp4 = normalizeRecordingFormatId(preferredId) === 'h264-mp4';
    const audioCodec = audioCodecOf(mime);
    return {
        mimeType: mime,
        extension: container === 'mp4' ? 'mp4' : 'webm',
        container: container,
        audioCodec: audioCodec,
        fellBackToWebm: wantedMp4 && container !== 'mp4',
        aacUnavailable: !!(hasAudio && wantedMp4 && container === 'mp4' && audioCodec === 'opus')
    };
}

function recordingFileName(date, extension) {
    const t = date instanceof Date ? date : new Date();
    const ext = String(extension || 'mp4').replace(/^\./, '').toLowerCase();
    return 'Recording-' +
        t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate() + '_' +
        t.getHours() + '-' + t.getMinutes() + '-' + t.getSeconds() + '.' + ext;
}

function saveDialogFilters(extension) {
    const ext = String(extension || '').replace(/^\./, '').toLowerCase();
    if (ext === 'mp4') return [{ name: 'MP4 Video', extensions: ['mp4'] }];
    if (ext === 'mkv') return [{ name: 'MKV Video', extensions: ['mkv'] }];
    return [{ name: 'WebM Video', extensions: ['webm'] }];
}

exports.defaultRecordingFormat = DEFAULT_ID;
exports.recordingFormatChoices = recordingFormatChoices;
exports.normalizeRecordingFormatId = normalizeRecordingFormatId;
exports.recordingMimeCandidates = recordingMimeCandidates;
exports.chooseRecordingFormat = chooseRecordingFormat;
exports.recordingFileName = recordingFileName;
exports.saveDialogFilters = saveDialogFilters;
