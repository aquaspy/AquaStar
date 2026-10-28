// Ruffle display settings the vendored player accepts.
// Quality ids are the strings web/src/builder.rs setQuality understands.
// Render scale is the player property renderScale. The player clamps it to 0.1..2.
// "1" is a full-resolution frame, which is what the player does when nothing sets it.

const qualities = [
    { id: 'low', label: 'Low (fastest)' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High (default)' },
    { id: 'best', label: 'Best' },
    { id: '8x8', label: 'High 8x8' },
    { id: '8x8linear', label: 'High 8x8 linear' },
    { id: '16x16', label: 'High 16x16' },
    { id: '16x16linear', label: 'High 16x16 linear' }
];

const scales = [
    { id: '0.5', label: '50%', value: 0.5 },
    { id: '0.75', label: '75%', value: 0.75 },
    { id: '1', label: '100% (default)', value: 1 },
    { id: '1.5', label: '150%', value: 1.5 },
    { id: '2', label: '200%', value: 2 }
];

const qualityIds = {};
qualities.forEach(function (item) { qualityIds[item.id] = true; });

const scaleById = {};
scales.forEach(function (item) { scaleById[item.id] = item.value; });

function normalizeQuality(value) {
    return qualityIds[value] ? value : 'high';
}

function normalizeScale(value) {
    return Object.prototype.hasOwnProperty.call(scaleById, String(value)) ? String(value) : '1';
}

function scaleValue(value) {
    const id = normalizeScale(value);
    return scaleById[id];
}

module.exports = {
    qualities: qualities,
    scales: scales,
    normalizeQuality: normalizeQuality,
    normalizeScale: normalizeScale,
    scaleValue: scaleValue
};
