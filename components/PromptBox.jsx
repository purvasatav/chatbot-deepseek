import { assets } from '@/assets/assets'
import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@clerk/nextjs';
import axios from 'axios';
import Image from 'next/image'
import React, { useRef, useState, useEffect } from 'react'
import toast from 'react-hot-toast';

const IMAGE_INTENT_REGEX = /\b(generate|create|draw|make|design|paint)\b[^.?!]{0,25}\b(image|picture|photo|drawing|illustration|artwork|wallpaper|logo|icon|painting)\b/i;

const ICON = {
    paperclip: "\uD83D\uDCCE",
    close: "\u2715",
    picture: "\uD83D\uDDBC\uFE0F",
    research: "\uD83D\uDD0E",
    palette: "\uD83C\uDFA8",
    mic: "\uD83C\uDFA4",
};
const EM_DASH = "\u2014";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB per file
const MAX_FILES = 5; // per message

const PromptBox = ({setIsLoading, isLoading}) => {

    const [prompt, setPrompt] = useState('');
    const promptRef = useRef('');
    useEffect(() => { promptRef.current = prompt; },[prompt]);
    const {user, chats, setChats, selectedChat, setSelectedChat, createNewChat} = useAppContext();
    const {getToken} = useAuth();
    const isSendingRef = useRef(false);
    const [attachedFiles, setAttachedFiles] = useState([]); // array of { name, type, content, fileData, fileType }
    const fileInputRef = useRef(null);
    const [isProcessingFile, setIsProcessingFile] = useState(false);
    const [showUploadMenu, setShowUploadMenu] = useState(false);
    const [useSearch, setUseSearch] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    const baseTranscriptRef = useRef(''); // holds the prompt text as it was BEFORE this recording session started
    const [imageMode, setImageMode] = useState(false);
    const [researchMode, setResearchMode] = useState(false);
    const [isResearching, setIsResearching] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const abortControllerRef = useRef(null);
    const menuRef = useRef(null);

    useEffect(() => {
        if (!showUploadMenu) return;
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setShowUploadMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showUploadMenu]);

    const startVoiceInput = () => {
        if (!window.isSecureContext) {
            toast.error(`Voice input needs HTTPS or localhost ${EM_DASH} it won't work over a plain network IP.`);
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
            toast.error(`You're offline ${EM_DASH} voice input needs an internet connection.`);
            return;
        }
        const MAX_RETRIES = 3;
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.maxAlternatives = 3;
        recognition._retryCount = 0;
        recognition.onstart = () => {
            setIsListening(true);
            // Snapshot whatever was already in the textbox ONCE, at the start of this
            // recording session. Every onresult event (including interim ones) will be
            // rebuilt from this fixed base instead of the live/mutating prompt state,
            // which is what was causing words to double up as interim results refined.
            baseTranscriptRef.current = promptRef.current;
        };
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
                'no-speech': "No speech detected \u2014 try again.",
                'audio-capture': "No microphone was found.",
                'network': "Voice input couldn't reach the speech service \u2014 check your connection or try disabling ad blockers.",
                'aborted': "Voice input was cancelled.",
            };
            toast.error(reasons[event.error] || `Voice input error: ${event.error}`);
        };
        recognition.onresult = (event) => {
            const result = event.results[event.results.length - 1];
            const transcript = result[0].transcript;
            const base = baseTranscriptRef.current;
            const combined = base ? `${base} ${transcript}` : transcript;
            setPrompt(combined);
            if (result.isFinal) {
                // Lock in the finalized text as the new base, in case recognition
                // continues (e.g. more results arrive) before onend fires.
                baseTranscriptRef.current = combined;
                toast.success("Voice captured");
                sendPrompt({ preventDefault: () => {} }, combined);
            }
        };
        recognitionRef.current = recognition;
        recognition.start();
    };

    // Processes a single File object into our internal attachment shape.
    const processSingleFile = (file) => {
        return new Promise((resolve, reject) => {
            const name = file.name.toLowerCase();
            if (file.type.startsWith("image/")) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    resolve({
                        name: file.name,
                        type: 'image',
                        content: ev.target.result,
                        fileData: ev.target.result,
                        fileType: file.type
                    });
                };
                reader.onerror = () => reject(new Error("Could not read image"));
                reader.readAsDataURL(file);

            } else if (name.endsWith(".pdf") || name.endsWith(".docx")) {
                (async () => {
                    try {
                        const token = await getToken();
                        const formData = new FormData();
                        formData.append("file", file);
                        const { data } = await axios.post('/api/chat/extract', formData, {
                            headers: {
                                'Content-Type': 'multipart/form-data',
                                Authorization: `Bearer ${token}`
                            }
                        });
                        if (!data.success) {
                            reject(new Error(data.message || "Could not read file"));
                            return;
                        }
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            resolve({
                                name: file.name,
                                type: 'text',
                                content: data.text,
                                fileData: ev.target.result,
                                fileType: file.type || (name.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                            });
                        };
                        reader.onerror = () => reject(new Error("Could not read file"));
                        reader.readAsDataURL(file);
                    } catch (err) {
                        reject(err);
                    }
                })();

            } else {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const textContent = ev.target.result;
                    const dataReader = new FileReader();
                    dataReader.onload = (ev2) => {
                        resolve({
                            name: file.name,
                            type: 'text',
                            content: textContent,
                            fileData: ev2.target.result,
                            fileType: file.type || 'text/plain'
                        });
                    };
                    dataReader.onerror = () => reject(new Error("Could not read file"));
                    dataReader.readAsDataURL(file);
                };
                reader.onerror = () => reject(new Error("Could not read file"));
                reader.readAsText(file);
            }
        });
    };

    const handleFileChange = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        if (attachedFiles.length + files.length > MAX_FILES) {
            toast.error(`You can attach up to ${MAX_FILES} files per message.`);
            e.target.value = '';
            return;
        }

        const oversized = files.find(f => f.size > MAX_FILE_SIZE);
        if (oversized) {
            toast.error(`"${oversized.name}" is too large (${(oversized.size / 1024 / 1024).toFixed(1)}MB). Please upload files under 4MB.`);
            e.target.value = '';
            return;
        }

        setIsProcessingFile(true);
        try {
            const results = await Promise.all(
                files.map(f => processSingleFile(f).catch(err => ({ error: err.message || "Failed to process file", name: f.name })))
            );
            const succeeded = results.filter(r => !r.error);
            const failed = results.filter(r => r.error);

            if (succeeded.length > 0) {
                setAttachedFiles(prev => [...prev, ...succeeded]);
                toast.success(`Attached ${succeeded.length} file${succeeded.length > 1 ? 's' : ''}`);
            }
            failed.forEach(f => toast.error(`${f.name}: ${f.error}`));
        } finally {
            setIsProcessingFile(false);
            e.target.value = '';
        }
    };

    const removeAttachedFile = (idx) => {
        setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
    };

    const handleKeyDown = (e)=>{
        if(e.key === "Enter" && !e.shiftKey){
            e.preventDefault();
            sendPrompt(e);
        }
    }

    const handleStopGenerating = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    const sendPrompt = async (e, overrideText)=>{
        e.preventDefault();
        if(isSendingRef.current) return;

        const promptCopy = overrideText !== undefined ? overrideText : prompt;
        try {
            if(!user) return toast.error('Login to send message');
            let activeChat = selectedChat;
            if(!activeChat){
                activeChat = await createNewChat();
                if(!activeChat) return toast.error('Could not start a new chat');
                setChats((prev)=> [activeChat, ...prev]);
                setSelectedChat(activeChat);
            }
            if(isLoading) return toast.error('Wait for the previous prompt response');
            if(isProcessingFile) return toast.error('Wait for the file(s) to finish processing');
            if(!promptCopy.trim()) return;

            isSendingRef.current = true;
            setIsLoading(true)
            setPrompt("")

            const attachmentsForDisplay = attachedFiles.map(f => ({
                fileName: f.name,
                fileData: f.fileData,
                fileType: f.fileType
            }));

            const userPrompt = {
                role: "user",
                content: promptCopy,
                timestamp: Date.now(),
                ...(attachmentsForDisplay.length > 0? { attachments: attachmentsForDisplay } : {})
            }

            setChats((prevChats)=> prevChats.map((chat)=> chat._id === activeChat._id ?
                { ...chat, messages: [...chat.messages, userPrompt] }
                : chat
            ))

            setSelectedChat((prev)=> ({
                ...prev,
                messages: [...(prev?.messages || []), userPrompt]
            }))

            // Deep research path
            if (researchMode) {
                setResearchMode(false);
                setIsResearching(true);
                try {
                    const token = await getToken();
                    const {data} = await axios.post('/api/chat/research', {
                        chatId: activeChat._id,
                        prompt: promptCopy
                    }, {headers:{ Authorization: `Bearer ${token}` }});
                    if (data.success) {
                        setSelectedChat((prev) => ({...prev, messages:[...(prev?.messages || []), data.data] }));
                        setChats((prevChats)=>prevChats.map((chat)=> chat._id === activeChat._id ? {...chat, messages: [...chat.messages, data.data]} : chat));
                    } else {
                        toast.error(data.message || 'Research failed');
                        setPrompt(promptCopy);
                    }
                } catch (err) {
                    toast.error('Research failed');
                    setPrompt(promptCopy);
                }
                setIsResearching(false);
                setIsLoading(false);
                isSendingRef.current = false;
                return;
            }

            // Image generation path
            const autoImageIntent = !imageMode && attachedFiles.length === 0 && IMAGE_INTENT_REGEX.test(promptCopy);

            if (imageMode || autoImageIntent) {
                setImageMode(false);
                // Only the first attached image is used as the edit base (pollinations kontext supports one source image).
                const firstImage = attachedFiles.find(f => f.type === 'image');
                const editImageBase64 = firstImage ? firstImage.content : null;
                if (firstImage) setAttachedFiles([]);
                const token = await getToken();
                const {data} = await axios.post('/api/chat/image', {
                    chatId: activeChat._id,
                    prompt: promptCopy,
                    editImageBase64
                }, {headers:{ Authorization: `Bearer ${token}` }});
                setIsLoading(false);
                if (data.success) {
                    setSelectedChat((prev) => ({ ...prev, messages: [...(prev?.messages || []), data.data] }));
                    setChats((prevChats)=>prevChats.map((chat)=> chat._id === activeChat._id ? {...chat, messages: [...chat.messages, data.data]} : chat));
                } else {
                    toast.error(data.message || 'Image generation failed');
                    setPrompt(promptCopy);
                }
                isSendingRef.current = false;
                return;
            }

            let finalPrompt = promptCopy;
            const imageBase64s = attachedFiles.filter(f => f.type === 'image').map(f => f.content);
            const textFiles = attachedFiles.filter(f=> f.type !== 'image');
            const fileMetas = attachedFiles.map(f =>({
                fileName: f.name,
                fileData: f.fileData,
                fileType: f.fileType
            }));

            if (textFiles.length > 0) {
                const blocks = textFiles.map(f => `[Attached file: ${f.name}]\n${f.content}`).join('\n\n');
                finalPrompt = `${promptCopy}\n\n${blocks}`;
            } else if (imageBase64s.length > 0 && !promptCopy.trim()) {
                finalPrompt = "Describe these images.";
            }

            setAttachedFiles([]);

            // Vision path: non-streaming, single JSON response (one or more images)
            if (imageBase64s.length > 0) {
                const token = await getToken();
                const {data} = await axios.post('/api/chat/ai', {
                    chatId: activeChat._id,
                    prompt: finalPrompt,
                    displayPrompt: promptCopy,
                    imageBase64s,
                    fileMetas
                }, {headers:{ Authorization: `Bearer ${token}` }})
                setIsLoading(false);
                if (data.success) {
                    setSelectedChat((prev) => ({ ...prev, messages: [...(prev?.messages || []), data.data] }));
                    setChats((prevChats)=>prevChats.map((chat)=> chat._id === activeChat._id ? {...chat, messages: [...chat.messages, data.data]} : chat));
                } else {
                    toast.error(data.message || 'Something went wrong');
                    setPrompt(promptCopy);
                }
                isSendingRef.current = false;
                return;
            }

            // Text path: real streaming via fetch, cancellable with AbortController
            let assistantMessage = { role: 'assistant', content: "", timestamp: Date.now() };
            setSelectedChat((prev) => ({ ...prev, messages: [...(prev?.messages || []), assistantMessage]}));
            setIsLoading(false);

            const controller = new AbortController();
            abortControllerRef.current = controller;
            setIsStreaming(true);

            let wasAborted = false;

            try {
                const token = await getToken();
                const response = await fetch('/api/chat/ai', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        chatId: activeChat._id,
                        prompt: finalPrompt,
                        displayPrompt: promptCopy,
                        useSearch,
                        fileMetas
                    }),
                    signal: controller.signal
                });

                if (!response.ok || !response.body) {
                    let errMsg = 'Something went wrong';
                    try {
                        const errData = await response.json();
                        errMsg = errData.message || errData.error || errMsg;
                    } catch (e) {}
                    toast.error(errMsg);
                    setPrompt(promptCopy);
                    setSelectedChat((prev) => {
                        if (!prev) return prev;
                        return { ...prev, messages: prev.messages.slice(0, -1) };
                    });
                    return;
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let accumulated = "";
                let rafId = null;

                const flushUpdate = () => {
                    rafId = null;
                    setSelectedChat((prev) => {
                        if (!prev) return prev;
                        return { ...prev, messages: [...prev.messages.slice(0, -1), assistantMessage] };
                    });
                };

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    accumulated += decoder.decode(value, { stream: true});
                    assistantMessage = { ...assistantMessage, content: accumulated };
                    if (rafId === null) {
                        rafId = requestAnimationFrame(flushUpdate);
                    }
                }

                if (rafId !== null) {
                    cancelAnimationFrame(rafId);
                }
                setSelectedChat((prev) => {
                    if (!prev) return prev;
                    return { ...prev, messages: [...prev.messages.slice(0, -1), assistantMessage] };
                });
            } catch (err) {
                if (err.name === 'AbortError') {
                    wasAborted = true;
                    assistantMessage = { ...assistantMessage, content: assistantMessage.content + "\n\n*[Stopped by user]*" };
                    setSelectedChat((prev) => {
                        if (!prev) return prev;
                        return { ...prev, messages: [...prev.messages.slice(0, -1), assistantMessage] };
                    });
                } else {
                    throw err;
                }
            } finally {
                setIsStreaming(false);
                abortControllerRef.current = null;
            }

            setChats((prevChats)=>prevChats.map((chat)=>
                chat._id === activeChat._id ?
                {...chat, messages: [...chat.messages, assistantMessage]} : chat
            ))

        } catch (error) {
            toast.error(error.message);
            setPrompt(promptCopy);
        } finally {
            setIsLoading(false);
            isSendingRef.current = false;
        }
    }

    return (
        <form onSubmit={sendPrompt}
        style={{backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border-color)'}}
        className={`w-full ${selectedChat?.messages?.length > 0 ? "max-w-3xl" : "max-w-2xl"} border p-4 rounded-3xl mt-4 transition-all`}>
            {attachedFiles.length > 0 && (
                <div className='flex flex-wrap gap-2 mb-2'>
                    {attachedFiles.map((f, i) => (
                        <div key={i} style={{color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface-2)'}} className='text-xs flex items-center gap-2 rounded-full px-2.5 py-1'>
                            <span>{ICON.paperclip}</span>
                            <span className='max-w-[8rem] truncate'>{f.name}</span>
                            <span onClick={()=>removeAttachedFile(i)} className='cursor-pointer text-red-400'>{ICON.close}</span>
                        </div>
                    ))}
                </div>
            )}
            {imageMode && (
                <div className='text-xs text-purple-400 mb-2 flex items-center gap-2'>
                    <span>{ICON.picture}</span> Image mode {EM_DASH} describe what to generate{attachedFiles.some(f=>f.type==='image') ? ' or edit' : ''}
                    <span onClick={()=>setImageMode(false)} className='cursor-pointer text-red-400'>{ICON.close}</span>
                </div>
            )}
            {researchMode && (
                <div className='text-xs text-blue-400 mb-2 flex items-center gap-2'>
                    <span>{ICON.research}</span> Deep research mode {EM_DASH} ask your question
                    <span onClick={()=>setResearchMode(false)} className='cursor-pointer text-red-400'>{ICON.close}</span>
                </div>
            )}
            {isListening && (
                <div className='text-xs text-red-400 mb-2 flex items-center gap-2'>
                    <span className='flex items-center gap-0.5'>
                        <span className='w-0.5 h-3 bg-red-400 rounded-full animate-pulse' style={{animationDelay: '0ms'}}></span>
                        <span className='w-0.5 h-4 bg-red-400 rounded-full animate-pulse' style={{animationDelay: '150ms'}}></span>
                        <span className='w-0.5 h-2 bg-red-400 rounded-full animate-pulse' style={{animationDelay: '300ms'}}></span>
                        <span className='w-0.5 h-4 bg-red-400 rounded-full animate-pulse' style={{animationDelay: '450ms'}}></span>
                        <span className='w-0.5 h-3 bg-red-400 rounded-full animate-pulse' style={{animationDelay: '600ms'}}></span>
                    </span>
                    Recording... speak now
                    <span onClick={()=> recognitionRef.current?.stop()} className='cursor-pointer text-red-400 ml-1'>{ICON.close} Stop</span>
                </div>
            )}
            {isResearching && (
                <div className='text-xs text-blue-400 mb-2'>Researching across multiple sources... this can take 20-30s</div>
            )}
            {isProcessingFile && (
                <div style={{color: 'var(--text-muted)'}} className='text-xs mb-2'>Processing file(s)...</div>
            )}
            <textarea
            onKeyDown={handleKeyDown}
            disabled={false}
            placeholder="Message DeepSeek"
            style={{color: 'var(--text-primary)'}}
            className='outline-none w-full resize-none overflow-hidden break-words bg-transparent placeholder:opacity-40'
            rows={2}
            required
            onChange={(e)=> setPrompt(e.target.value)} value={prompt}/>

            <div className='flex items-center justify-between text-sm'>
                <div className='flex items-center gap-2'>
                    <p style={{borderColor: 'var(--border-color)'}} className='flex items-center gap-2 text-xs border px-2 py-1 rounded-full cursor-pointer hover:bg-gray-500/20 transition'>
                        <Image className='h-5' src={assets.deepthink_icon} alt=''/>
                        DeepThink (R1)
                    </p>
                    <button
                        type='button'
                        onClick={()=>setUseSearch(!useSearch)}
                        style={!useSearch ? {borderColor: 'var(--border-color)'} : {}}
                        className={`flex items-center gap-2 text-xs border px-2 py-1 rounded-full cursor-pointer transition ${useSearch ? 'border-primary bg-primary/20 text-white' : 'hover:bg-gray-500/20'}`}
                    >
                        <Image className='h-5' src={assets.search_icon} alt=''/>
                        Search
                    </button>
                </div>
                <div className='flex items-center gap-2 relative'>
                    <input type='file' multiple ref={fileInputRef} onChange={handleFileChange} accept='.txt,.md,.csv,.json,.pdf,.docx,image/*' className='hidden'/>
                    <button type='button' onClick={()=> setShowUploadMenu(!showUploadMenu)} className='p-1 hover:bg-white/10 rounded-lg transition'>
                        <Image className='w-4 cursor-pointer' src={assets.pin_icon} alt='Attach file'/>
                    </button>
                    {showUploadMenu && (
                        <div
                        ref={menuRef}
                        style={{backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)', color: 'var(--text-primary)'}}
                        className='absolute bottom-11 left-0 border rounded-2xl w-72 py-2 shadow-2xl z-50 overflow-hidden'>
                            <button
                            type='button'
                            onClick={()=>{ fileInputRef.current.click(); setShowUploadMenu(false); }}
                            className='w-full text-left px-3 py-2.5 text-sm hover:bg-white/10 transition-colors flex items-center gap-3 rounded-xl mx-1 my-0.5'
                            style={{width: 'calc(100% - 0.5rem)'}}>
                                <span className='shrink-0 w-9 h-9 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center text-base'>
                                    {ICON.paperclip}
                                </span>
                                <span>
                                    <span className='block font-medium'>Add photos &amp; files</span>
                                    <span style={{color: 'var(--text-muted)'}} className='text-xs'>Up to {MAX_FILES} files, 4MB each</span>
                                </span>
                            </button>
                            <button
                            type='button'
                            onClick={()=>{ setImageMode(true); setShowUploadMenu(false); }}
                            className='w-full text-left px-3 py-2.5 text-sm hover:bg-white/10 transition-colors flex items-center gap-3 rounded-xl mx-1 my-0.5'
                            style={{width: 'calc(100% - 0.5rem)'}}>
                                <span className='shrink-0 w-9 h-9 rounded-full bg-purple-500/15 text-purple-400 flex items-center justify-center text-base'>
                                    {ICON.palette}
                                </span>
                                <span>
                                    <span className='block font-medium'>Generate image</span>
                                    <span style={{color: 'var(--text-muted)'}} className='text-xs'>Create an image with AI</span>
                                </span>
                            </button>
                            <button
                            type='button'
                            onClick={()=>{ setResearchMode(true); setShowUploadMenu(false); }}
                            className='w-full text-left px-3 py-2.5 text-sm hover:bg-white/10 transition-colors flex items-center gap-3 rounded-xl mx-1 my-0.5'
                            style={{width: 'calc(100% - 0.5rem)'}}>
                                <span className='shrink-0 w-9 h-9 rounded-full bg-cyan-500/15 text-cyan-400 flex items-center justify-center text-base'>
                                    {ICON.research}
                                </span>
                                <span>
                                    <span className='block font-medium'>Deep research</span>
                                    <span style={{color: 'var(--text-muted)'}} className='text-xs'>Search multiple sources</span>
                                </span>
                            </button>
                        </div>
                    )}
                    <button type='button' onClick={startVoiceInput} disabled={false} className='p-1 hover:bg-white/10 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed'>
                        <span className={`text-lg ${isListening ? 'text-red-400' : ''}`}>{ICON.mic}</span>
                    </button>
                    {isStreaming ? (
                        <button type='button' onClick={handleStopGenerating} className='bg-red-500 rounded-full p-2 cursor-pointer hover:opacity-90'>
                            <span className='text-white text-xs px-1'>{"\u25FC"}</span>
                        </button>
                    ) : (
                        <button
                            type='submit'
                            disabled={isLoading || !prompt.trim()}
                            className={`${prompt.trim() && selectedChat? 'bg-primary' : 'bg-gray-400/40'} rounded-full p-2 cursor-pointer disabled:cursor-not-allowed`}
                        >
                            <Image className='w-3.5 aspect-square' src={prompt.trim() ? assets.arrow_icon: assets.arrow_icon_dull} alt=''/>
                        </button>
                    )}
                </div>
            </div>
        </form>
    )
}

export default PromptBox;