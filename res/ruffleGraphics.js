// Graphics backend for Ruffle desktop (native mode), passed as `--graphics`. OpenGL is the
// default: Vulkan can abort with a wgpu "Out of Memory" on some Intel Mesa drivers
// (ruffle-rs/ruffle#24920). Ruffle's own "default" lets it pick (Vulkan/DX12/Metal).
const ruffleGraphicsBackends = {
    gl:      { label: 'OpenGL (default, most compatible)' },
    vulkan:  { label: 'Vulkan', platforms: ['linux', 'win32'] },
    dx12:    { label: 'DirectX 12', platforms: ['win32'] },
    metal:   { label: 'Metal', platforms: ['darwin'] },
    default: { label: 'Automatic (Ruffle decides)' }
};
exports.choicesFor = function (platform) {
    return Object.keys(ruffleGraphicsBackends)
        .filter((id) => !ruffleGraphicsBackends[id].platforms || ruffleGraphicsBackends[id].platforms.indexOf(platform) !== -1)
        .map((id) => ({ id: id, label: ruffleGraphicsBackends[id].label }));
};
exports.normalize = function (value) {
    return Object.prototype.hasOwnProperty.call(ruffleGraphicsBackends, value) ? value : 'gl';
};
