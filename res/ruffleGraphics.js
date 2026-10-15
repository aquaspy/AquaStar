// Graphics backend for Ruffle desktop (native mode), passed as `--graphics`.
// The safe backend is OpenGL on Linux and Windows. On macOS it is Metal: the
// v0.7.1 Mac binary links Metal and does not link OpenGL. Ruffle's own
// "default" lets it pick (Vulkan/DX12/Metal).
const ruffleGraphicsBackends = {
    gl:      { label: 'OpenGL' },
    vulkan:  { label: 'Vulkan', platforms: ['linux', 'win32'] },
    dx12:    { label: 'DirectX 12', platforms: ['win32'] },
    metal:   { label: 'Metal', platforms: ['darwin', 'macos'] },
    default: { label: 'Automatic (Ruffle decides)' }
};

function safeId(platform) {
    platform = platform || process.platform;
    return platform === 'darwin' || platform === 'macos' ? 'metal' : 'gl';
}

exports.safeId = safeId;
exports.choicesFor = function (platform) {
    return Object.keys(ruffleGraphicsBackends)
        .filter((id) => !ruffleGraphicsBackends[id].platforms || ruffleGraphicsBackends[id].platforms.indexOf(platform) !== -1)
        .map((id) => {
            const label = ruffleGraphicsBackends[id].label;
            return { id: id, label: id === safeId(platform) ? label + ' (default)' : label };
        });
};
exports.normalize = function (value, platform) {
    platform = platform || process.platform;
    if (!Object.prototype.hasOwnProperty.call(ruffleGraphicsBackends, value)) return safeId(platform);
    const spec = ruffleGraphicsBackends[value];
    if (spec.platforms && spec.platforms.indexOf(platform) === -1) return safeId(platform);
    return value;
};
