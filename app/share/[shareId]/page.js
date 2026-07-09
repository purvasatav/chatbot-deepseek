"use client"
import axios from 'axios'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const SharedChatPage = () => {
    const { shareId } = useParams()
    const [chat, setChat] = useState(null)
    const [error, setError] = useState('')

    useEffect(() => {
        (async () => {
            try {
                const { data } = await axios.get(`/api/chat/share/${shareId}`)
                if (data.success) {
                    setChat(data.data)
                } else {
                    setError(data.message || 'Chat not found')
                }
            } catch (err) {
                setError('Could not load this chat')
            }
        })()
    }, [shareId])

    if (error) {
        return (
            <div className='min-h-screen flex items-center justify-center bg-neutral-950 text-white'>
                <p className='text-sm opacity-70'>{error}</p>
            </div>
        )
    }

    if (!chat) {
        return (
            <div className='min-h-screen flex items-center justify-center bg-neutral-950 text-white'>
                <p className='text-sm opacity-70'>Loading shared chat...</p>
            </div>
        )
    }

    return (
        <div className='min-h-screen bg-neutral-950 text-white'>
            <div className='max-w-2xl mx-auto px-4 py-8'>
                <p className='text-xs opacity-50 mb-1'>Shared conversation</p>
                <h1 className='text-xl font-semibold mb-6'>{chat.name}</h1>
                <div className='flex flex-col gap-4'>
                    {chat.messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-white/10' : 'bg-white/5'}`}>
                                {m.content}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default SharedChatPage
