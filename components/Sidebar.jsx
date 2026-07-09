import { assets } from '@/assets/assets'
import Image from 'next/image'
import React, { useState } from 'react'
import { useClerk, UserButton } from '@clerk/nextjs'
import { useAppContext } from '@/context/AppContext'
import ChatLabel from './ChatLabel'
import SettingsModal from './SettingsModal'

const Sidebar = ({expand, setExpand}) => {

    const {openSignIn, signOut} = useClerk()
    const {user, chats, filteredChats, searchTerm, setSearchTerm, projectNames, archivedChats, selectedChat, setSelectedChat, setChats} = useAppContext()
    const [openMenu, setOpenMenu] = useState({id: 0, open: false})
    const [showArchived, setShowArchived] = useState(false)
    const [showSettings, setShowSettings] = useState(false)
    const [settingsTab, setSettingsTab] = useState('General')
    const [showProfileMenu, setShowProfileMenu] = useState(false)

    const pinnedChats = filteredChats.filter(c => c.pinned)
    const unpinnedChats = filteredChats.filter(c => !c.pinned)
    const ungroupedChats = unpinnedChats.filter(c => !c.project)

    const openSettingsTab = (tab) => {
        setSettingsTab(tab)
        setShowSettings(true)
        setShowProfileMenu(false)
    }

    const handleLogout = async () => {
        setShowProfileMenu(false)
        await signOut({ redirectUrl: '/' })
    }

  return (
    <div
      style={{backgroundColor: 'var(--bg-sidebar)', color: 'var(--text-primary)'}}
      className={`flex flex-col justify-between pt-5 transition-all z-50 max-md:absolute max-md:h-screen ${expand ? 'p-3 w-64' : 'md:w-20 w-0 max-md:overflow-hidden'}`}
    >
      <div className='overflow-y-auto flex-1'>

        <div className={`flex items-center px-2 pb-4 ${expand ? "justify-between" : "flex-col gap-6"}`}>
            <Image className={expand ? "w-28" : "w-9"} src={expand ? assets.logo_text : assets.logo_icon} alt=''/>
            <div onClick={()=> expand ? setExpand(false) : setExpand(true)}
             className='hover:bg-white/10 transition h-8 w-8 flex items-center justify-center rounded-lg cursor-pointer'>
                <Image src={assets.menu_icon} alt='' className='md:hidden w-5'/>
                <Image src={expand ? assets.sidebar_close_icon : assets.sidebar_icon} alt='' className='hidden md:block w-5'/>
            </div>
        </div>

        <button data-new-chat-btn onClick={()=> setSelectedChat(null)} style={{color: 'var(--text-primary)'}} className='flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-white/10 transition text-sm mb-2'>
            <Image className='w-5' src={assets.chat_icon} alt=''/>
            {expand && <span>New chat</span>}
        </button>

        {expand && (
            <input
                type='text'
                placeholder='Search chats...'
                value={searchTerm}
                onChange={(e)=> setSearchTerm(e.target.value)}
                style={{color: 'var(--text-primary)', borderColor: 'var(--border-color)'}}
                className='w-full bg-white/5 text-sm px-3 py-2 rounded-lg outline-none border placeholder:opacity-40 mb-4'
            />
        )}

        {expand && pinnedChats.length > 0 && (
            <div className='mb-4'>
                <p style={{color: 'var(--text-muted)'}} className='text-xs font-semibold px-2 mb-1'>Pinned</p>
                {pinnedChats.map((chat)=> (
                    <ChatLabel key={chat._id} name={chat.name} id={chat._id} pinned={chat.pinned} openMenu={openMenu} setOpenMenu={setOpenMenu}/>
                ))}
            </div>
        )}

        {expand && projectNames.length > 0 && (
            <div className='mb-4'>
                <p style={{color: 'var(--text-muted)'}} className='text-xs font-semibold px-2 mb-1'>Projects</p>
                {projectNames.map((proj)=>(
                    <div key={proj} className='mb-1'>
                        <div style={{color: 'var(--text-secondary)'}} className='flex items-center gap-2 px-2 py-1.5 text-sm'>
                            <span>📁</span>
                            <span className='truncate'>{proj}</span>
                        </div>
                        <div className='pl-4'>
                            {unpinnedChats.filter(c => c.project === proj).map((chat)=> (
                                <ChatLabel key={chat._id} name={chat.name} id={chat._id} pinned={chat.pinned} openMenu={openMenu} setOpenMenu={setOpenMenu}/>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        )}

        {expand && (
            <div>
                <p style={{color: 'var(--text-muted)'}} className='text-xs font-semibold px-2 mb-1'>Chats</p>
                {ungroupedChats.map((chat)=> <ChatLabel key={chat._id} name={chat.name} id={chat._id} pinned={chat.pinned} openMenu={openMenu} setOpenMenu={setOpenMenu}/>)}
            </div>
        )}

        {expand && archivedChats.length > 0 && (
            <div className='mb-4 mt-2'>
                <div
                    onClick={()=> setShowArchived(!showArchived)}
                    className='flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-white/5 rounded-lg'
                >
                    <p style={{color: 'var(--text-muted)'}} className='text-xs font-semibold'>Archived ({archivedChats.length})</p>
                    <span style={{color: 'var(--text-muted)'}} className={`text-xs transition-transform ${showArchived ? 'rotate-90' : ''}`}>▶</span>
                </div>
                {showArchived && archivedChats.map((chat)=> (
                    <ChatLabel key={chat._id} name={chat.name} id={chat._id} pinned={chat.pinned} openMenu={openMenu} setOpenMenu={setOpenMenu}/>
                ))}
            </div>
        )}
      </div>

      <div style={{borderColor: 'var(--border-color)'}} className='border-t pt-3'>
        <SettingsModal
            isOpen={showSettings}
            onClose={()=> setShowSettings(false)}
            initialTab={settingsTab}
        />

        <div className='relative'>
            {showProfileMenu && (
                <>
                <div className='fixed inset-0 z-40' onClick={()=> setShowProfileMenu(false)}/>
                <div
                    style={{backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)', color: 'var(--text-primary)'}}
                    className='absolute bottom-12 left-0 border rounded-xl w-56 py-2 shadow-xl z-50'
                >
                    <button onClick={()=> openSettingsTab('Personalization')} className='w-full text-left px-4 py-2 text-sm hover:bg-white/10 flex items-center gap-3'>
                        <span>🎨</span> Personalization
                    </button>
                    <button onClick={()=> openSettingsTab('General')} className='w-full text-left px-4 py-2 text-sm hover:bg-white/10 flex items-center gap-3'>
                        <span>⚙️</span> Settings
                    </button>
                    <button onClick={()=> openSettingsTab('Help')} className='w-full text-left px-4 py-2 text-sm hover:bg-white/10 flex items-center gap-3'>
                        <span>❓</span> Help
                    </button>
                    <div style={{borderColor: 'var(--border-color)'}} className='border-t my-1'/>
                    <button onClick={handleLogout} className='w-full text-left px-4 py-2 text-sm hover:bg-white/10 flex items-center gap-3 text-red-400'>
                        <span>↩️</span> Log out
                    </button>
                </div>
                </>
            )}
            <div onClick={()=> user ? setShowProfileMenu(!showProfileMenu) : openSignIn()}
             style={{color: 'var(--text-secondary)'}}
             className={`flex items-center ${expand ? 'gap-2 px-2' : 'justify-center'} py-2 cursor-pointer text-sm hover:bg-white/10 rounded-lg`}>
                {user ? <UserButton/> : <Image src={assets.profile_icon} alt='' className='w-7'/>}
                {expand && <span>My Profile</span>}
            </div>
        </div>
      </div>

    </div>
  )
}

export default Sidebar