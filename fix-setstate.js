const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'components', 'PromptBox.jsx');
let content = fs.readFileSync(FILE_PATH, 'utf8');

// --- Add a promptRef that always tracks the latest prompt value ---
const OLD_STATE = `    const [prompt, setPrompt] = useState('');`;
const NEW_STATE = `    const [prompt, setPrompt] = useState('');
    const promptRef = useRef('');
    useEffect(() => { promptRef.current = prompt; }, [prompt]);`;

if (!content.includes(OLD_STATE)) {
    console.error('Could not find prompt useState line — aborting.');
    process.exit(1);
}
content = content.replace(OLD_STATE, NEW_STATE);

// --- Make sure useEffect is imported ---
const OLD_IMPORT = `import React, { useRef, useState } from 'react'`;
const NEW_IMPORT = `import React, { useRef, useState, useEffect } from 'react'`;
if (content.includes(OLD_IMPORT)) {
    content = content.replace(OLD_IMPORT, NEW_IMPORT);
} else {
    console.warn('Warning: default React import line not found as expected — check useEffect is imported manually.');
}

// --- Replace the buggy onresult with a pure setPrompt + side effects outside it ---
const OLD_RESULT = `        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setPrompt((prev) => {
                const combined = prev ? \`\${prev} \${transcript}\` : transcript;
                toast.success("Voice captured");
                setTimeout(() => {
                    sendPrompt({ preventDefault: () => {} }, combined);
                }, 100);
                return combined;
            });
        };`;

const NEW_RESULT = `        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            const combined = promptRef.current ? \`\${promptRef.current} \${transcript}\` : transcript;
            setPrompt(combined);
            toast.success("Voice captured");
            setTimeout(() => {
                sendPrompt({ preventDefault: () => {} }, combined);
            }, 100);
        };`;

if (!content.includes(OLD_RESULT)) {
    console.error('Could not find the buggy onresult block — aborting to avoid a bad edit.');
    process.exit(1);
}
content = content.replace(OLD_RESULT, NEW_RESULT);

fs.writeFileSync(FILE_PATH, content, 'utf8');
console.log('Fixed setState-in-render bug in ' + FILE_PATH);
