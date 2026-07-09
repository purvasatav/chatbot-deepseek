const fs = require('fs');
const path = require('path');
const FILE_PATH = path.join(__dirname, 'components', 'PromptBox.jsx');
let content = fs.readFileSync(FILE_PATH, 'utf8');

const OLD = `        recognition.interimResults = false;`;
const NEW = `        recognition.interimResults = true;`;
if (!content.includes(OLD)) { console.error('interimResults line not found.'); process.exit(1); }
content = content.replace(OLD, NEW);

const OLD_RESULT = `        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            const combined = promptRef.current ? \`\${promptRef.current} \${transcript}\` : transcript;
            setPrompt(combined);
            toast.success("Voice captured");
            setTimeout(() => {
                sendPrompt({ preventDefault: () => {} }, combined);
            }, 100);
        };`;

const NEW_RESULT = `        recognition.onresult = (event) => {
            const result = event.results[event.results.length - 1];
            const transcript = result[0].transcript;
            const combined = promptRef.current ? \`\${promptRef.current} \${transcript}\` : transcript;
            setPrompt(combined);
            if (result.isFinal) {
                toast.success("Voice captured");
                sendPrompt({ preventDefault: () => {} }, combined);
            }
        };`;

if (!content.includes(OLD_RESULT)) { console.error('onresult block not found.'); process.exit(1); }
content = content.replace(OLD_RESULT, NEW_RESULT);

fs.writeFileSync(FILE_PATH, content, 'utf8');
console.log('Enabled interim results and removed extra delay in ' + FILE_PATH);
