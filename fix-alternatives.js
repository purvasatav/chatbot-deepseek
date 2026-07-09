const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'components', 'PromptBox.jsx');

let content = fs.readFileSync(FILE_PATH, 'utf8');

const OLD = `        recognition.maxAlternatives = 1;`;
const NEW = `        recognition.maxAlternatives = 3;`;

if (!content.includes(OLD)) {
    console.error('Could not find "recognition.maxAlternatives = 1;" — file may already be modified.');
    process.exit(1);
}

content = content.replace(OLD, NEW);
fs.writeFileSync(FILE_PATH, content, 'utf8');
console.log('Bumped maxAlternatives to 3 in ' + FILE_PATH);
