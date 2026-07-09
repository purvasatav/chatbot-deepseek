const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'components', 'PromptBox.jsx');

const OLD_BLOCK = `    const startVoiceInput = () => {
        // Web Speech API requires a secure context (https, or localhost).
        // On a LAN IP like http://192.168.x.x this will always fail.
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
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = (event) => {
            setIsListening(false);

            // Chrome's Web Speech API throws spurious 'network' errors
            // even when the mic works fine. Retry once silently before
            // bothering the user with a toast.
            if (event.error === 'network' && !recognition._retried) {
                recognition._retried = true;
                recognitionRef.current = recognition;
                setTimeout(() => {
                    try { recognition.start(); } catch (e) { /* ignore */ }
                }, 300);
                return;
            }

            const reasons = {
                'not-allowed': "Microphone access was denied. Allow mic permission in your browser settings.",
                'service-not-allowed': "Microphone access was denied. Allow mic permission in your browser settings.",
                'no-speech': "No speech detected — try again.",
                'audio-capture': "No microphone was found.",
                'network': "Voice input lost its connection — try again.",
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

if (!content.includes(OLD_BLOCK)) {
    console.error('Could not find the exact old startVoiceInput block (file may differ from expected).');
    process.exit(1);
}

content = content.replace(OLD_BLOCK, NEW_BLOCK);
fs.writeFileSync(FILE_PATH, content, 'utf8');
console.log(`Patched startVoiceInput in ${FILE_PATH}`);
