"use client";
import { useAuth, useUser } from "@clerk/nextjs";
import axios from "axios";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

export const AppContext = createContext();
export const useAppContext = ()=> useContext(AppContext);

export const AppContextProvider = ({children})=>{
    const {user} = useUser()
    const {getToken} = useAuth()
    const [chats, setChats] = useState([]);
    const [selectedChat, setSelectedChat] = useState(null);
    const [expand, setExpand] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [hasInitialized, setHasInitialized] = useState(false);
    const pollRef = useRef(null);

    const copyToClipboard = async (text) => {
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                // fall through to fallback
            }
        }
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(textarea);
            return success;
        } catch (err) {
            return false;
        }
    }

    // Returns the newly created chat object if the API provides it,
    // otherwise null (caller decides whether a re-fetch is needed).
    const createNewChat = async ()=>{
        try {
            if(!user) return null;
            const token = await getToken();
            const {data} = await axios.post("/api/chat/create", {},{headers:{ Authorization: `Bearer ${token}` }})
            if (data?.success && data?.data) {
                setChats((prev)=> sortChats([data.data, ...prev]));
                setSelectedChat(data.data);
                if (window.innerWidth < 768) setExpand(false);
            }
            return data?.data || null;
        } catch (error) {
            console.log(error.message);
            return null;
        }
    }

    const sortChats = (list) => {
        return [...list].sort((a, b) => {
            if (a.pinned !== b.pinned) return b.pinned - a.pinned;
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });
    }

    // Regular refresh (after actions like pin/archive/delete/etc).
    // Only creates a chat if the list is truly empty AND we need a selection.
    const fetchUsersChats = async (selectNewest = false)=>{
        try {
            const token = await getToken();
            const {data} = await axios.get("/api/chat/get", {headers:{Authorization: `Bearer ${token}` }})
            if(data.success){
                let list = data.data;

                if ((selectNewest || !selectedChat) && list.length === 0) {
                    const created = await createNewChat();
                    if (created) list = [created];
                }

                const sorted = sortChats(list);
                setChats(sorted);

                if (selectNewest || !selectedChat) {
                    const newest = [...list].sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt))[0];
                    setSelectedChat(newest || null);
                } else {
                    const updated = list.find(c => c._id === selectedChat._id);
                    if (updated) {
                        setSelectedChat((prev) => {
                            if (!prev) return updated;
                            // Guard against a background refresh landing before the
                            // server has saved a just-sent message: never let a
                            // fetch with FEWER messages overwrite what's already
                            // showing locally, or the newest user/assistant bubble
                            // can silently vanish.
                            if ((updated.messages?.length || 0) < (prev.messages?.length || 0)) {
                                return { ...updated, messages: prev.messages };
                            }
                            return updated;
                        });
                    }
                }
            }
        } catch (error) { console.log(error.message)}
    }

    const pollForTitleUpdate = () => {
        if (pollRef.current) clearInterval(pollRef.current);
        let attempts = 0;
        pollRef.current = setInterval(() => {
            attempts += 1;
            fetchUsersChats();
            if (attempts >= 6) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        }, 2000);
    }

    // Initial-load path only. One GET, then at most one POST create —
    // no redundant second GET unless the create endpoint doesn't return
    // the new chat object. This is only used once on mount; it doesn't
    // return anything meaningful, so components should NOT call this
    // expecting a chat object back — use createNewChat for that.
    const startFreshChat = async () => {
        try {
            const token = await getToken();
            const {data} = await axios.get("/api/chat/get", {headers:{Authorization: `Bearer ${token}` }});
            let list = data.success ? data.data : [];
            const newest = [...list].sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt))[0];

            if (!newest || newest.messages.length > 0) {
                const created = await createNewChat();
                if (created) {
                    setChats(sortChats([created, ...list]));
                    setSelectedChat(created);
                    return;
                }
                // Fallback: create route didn't return the chat, re-fetch once.
                const token2 = await getToken();
                const retry = await axios.get("/api/chat/get", {headers:{Authorization: `Bearer ${token2}` }});
                if (retry.data.success) {
                    const retryList = retry.data.data;
                    setChats(sortChats(retryList));
                    const retryNewest = [...retryList].sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt))[0];
                    setSelectedChat(retryNewest || null);
                }
                return;
            }

            setChats(sortChats(list));
            setSelectedChat(newest);
        } catch (error) {
            console.log(error.message);
        }
    }

    const pinChat = async (chatId) => {
        try {
            const token = await getToken();
            const {data} = await axios.post("/api/chat/pin", {chatId},{headers:{ Authorization: `Bearer ${token}` }})
            if(data.success){
                toast.success(data.message);
                fetchUsersChats();
            } else {
                toast.error(data.message);
            }
        } catch (error) { toast.error(error.message); }
    }

    const setChatProject = async (chatId, project) => {
        try {
            const token = await getToken();
            const {data} = await axios.post("/api/chat/project", {chatId, project}, {headers:{ Authorization: `Bearer ${token}` }})
            if(data.success){
                toast.success(data.message);
                fetchUsersChats();
            } else {
                toast.error(data.message);
            }
        } catch (error) { toast.error(error.message); }
    }

    const clearChat = async (chatId) => {
        try {
            const token = await getToken();
            const {data} = await axios.post("/api/chat/clear", {chatId}, {headers:{ Authorization: `Bearer ${token}` }})
            if(data.success){
                toast.success(data.message);
                // Update directly instead of relying on fetchUsersChats' generic
                // refresh, since that path now guards against message counts
                // shrinking (to protect against a stale-fetch race elsewhere) -
                // an intentional clear needs to bypass that guard.
                if (selectedChat?._id === chatId) {
                    setSelectedChat((prev) => prev ? { ...prev, messages: [] } : prev);
                }
                setChats((prevChats) => prevChats.map((chat) =>
                    chat._id === chatId ? { ...chat, messages: [] } : chat
                ));
            } else {
                toast.error(data.message);
            }
        } catch (error) { toast.error(error.message); }
    }

    const archiveChat = async (chatId) => {
        try {
            const token = await getToken();
            const {data} = await axios.post("/api/chat/archive", {chatId}, {headers:{ Authorization: `Bearer ${token}` }})
            if(data.success){
                toast.success(data.message);
                fetchUsersChats();
            } else {
                toast.error(data.message);
            }
        } catch (error) { toast.error(error.message); }
    }

    const deleteChat = async (chatId) => {
        try {
            const token = await getToken();
            const {data} = await axios.post("/api/chat/delete", {chatId}, {headers:{ Authorization: `Bearer ${token}` }})
            if(data.success){
                toast.success(data.message);
                if (selectedChat?._id === chatId) {
                    setSelectedChat(null);
                }
                fetchUsersChats(true);
            } else {
                toast.error(data.message);
            }
        } catch (error) { toast.error(error.message); }
    }

    const shareChat = async (chatId) => {
        try {
            const token = await getToken();
            const { data } = await axios.post("/api/chat/share", { chatId }, { headers: { Authorization: `Bearer ${token}` } });
            if (data.success) {
                if (data.shared) {
                    const url = `${window.location.origin}/share/${data.shareId}`;
                    const copied = await copyToClipboard(url);
                    if (copied) {
                        toast.success("Share link copied to clipboard");
                    } else {
                        toast.success(`Link ready: ${url}`);
                    }
                } else {
                    toast.success("Sharing disabled");
                }
                fetchUsersChats();
            } else {
                toast.error(data.message || "Could not update sharing");
            }
        } catch (error) {
            toast.error(error.message);
        }
    }

    const regenerateResponse = async (chatId) => {
        try {
            const token = await getToken();
            const {data} = await axios.post("/api/chat/regenerate", {chatId}, {headers:{ Authorization: `Bearer ${token}` }})
            if(data.success){
                setSelectedChat((prev) => {
                    if (!prev) return prev;
                    return { ...prev, messages: [...prev.messages.slice(0, -1), data.data] };
                });
                setChats((prevChats)=>prevChats.map((chat)=>
                    chat._id === chatId ?
                    {...chat, messages: [...chat.messages.slice(0, -1),data.data]} : chat
                ))
            } else {
                toast.error(data.message || "Could not regenerate");
            }
        } catch (error) { toast.error(error.message); }
    }

    const editMessage = async (chatId, messageIndex,newContent) => {
        try {
            const token = await getToken();
            const {data} = await axios.post("/api/chat/edit", {chatId,messageIndex, newContent}, {headers:{ Authorization: `Bearer ${token}`}})
            if(data.success){
                setSelectedChat((prev) => {
                    if (!prev) return prev;
                    return { ...prev, messages: data.data };
                });
                setChats((prevChats)=>prevChats.map((chat)=>
                    chat._id === chatId ?
                    {...chat, messages: data.data} :chat
                ))
            } else {
                toast.error(data.message || "Could not edit message");
            }
        } catch (error) { toast.error(error.message); }
    }

    const deleteMessage = async (chatId, messageIndex) => {
        try {
            const token = await getToken();
            const {data} = await axios.post("/api/chat/delete-message",{chatId, messageIndex}, {headers:{Authorization: `Bearer ${token}` }})
            if(data.success){
                setSelectedChat((prev) => {
                    if (!prev) return prev;
                    return { ...prev, messages: data.data };
                });
                setChats((prevChats)=>prevChats.map((chat)=>
                    chat._id === chatId ?
                    {...chat, messages: data.data} :chat
                ))
            } else {
                toast.error(data.message || "Could not delete message");
            }
        } catch (error) { toast.error(error.message); }
    }

    useEffect(()=>{
        if(user && !hasInitialized){
            setHasInitialized(true);
            startFreshChat();
        }
    }, [user])

    useEffect(() => {
        if (!hasInitialized) return
        if (!selectedChat && chats.length > 0) {
            const newest = [...chats].sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt))[0]
            setSelectedChat(newest)
        }
    }, [chats, hasInitialized])

    useEffect(() => {
        if (selectedChat && selectedChat.name === "New Chat" && selectedChat.messages?.length > 0) {
            pollForTitleUpdate();
        }
        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        }
    }, [selectedChat?._id, selectedChat?.messages?.length])

    const nonArchivedChats = chats.filter(c => !c.archived);
    const archivedChats = chats.filter(c => c.archived);

    const filteredChats = searchTerm.trim()
        ? nonArchivedChats.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
        : nonArchivedChats;

    const projectNames = [...new Set(chats.filter(c => c.project).map(c=> c.project))];

    const value = {
        user, chats, setChats, selectedChat, setSelectedChat, fetchUsersChats,
        // IMPORTANT: components (e.g. PromptBox) call createNewChat() and expect
        // the created chat object back, so this must point at the real
        // createNewChat function (which returns data?.data || null) — NOT at
        // startFreshChat, which never returns a value and is only meant for the
        // one-time initial-load effect below.
        createNewChat, startFreshChat, pinChat, expand, setExpand,
        searchTerm, setSearchTerm, filteredChats, setChatProject, projectNames,
        clearChat, archiveChat, archivedChats, regenerateResponse, editMessage, deleteMessage, deleteChat, shareChat
    }
    return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}