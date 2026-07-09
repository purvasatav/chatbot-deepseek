const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'components', 'PromptBox.jsx');

const NEW_BLOCK = `    const startVoiceInput = () => {
        if (!window.isSecureContext) {
            toast.error("Voice input needs HTTPS or localhost — it won't work over a plain network IP.");
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            toast.error("Voice input isn't supported in this browser. Try Chrome.");
            return;
        }
        if (isListening) {
            recognitionRef.current?.stop();
            return;
        }
        if (!navigator.onLine) {
            toast.error("You're offline — voice input needs an internet connection.");
            return;
        }
        const MAX_RETRIES = 3;
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition._retryCount = 0;
        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = (event) => {
            setIsListening(false);
            if (event.error === 'network' && recognition._retryCount < MAX_RETRIES) {
                recognition._retryCount += 1;
                recognitionRef.current = recognition;
                const delay = 300 * recognition._retryCount;
                setTimeout(() => {
                    try { recognition.start(); } catch (e) { /* ignore */ }
                }, delay);
                return;
            }
            const reasons = {
                'not-allowed': "Microphone access was denied. Allow mic permission in your browser settings.",
                'service-not-allowed': "Microphone access was denied. Allow mic permission in your browser settings.",
                'no-speech': "No speech detected — try again.",
                'audio-capture': "No microphone was found.",
                'network': "Voice input couldn't reach the speech service — check your connection or try disabling ad blockers.",
                'aborted': "Voice input was cancelled.",
            };
            toast.error(reasons[event.error] || \`Voice input error: \${event.error}\`);
        };
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setPrompt((prev) => prev ? \`\${prev} \${transcript}\` : transcript);
            toast.success("Voice captured");
        };
        recognitionRef.current = recognition;
        recognition.start();
    };`;

if (!fs.existsSync(FILE_PATH)) {
    console.error(`File not found: ${FILE_PATH}\nEdit FILE_PATH at the top of this script to point at your PromptBox component.`);
    process.exit(1);
}

let content = fs.readFileSync(FILE_PATH, 'utf8');

const startMarker = 'const startVoiceInput';
const startIdx = content.indexOf(startMarker);
if (startIdx === -1) {
    console.error('Could not find "const startVoiceInput" in the file. Check FILE_PATH.');
    process.exit(1);
}

const arrowIdx = content.indexOf('=>', startIdx);
const braceStart = content.indexOf('{', arrowIdx);

let depth = 0;
let i = braceStart;
let inString = null;
let inLineComment = false;
let inBlockComment = false;

for (; i < content.length; i++) {
    const ch = content[i];
    const prev = content[i - 1];
    if (inLineComment) { if (ch === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (prev === '*' && ch === '/') inBlockComment = false; continue; }
    if (inString) { if (ch === '\\') { i++; continue; } if (ch === inString) inString = null; continue; }
    if (ch === '/' && content[i + 1] === '/') { inLineComment = true; continue; }
    if (ch === '/' && content[i + 1] === '*') { inBlockComment = true; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) break; }
}

if (depth !== 0) {
    console.error('Brace matching failed — could not find the end of the function.');
    process.exit(1);
}

let endIdx = i + 1;
if (content[endIdx] === ';') endIdx++;

const before = content.slice(0, startIdx);
const after = content.slice(endIdx);

content = before + NEW_BLOCK.trim() + after;
fs.writeFileSync(FILE_PATH, content, 'utf8');
console.log(`Patched startVoiceInput in ${FILE_PATH}`);
