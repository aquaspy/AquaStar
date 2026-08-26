const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('GitHub Pages workflow builds, verifies and deploys only the web artifact', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/pages.yml'), 'utf8');
    ['npm test', 'npm run web:build', 'path: web-dist', 'actions/configure-pages@v5', 'actions/upload-pages-artifact@v4', 'actions/deploy-pages@v4'].forEach((expected) => assert.ok(workflow.indexOf(expected) !== -1, 'missing ' + expected));
    assert.ok(workflow.indexOf("branches: [main]") !== -1 && workflow.indexOf("'web/**'") !== -1, 'workflow must deploy web changes from main');
});
