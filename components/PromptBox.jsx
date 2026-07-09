import { assets } from '@/assets/assets'
import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@clerk/nextjs';
import axios from 'axios';
import Image from 'next/image'
import React, { useRef, useState, useEffect } from 'react'
import toast from 'react-hot-toast';

const IMAGE_INTENT_REGEX = /\b(generate|create|draw|make|design|paint)\b[^.?!]{0,25}\b(image|picture|photo|drawing|illustration|artwork|wallpaper|logo|icon|painting)\b/i;

// Safe emoji constants - built from Unicode escapes instead of literal
// characters so they can never get mangled by terminal/console encoding
// (Windows PowerShell, cmd.exe, etc. often aren't UTF-8 by default).
const ICON = {
    paperclip: "\uD83D\uDCCE",
    close: "\u2715",
    picture: "\uD83D\uDDBC\uFE0F",
    research: "\uD83D\uDD0E",
    palette: "\uD83C\uDFA8",
    mic: "\uD83C\uDFA4",
};
const EM_DASH = "\u2014";

const PromptBox = ({setIsLoading, isLoading}) => {

    const [prompt, setPrompt] = useState('');
    const promptRef = useRef('');
    useEffect(() => { promptRef.current = prompt; }, [prompt]);
    const {user, chats, setChats, selectedChat, setSelectedChat, createNewChat} = useAppContext();
    const {getToken} = useAuth();
    const isSendingRef = useRef(false);
    const [attachedFile, setAttachedFile] = useState(null);
    const fileInputRef = useRef(null);
    const [isProcessingFile, setIsProcessingFile] = useState(false);
    const [showUploadMenu, setShowUploadMenu] = useState(false);
    const [useSearch, setUseSearch] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    const [imageMode, setImageMode] = useState(false);
    const [researchMode, setResearchMode] = useState(false);
    const [isResearching, setIsResearching] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const abortControllerRef = useRef(null);
    const menuRef = useRef(null);

    // Close the upload menu on outside click, so it behaves like a real menu.
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
        if (!selectedChat) {
            toast.error("Hang on, your chat is still loading.");
            return;
        }
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
            const combined = promptRef.current ? `${promptRef.current} ${transcript}` : transcript;
            setPrompt(combined);
            if (result.isFinal) {
                toast.success("Voice captured");
                sendPrompt({ preventDefault: () => {} }, combined);
            }
        };
        recognitionRef.current = recognition;
        recognition.start();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const name = file.name.toLowerCase();

        try {
            setIsProcessingFile(true);

            if (file.type.startsWith("image/")) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    setAttachedFile({
                        name: file.name,
                        type: 'image',
                        content: ev.target.result,
                        fileData: ev.target.result,
                        fileType: file.type
                    });
                    toast.success(`Attached: ${file.name}`);
                    setIsProcessingFile(false);
                };
                reader.readAsDataURL(file);

            } else if (name.endsWith(".pdf") || name.endsWith(".docx")){
                const token = await getToken();
                const formData = new FormData();
                formData.append("file", file);
                const { data } = await axios.post('/api/chat/extract', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        Authorization: `Bearer ${token}`
                    }
                });
                if (data.success) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        setAttachedFile({
                            name: file.name,
                            type: 'text',
                            content: data.text,
                            fileData: ev.target.result,
                            fileType: file.type || (name.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                        });
                        toast.success(`Attached: ${file.name}`);
                        setIsProcessingFile(false);
                    };
                    reader.readAsDataURL(file);
                } else {
                    toast.error(data.message || "Could not read file");
                    setIsProcessingFile(false);
                }

            } else {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const textContent = ev.target.result;
                    const dataReader = new FileReader();
                    dataReader.onload = (ev2) => {
                        setAttachedFile({
                            name: file.name,
                            type: 'text',
                            content: textContent,
                            fileData: ev2.target.result,
                            fileType: file.type || 'text/plain'
                        });
                        toast.success(`Attached: ${file.name}`);
                        setIsProcessingFile(false);
                    };
                    dataReader.readAsDataURL(file);
                };
                reader.readAsText(file);
            }
        } catch (error) {
            toast.error("Failed to process file: " + error.message);
            setIsProcessingFile(false);
        }
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
            if(isProcessingFile) return toast.error('Wait for the file to finish processing');
            if(!promptCopy.trim()) return;

            isSendingRef.current = true;
            setIsLoading(true)
            setPrompt("")

            const userPrompt = {
                role: "user",
                content: promptCopy,
                timestamp: Date.now(),
                ...(attachedFile && attachedFile.fileData ? {
                    fileName: attachedFile.name,
                    fileData: attachedFile.fileData,
                    fileType: attachedFile.fileType
                } : {})
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
                        setSelectedChat((prev) => ({ ...prev, messages:[...(prev?.messages || []), data.data] }));
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

            // Image generation path: triggers on explicit imageMode toggle OR detected intent in plain text
            const autoImageIntent = !imageMode && !attachedFile && IMAGE_INTENT_REGEX.test(promptCopy);

            if (imageMode || autoImageIntent) {
                setImageMode(false);
                const editImageBase64 = (attachedFile && attachedFile.type === 'image') ? attachedFile.content : null;
                if (editImageBase64) setAttachedFile(null);
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
            let imageBase64 = null;
            let fileMeta = null;

            if (attachedFile) {
                if (attachedFile.type === 'image') {
                    imageBase64 = attachedFile.content;
                    finalPrompt = promptCopy || "Describe this image.";
                    // Previously never set for images, so the attached image
                    // would display locally but disappear after a page
                    // refresh (never saved server-side). Now it's saved just
                    // like text/PDF attachments.
                    if (attachedFile.fileData) {
                        fileMeta = {
                            fileName: attachedFile.name,
                            fileData: attachedFile.fileData,
                            fileType: attachedFile.fileType
                        };
                    }
                } else {
                    finalPrompt = `${promptCopy}\n\n[Attached file: ${attachedFile.name}]\n${attachedFile.content}`;
                    if (attachedFile.fileData) {
                        fileMeta = {
                            fileName: attachedFile.name,
                            fileData: attachedFile.fileData,
                            fileType: attachedFile.fileType
                        };
                    }
                }
            }
            setAttachedFile(null);

            // Image path: non-streaming, single JSON response
            if (imageBase64) {
                const token = await getToken();
                const {data} = await axios.post('/api/chat/ai', {
                    chatId: activeChat._id,
                    prompt: finalPrompt,
                    displayPrompt: promptCopy,
                    imageBase64,
                    fileMeta
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
            setSelectedChat((prev) => ({ ...prev, messages: [...(prev?.messages || []), assistantMessage] }));
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
                        fileMeta
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
            {attachedFile && (
                <div style={{color: 'var(--text-secondary)'}} className='text-xs mb-2 flex items-center gap-2'>
                    <span>{ICON.paperclip}</span> {attachedFile.name}
                    <span onClick={()=>setAttachedFile(null)} className='cursor-pointer text-red-400'>{ICON.close}</span>
                </div>
            )}
            {imageMode && (
                <div className='text-xs text-purple-400 mb-2 flex items-center gap-2'>
                    <span>{ICON.picture}</span> Image mode {EM_DASH} describe what to generate{attachedFile?.type === 'image' ? ' or edit' : ''}
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
                <div style={{color: 'var(--text-muted)'}} className='text-xs mb-2'>Processing file...</div>
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
                    <input type='file' ref={fileInputRef} onChange={handleFileChange} accept='.txt,.md,.csv,.json,.pdf,.docx,image/*' className='hidden'/>
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
                                    <span style={{color: 'var(--text-muted)'}} className='text-xs'>Upload from computer</span>
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
                            <Image className='w-3.5 aspect-square' src={prompt.trim() ? assets.arrow_icon : assets.arrow_icon_dull} alt=''/>
                        </button>
                    )}
                </div>
            </div>
        </form>
    )
}

export default PromptBox;





