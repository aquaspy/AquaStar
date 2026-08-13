#!/usr/bin/env node

/*
 * Counts non-empty, non-comment lines in the source tree. This intentionally
 * avoids an external dependency so it works after a normal npm install.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const extensions = new Map([
  ['.js', 'JavaScript'],
  ['.html', 'HTML'],
  ['.json', 'JSON'],
  ['.sh', 'Shell']
]);
const ignoredDirectories = new Set([
  '.git', 'node_modules', 'dist', 'work', 'releases', 'FlashPlayer',
  'squashfs-root', 'Icon', 'Icon-Originals', 'ruffle', 'po'
]);
const ignoredFiles = new Set([
  'package-lock.json',
  'res/ruffle/jquery.min.js',
  'res/features/wikiview/jquery.min.js'
]);

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : filesIn(fullPath);
    }
    return entry.isFile() ? [fullPath] : [];
  });
}

function stripJavaScriptComments(line, state) {
  let result = '';
  let quote = state.quote;
  let blockComment = state.blockComment;

  for (let index = 0; index < line.length; index += 1) {
    const current = line[index];
    const next = line[index + 1];

    if (blockComment) {
      if (current === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      result += current;
      if (current === '\\') {
        result += next || '';
        index += 1;
      } else if (current === quote) {
        quote = null;
      }
      continue;
    }
    if (current === '/' && next === '/') break;
    if (current === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (current === '\'' || current === '"' || current === '`') quote = current;
    result += current;
  }
  state.quote = quote;
  state.blockComment = blockComment;
  return result;
}

function stripBlockComments(line, state) {
  let result = '';
  for (let index = 0; index < line.length; index += 1) {
    if (state.blockComment) {
      if (line[index] === '*' && line[index + 1] === '/') {
        state.blockComment = false;
        index += 1;
      }
    } else if (line[index] === '/' && line[index + 1] === '*') {
      state.blockComment = true;
      index += 1;
    } else {
      result += line[index];
    }
  }
  return result;
}

function stripHtmlComments(line, state) {
  let result = '';
  let remaining = line;
  while (remaining) {
    if (state.inScript || state.inStyle) {
      const closingTag = state.inScript ? '</script' : '</style';
      const closingIndex = remaining.toLowerCase().indexOf(closingTag);
      const content = closingIndex === -1 ? remaining : remaining.slice(0, closingIndex);
      result += state.inScript
        ? stripJavaScriptComments(content, state.scriptState)
        : stripBlockComments(content, state.styleState);
      if (closingIndex === -1) return result;
      const closeEnd = remaining.indexOf('>', closingIndex);
      if (closeEnd === -1) return result;
      result += remaining.slice(closingIndex, closeEnd + 1);
      remaining = remaining.slice(closeEnd + 1);
      state.inScript = false;
      state.inStyle = false;
      continue;
    }
    if (state.inComment) {
      const end = remaining.indexOf('-->');
      if (end === -1) return result;
      state.inComment = false;
      remaining = remaining.slice(end + 3);
    } else {
      const start = remaining.indexOf('<!--');
      const openingTag = /<(script|style)\b[^>]*>/i.exec(remaining);
      const nextTagIndex = openingTag ? openingTag.index : -1;
      if (start === -1 && nextTagIndex === -1) return result + remaining;
      if (start !== -1 && (nextTagIndex === -1 || start < nextTagIndex)) {
        result += remaining.slice(0, start);
        state.inComment = true;
        remaining = remaining.slice(start + 4);
        continue;
      }
      result += remaining.slice(0, nextTagIndex + openingTag[0].length);
      state.inScript = openingTag[1].toLowerCase() === 'script';
      state.inStyle = openingTag[1].toLowerCase() === 'style';
      remaining = remaining.slice(nextTagIndex + openingTag[0].length);
    }
  }
  return result;
}

function stripShellComments(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '\'' || character === '"') quote = character;
    else if (character === '#') return line.slice(0, index);
  }
  return line;
}

function countFile(filePath) {
  const extension = path.extname(filePath);
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const state = {
    blockComment: false,
    quote: null,
    inComment: false,
    inScript: false,
    inStyle: false,
    scriptState: { blockComment: false, quote: null },
    styleState: { blockComment: false }
  };
  return lines.reduce((total, line) => {
    let code = line;
    if (extension === '.js') code = stripJavaScriptComments(line, state);
    if (extension === '.html') code = stripHtmlComments(line, state);
    if (extension === '.sh') code = stripShellComments(line);
    return total + (code.trim() ? 1 : 0);
  }, 0);
}

const totals = new Map();
let fileCount = 0;
let totalLines = 0;

for (const filePath of filesIn(root)) {
  const relativePath = path.relative(root, filePath).replace(/\\/g, '/');
  const language = extensions.get(path.extname(filePath));
  if (!language || ignoredFiles.has(relativePath)) continue;
  const lines = countFile(filePath);
  totals.set(language, (totals.get(language) || 0) + lines);
  fileCount += 1;
  totalLines += lines;
}

console.log('Linhas de código (sem comentários e linhas vazias)');
for (const [language, lines] of [...totals.entries()].sort()) {
  console.log(`${language.padEnd(12)} ${String(lines).padStart(6)}`);
}
console.log('------------------------------------');
console.log(`${'TOTAL'.padEnd(12)} ${String(totalLines).padStart(6)} em ${fileCount} arquivos`);
