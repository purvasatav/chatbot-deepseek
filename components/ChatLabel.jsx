"use client"
import { useAppContext } from '@/context/AppContext'
import { useAuth } from '@clerk/nextjs'
import axios from 'axios'
import React, { useState } from 'react'
import toast from 'react-hot-toast'

const ChatLabel = ({openMenu, setOpenMenu, id, name, pinned}) => {

  const {fetchUsersChats, chats, setSelectedChat, pinChat, setExpand, setChatProject, clearChat, archiveChat, shareChat} = useAppContext()
  const {getToken} = useAuth()

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(name)
  const [addingProject, setAddingProject] = useState(false)
  const [projectValue, setProjectValue] = useState('')

  const selectChat = ()=>{
    const chatData = chats.find(chat => chat._id === id)
    if(chatData) setSelectedChat(chatData)
    if (window.innerWidth < 768) setExpand(false)
  }

  const startRename = (e) => {
    e.stopPropagation()
    setRenameValue(name)
    setRenaming(true)
    setOpenMenu({id: 0, open: false})
  }

  const submitRename = async () => {
    const newName = renameValue.trim()
    setRenaming(false)
    if (!newName || newName === name) return
    const token = await getToken()
    const {data} = await axios.post('/api/chat/rename', {chatId: id, name: newName}, {headers:{ Authorization: `Bearer ${token}` }})
    if(data.success){ fetchUsersChats(); toast.success(data.message) }else { toast.error(data.message) }
  }

  const deleteHandler = async () =>{
    const confirm = window.confirm('Delete this chat?')
    if(!confirm) return
    const token = await getToken()
    const {data} = await axios.post('/api/chat/delete', {chatId: id}, {headers:{ Authorization: `Bearer ${token}` }})
    if(data.success){ fetchUsersChats(); toast.success(data.message) }else { toast.error(data.message) }
    setOpenMenu({id: 0, open: false})
  }

  const pinHandler = async () => {
    await pinChat(id)
    setOpenMenu({id: 0, open: false})
  }

  const startAddProject = (e) => {
    e.stopPropagation()
    setProjectValue('')
    setAddingProject(true)
    setOpenMenu({id: 0, open: false})
  }

  const submitProject = async () => {
    setAddingProject(false)
    await setChatProject(id, projectValue.trim())
  }

  const clearHandler = async () => {
    const confirm = window.confirm('Clear all messages?')
    if (!confirm) return
    await clearChat(id)
    setOpenMenu({id: 0, open: false})
  }

  const archiveHandler = async () => {
    await archiveChat(id)
    setOpenMenu({id: 0, open: false})
  }

  const shareHandler = async () => {
    await shareChat(id)
    setOpenMenu({id: 0, open: false})
  }

  const exportHandler = () => {
    const chatData = chats.find(chat => chat._id === id)
    if (!chatData) return
    const lines = chatData.messages.map(m => `${m.role.toUpperCase()}:${m.content}`).join('\n\n')
    const blob = new Blob([lines], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${chatData.name.replace(/[^a-z0-9]/gi, '_')}.txt`
    a.click()
    URL.revokeObjectURL(url)
    setOpenMenu({id: 0, open: false})
  }

  const isMenuOpen = openMenu.id === id && openMenu.open

  if (renaming) {
    return (
      <div className='p-2'>
        <input
          autoFocus
          value={renameValue}
          onChange={(e)=> setRenameValue(e.target.value)}
          onKeyDown={(e)=>{ if(e.key==='Enter') submitRename(); if(e.key==='Escape') setRenaming(false) }}
          onBlur={submitRename}
          style={{color: 'var(--text-primary)', borderColor: 'var(--border-color)'}}
          className='w-full bg-white/5 text-sm px-2 py-1.5 rounded-lg outline-none border'
        />
      </div>
    )
  }

  if (addingProject) {
    return (
      <div className='p-2'>
        <input
          autoFocus
          placeholder='Project name'
          value={projectValue}
          onChange={(e)=> setProjectValue(e.target.value)}
          onKeyDown={(e)=>{ if(e.key==='Enter') submitProject(); if(e.key==='Escape') setAddingProject(false) }}
          onBlur={submitProject}
          style={{color: 'var(--text-primary)', borderColor: 'var(--border-color)'}}
          className='w-full bg-white/5 text-sm px-2 py-1.5 rounded-lg outline-none border'
        />
      </div>
    )
  }

  return (
    <div className='relative'>
      <div onClick={selectChat} style={{color: 'var(--text-secondary)'}} className='flex items-center justify-between p-2 hover:bg-white/10 rounded-lg text-sm cursor-pointer'>
        <p className='truncate flex-1 flex items-center gap-2'>
          <span className='opacity-50'>{pinned ? '📌' : '💬'}</span>
          {name}
        </p>
        <button
          onClick={(e)=>{ e.stopPropagation(); setOpenMenu({id: id, open: !isMenuOpen}) }}
          style={{color: 'var(--text-muted)'}}
          className='px-2 hover:opacity-80'
        >
          •••
        </button>
      </div>

      {isMenuOpen && (
        <div style={{backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)', color: 'var(--text-primary)'}} className='absolute right-0 top-9 border rounded-lg w-44 py-1 z-50 shadow-xl flex flex-col'>
          <button onClick={pinHandler} className='text-left px-3 py-2 text-sm hover:bg-white/10'>{pinned ? 'Unpin' : 'Pin'}</button>
          <button onClick={startRename} className='text-left px-3 py-2 text-sm hover:bg-white/10'>Rename</button>
          <button onClick={shareHandler} className='text-left px-3 py-2 text-sm hover:bg-white/10'>Share / Copy link</button>
          <button onClick={startAddProject} className='text-left px-3 py-2 text-sm hover:bg-white/10'>Add to Project</button>
          <button onClick={exportHandler} className='text-left px-3 py-2 text-sm hover:bg-white/10'>Export Chat</button>
          <button onClick={clearHandler} className='text-left px-3 py-2 text-sm hover:bg-white/10'>Clear Chat</button>
          <button onClick={archiveHandler} className='text-left px-3 py-2 text-sm hover:bg-white/10'>Archive</button>
          <button onClick={deleteHandler} className='text-left px-3 py-2 text-sm text-red-400 hover:bg-white/10'>Delete</button>
        </div>
      )}
    </div>
  )
}

export default ChatLabel

