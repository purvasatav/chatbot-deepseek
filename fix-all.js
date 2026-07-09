const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'components', 'PromptBox.jsx');
let content = fs.readFileSync(FILE_PATH, 'utf8');

// --- Fix 1: mojibake -> correct characters ---
const MOJIBAKE_MAP = [
    ['â€”', '—'],
    ['ðŸŽ¤', '🎤'],
    ['ðŸ“Ž', '📎'],
    ['ðŸ–¼ï¸', '🖼️'],
    ['ðŸ“¢', '📢'],
    ['âœ•', '✕'],
    ['ðŸŽ¨', '🎨'],
    ['ðŸ”Ž', '🔎'],
    ['â—¼', '◼'],
];
for (const [bad, good] of MOJIBAKE_MAP) {
    content = content.split(bad).join(good);
}

// --- Fix 2: broken JSX tag "spanstyle" -> "span style" ---
const OLD_TAG = '<spanstyle={{color: \'var(--text-muted)\'}} className=\'text-xs\'>Upload from computer</span>';
const NEW_TAG = '<span style={{color: \'var(--text-muted)\'}} className=\'text-xs\'>Upload from computer</span>';
if (content.includes(OLD_TAG)) {
    content = content.replace(OLD_TAG, NEW_TAG);
} else {
    console.warn('Warning: spanstyle tag not found for exact match — skipped (may already be fixed).');
}

// --- Fix 3a: let sendPrompt accept an override text ---
const OLD_SIG = '    const sendPrompt = async (e)=>{';
const NEW_SIG = '    const sendPrompt = async (e, overrideText)=>{';
const OLD_COPY = '        const promptCopy = prompt;';
const NEW_COPY = '        const promptCopy = overrideText !== undefined ? overrideText : prompt;';
const OLD_CHECK = '            if(!prompt.trim()) return;';
const NEW_CHECK = '            if(!promptCopy.trim()) return;';

for (const [old, label] of [[OLD_SIG,'signature'],[OLD_COPY,'promptCopy'],[OLD_CHECK,'trim check']]) {
    if (!content.includes(old)) {
        console.error(`Could not find sendPrompt ${label} line — aborting to avoid a bad edit.`);
        process.exit(1);
    }
}
content = content.replace(OLD_SIG, NEW_SIG);
content = content.replace(OLD_COPY, NEW_COPY);
content = content.replace(OLD_CHECK, NEW_CHECK);

// --- Fix 3b: auto-send after voice capture ---
const OLD_RESULT = `        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setPrompt((prev) => prev ? \`\${prev} \${transcript}\` : transcript);
            toast.success("Voice captured");
        };`;

const NEW_RESULT = `        recognition.onresult = (event) => {
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

if (!content.includes(OLD_RESULT)) {
    console.error('Could not find onresult block — aborting to avoid a bad edit.');
    process.exit(1);
}
content = content.replace(OLD_RESULT, NEW_RESULT);

fs.writeFileSync(FILE_PATH, content, 'utf8');
console.log('All fixes applied to ' + FILE_PATH);
