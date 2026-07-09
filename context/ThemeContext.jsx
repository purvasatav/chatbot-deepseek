"use client";
import axios from "axios";
import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

const ThemeContext = createContext();
export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
    const [theme, setThemeState] = useState('dark');
    const { isLoaded, isSignedIn, getToken } = useAuth();

    const resolveAndApply = (value) => {
        let resolved = value;
        if (value === 'system') {
            resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(resolved);
    };

    const setTheme = (value) => {
        resolveAndApply(value);
        localStorage.setItem('theme', value);
        setThemeState(value);
    };

    useEffect(() => {
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
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (data.success && data.data.theme) {
                    resolveAndApply(data.data.theme);
                    setThemeState(data.data.theme);
                    localStorage.setItem('theme', data.data.theme);
                }
            } catch (e) { /* ignore */ }
        })();
    }, [isLoaded, isSignedIn]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};