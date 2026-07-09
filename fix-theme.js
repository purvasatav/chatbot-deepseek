const fs = require('fs');
const path = require('path');
const FILE_PATH = path.join(__dirname, 'context', 'ThemeContext.jsx');
let content = fs.readFileSync(FILE_PATH, 'utf8');

// Normalize CRLF -> LF so exact-match string replace works reliably
content = content.replace(/\r\n/g, '\n');

const OLD_IMPORT = `import axios from "axios";
import { createContext, useContext, useEffect, useState } from "react";`;
const NEW_IMPORT = `import axios from "axios";
import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";`;

if (!content.includes(OLD_IMPORT)) { console.error('Import block not found.'); process.exit(1); }
content = content.replace(OLD_IMPORT, NEW_IMPORT);

const OLD_PROVIDER = `export const ThemeProvider = ({ children }) => {
    const [theme, setThemeState] = useState('dark');`;
const NEW_PROVIDER = `export const ThemeProvider = ({ children }) => {
    const [theme, setThemeState] = useState('dark');
    const { isLoaded, isSignedIn, getToken } = useAuth();`;

if (!content.includes(OLD_PROVIDER)) { console.error('Provider block not found.'); process.exit(1); }
content = content.replace(OLD_PROVIDER, NEW_PROVIDER);

const OLD_EFFECT = `    useEffect(() => {
        const saved = localStorage.getItem('theme');
        if (saved) {
            resolveAndApply(saved);
            setThemeState(saved);
        }

        axios.get('/api/settings').then(({ data }) => {
            if (data.success && data.data.theme) {
                resolveAndApply(data.data.theme);
                setThemeState(data.data.theme);
                localStorage.setItem('theme', data.data.theme);
            }
        }).catch(() => {});
    }, []);`;

const NEW_EFFECT = `    useEffect(() => {
        const saved = localStorage.getItem('theme');
        if (saved) {
            resolveAndApply(saved);
            setThemeState(saved);
        }
    }, []);

    useEffect(() => {
        if (!isLoaded || !isSignedIn) return;

        (async () => {
            try {
                const token = await getToken();
                const { data } = await axios.get('/api/settings', {
                    headers: { Authorization: \`Bearer \${token}\` }
                });
                if (data.success && data.data.theme) {
                    resolveAndApply(data.data.theme);
                    setThemeState(data.data.theme);
                    localStorage.setItem('theme', data.data.theme);
                }
            } catch (e) { /* ignore */ }
        })();
    }, [isLoaded, isSignedIn]);`;

if (!content.includes(OLD_EFFECT)) { console.error('useEffect block not found.'); process.exit(1); }
content = content.replace(OLD_EFFECT, NEW_EFFECT);

fs.writeFileSync(FILE_PATH, content, 'utf8');
console.log('Fixed unauthenticated /api/settings call in ' + FILE_PATH);
