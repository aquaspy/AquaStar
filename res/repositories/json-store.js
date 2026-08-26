// Small filesystem adapter shared by feature repositories.  Keeping it outside
// feature modules makes parse/recovery behavior testable without Electron.
const fs = require('fs');

function read(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function write(filePath, value) {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 4));
    return value;
}

function readOrCreate(filePath, createValue) {
    if (!fs.existsSync(filePath)) return write(filePath, createValue());
    return read(filePath);
}

module.exports = { read: read, write: write, readOrCreate: readOrCreate };
