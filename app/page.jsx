'use client';
import { assets } from "@/assets/assets";
import Message from "@/components/Message";
import PromptBox from "@/components/PromptBox";
import Sidebar from "@/components/Sidebar";
import { useAppContext } from "@/context/AppContext";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

export default function Home() {

  const [isLoading, setIsLoading] = useState(false);
  const {selectedChat, expand, setExpand, fetchUsersChats, clearChat, archiveChat, pinChat, shareChat} = useAppContext();
  const {getToken} = useAuth();
  const containerRef = useRef(null);
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const messages = selectedChat?.messages || [];

  useEffect(()=>{
    if(containerRef.current){
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  },[messages.length, messages[messages.length - 1]?.content]);

  useEffect(()=>{
    const handleClickOutside = (e) => {
      if (!expand) return;
      const sidebarEl = document.getElementById('app-sidebar');
      if (sidebarEl && !sidebarEl.contains(e.target)) {
        setExpand(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expand]);

  const attachedFiles = messages.filter(m => m.fileName);

  const startRenameTitle = () => {
    if (!selectedChat) return;
    setRenameValue(selectedChat.name);
    setRenamingTitle(true);
    setTitleMenuOpen(false);
  }

  const submitRenameTitle = async () => {
    const newName = renameValue.trim();
    setRenamingTitle(false);
    if (!newName || newName === selectedChat.name) return;
    try {
      const token = await getToken();
      const {data} = await axios.post('/api/chat/rename', {chatId: selectedChat._id, name: newName}, {headers:{ Authorization: `Bearer ${token}` }});
      if (data.success) {
        toast.success(data.message);
        fetchUsersChats();
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error.message);
    }
  }

  const shareCurrentChat = async () => {
    if (!selectedChat) return;
    await shareChat(selectedChat._id);
    setTitleMenuOpen(false);
  }

  const exportCurrentChat = () => {
    if (!selectedChat) return;
    const lines = selectedChat.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedChat.name || 'chat'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Chat exported');
    setTitleMenuOpen(false);
  }

  const clearCurrentChat = async () => {
    if (!selectedChat) return;
    const confirm = window.confirm('Clear all messages in this chat?');
    if (!confirm) return;
    await clearChat(selectedChat._id);
    setTitleMenuOpen(false);
  }

  const archiveCurrentChat = async () => {
    if (!selectedChat) return;
    await archiveChat(selectedChat._id);
    setTitleMenuOpen(false);
  }

  const pinCurrentChat = async () => {
    if (!selectedChat) return;
    await pinChat(selectedChat._id);
    setTitleMenuOpen(false);
  }

  const viewFilesInChat = () => {
    if (attachedFiles.length === 0) { toast.error("No files in this chat"); setTitleMenuOpen(false); return; }
    setShowFilesPanel(true);
    setTitleMenuOpen(false);
  }

  const openFileFromPanel = (msg) => {
    const win = window.open();
    if (win) {
      win.document.write(`<iframe src="${msg.fileData}" style="width:100%;height:100%;border:none;"></iframe>`);
    } else {
      toast.error("Popup blocked — please allow popups to view the file");
    }
  }
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') {
                e.preventDefault()
                const newChatBtn = document.querySelector('[data-new-chat-btn]')
                if (newChatBtn) newChatBtn.click()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

  return (
    <div>
      <div className="flex h-screen">
        <div id="app-sidebar">
          <Sidebar expand={expand} setExpand={setExpand}/>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8 relative" style={{backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)'}}>
          <div className="md:hidden absolute px-4 top-6 flex items-center justify-between w-full">
            <Image onClick={()=> (expand ? setExpand(false) : setExpand(true))}
             className="rotate-180" src={assets.menu_icon} alt=""/>
            <Image className="opacity-70" src={assets.chat_icon} alt=""/>
          </div>

          {!selectedChat || messages.length === 0 ? (
            <>
            <div className="flex items-center gap-3">
              <Image src={assets.logo_icon} alt="" className="h-16"/>
              <p className="text-2xl font-medium">Hi, I'm DeepSeek.</p>
            </div>
            <p className="text-sm mt-2">How can I help you today?</p>
            </>
          ) : (
          <div ref={containerRef}
          className="relative flex flex-col items-center justify-start w-full mt-20 max-h-screen overflow-y-auto"
          >
          <div className="fixed top-8 flex items-center gap-2 z-40">
            {renamingTitle ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e)=> setRenameValue(e.target.value)}
                onKeyDown={(e)=>{ if(e.key==='Enter') submitRenameTitle(); if(e.key==='Escape') setRenamingTitle(false) }}
                onBlur={submitRenameTitle}
                style={{borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'transparent'}}
                className="border py-1 px-2 rounded-lg font-semibold text-sm outline-none"
              />
            ) : (
              <p style={{borderColor: 'transparent'}} className="hover:border-gray-500/50 border py-1 px-2 rounded-lg font-semibold cursor-pointer" onClick={startRenameTitle}>{selectedChat?.name}</p>
            )}
            <button style={{borderColor: 'var(--border-color)'}} onClick={shareCurrentChat} className="text-xs border rounded-lg px-2 py-1 hover:bg-white/10">Share</button>
            <div className="relative">
              <button style={{borderColor: 'var(--border-color)'}} onClick={()=>setTitleMenuOpen(!titleMenuOpen)} className="text-xs border rounded-lg px-2 py-1 hover:bg-white/10">•••</button>
              {titleMenuOpen && (
                <div style={{backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)'}} className="absolute top-8 left-0 rounded-xl p-2 w-max z-50 shadow-xl">
                  <div onClick={viewFilesInChat} className="px-3 py-2 hover:bg-white/10 rounded-lg cursor-pointer text-sm flex items-center gap-2">
                    📎 View files in chat {attachedFiles.length > 0 && <span style={{color: 'var(--text-muted)'}} className='text-xs'>({attachedFiles.length})</span>}
                  </div>
                  <div onClick={pinCurrentChat} className="px-3 py-2 hover:bg-white/10 rounded-lg cursor-pointer text-sm flex items-center gap-2">
                    📌 {selectedChat?.pinned ? 'Unpin Chat' : 'Pin Chat'}
                  </div>
                  <div onClick={startRenameTitle} className="px-3 py-2 hover:bg-white/10 rounded-lg cursor-pointer text-sm flex items-center gap-2">✏️ Rename</div>
                  <div onClick={exportCurrentChat} className="px-3 py-2 hover:bg-white/10 rounded-lg cursor-pointer text-sm flex items-center gap-2">⬇️ Export Chat</div>
                  <div onClick={clearCurrentChat} className="px-3 py-2 hover:bg-white/10 rounded-lg cursor-pointer text-sm flex items-center gap-2">🧹 Clear Chat</div>
                  <div onClick={archiveCurrentChat} className="px-3 py-2 hover:bg-white/10 rounded-lg cursor-pointer text-sm flex items-center gap-2">📁 Archive</div>
                </div>
              )}
            </div>
          </div>

          {showFilesPanel && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={()=>setShowFilesPanel(false)}>
              <div style={{backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)'}} className="w-full max-w-md rounded-2xl p-5 max-h-[70vh] overflow-y-auto" onClick={(e)=>e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium">Files in this chat</h3>
                  <button onClick={()=>setShowFilesPanel(false)} style={{color: 'var(--text-muted)'}} className="hover:opacity-80">✕</button>
                </div>
                {attachedFiles.length === 0 ? (
                  <p style={{color: 'var(--text-muted)'}} className="text-sm">No files attached in this chat.</p>
                ) : (
                  <div className="space-y-2">
                    {attachedFiles.map((msg, i) => (
                      <div key={i} onClick={()=>openFileFromPanel(msg)} className="flex items-center gap-3 bg-white/5 hover:bg-white/10 cursor-pointer rounded-lg px-3 py-2.5">
                        <div className="w-9 h-9 rounded-lg bg-red-500 flex items-center justify-center shrink-0">
                          <span className="text-white text-xs font-bold">PDF</span>
                        </div>
                        <p className="text-sm truncate">{msg.fileName}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {messages.map((msg, index)=>(
            <Message
              key={index}
              index={index}
              role={msg.role}
              content={msg.content}
              isLast={index === messages.length - 1}
              chatId={selectedChat?._id}
              fileName={msg.fileName}
              fileData={msg.fileData}
              fileType={msg.fileType}
            />
          ))}
          {
            isLoading && (
              <div className="flex gap-4 max-w-3xl w-full py-3">
                <Image className="h-9 w-9 p-1 border border-white/15 rounded-full"
                 src={assets.logo_icon} alt="Logo"/>
                 <div className="loader flex justify-center items-center gap-1">
                  <div className="w-1 h-1 rounded-full bg-white animate-bounce"></div>
                  <div className="w-1 h-1 rounded-full bg-white animate-bounce"></div>
                  <div className="w-1 h-1 rounded-full bg-white animate-bounce"></div>
                 </div>
              </div>
            )
          }
          </div>
        )}
        <PromptBox isLoading={isLoading} setIsLoading={setIsLoading}/>

        </div>
      </div>
    </div>
  );
}