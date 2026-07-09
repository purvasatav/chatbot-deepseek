"use client"
import { useAuth, useClerk } from '@clerk/nextjs'
import axios from 'axios'
import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTheme } from '@/context/ThemeContext'
import { useAppContext } from '@/context/AppContext'

const TABS = ['General', 'Personalization', 'Appearance', 'Voice', 'Memory', 'Data Controls', 'Security', 'Help']
const ACCENT_COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#dc2626', '#0891b2']

const SettingsModal = ({ isOpen, onClose, initialTab }) => {
    const { getToken } = useAuth()
    const { signOut, openUserProfile } = useClerk()
    const { theme, setTheme } = useTheme()
    const { fetchUsersChats } = useAppContext()
    const [activeTab, setActiveTab] = useState('General')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [voices, setVoices] = useState([])
    const [form, setForm] = useState({
        customInstructions: '',
        tone: 'neutral',
        responseLength: 'medium',
        model: 'openai/gpt-oss-120b',
        accentColor: '#2563eb',
        voiceName: '',
        voiceRate: 1,
        desktopNotifications: false,
    })

    useEffect(() => {
        if (isOpen && initialTab) setActiveTab(initialTab)
    }, [isOpen, initialTab])

    useEffect(() => {
        if (!isOpen) return
        (async () => {
            try {
                setLoading(true)
                const token = await getToken()
                const { data } = await axios.get('/api/settings', { headers: { Authorization: `Bearer ${token}` } })
                if (data.success && data.data) {
                    const { customInstructions, tone, responseLength, model, accentColor, voiceName, voiceRate, desktopNotifications } = data.data
                    setForm({
                        customInstructions: customInstructions || '',
                        tone: tone || 'neutral',
                        responseLength: responseLength || 'medium',
                        model: model || 'openai/gpt-oss-120b',
                        accentColor: accentColor || '#2563eb',
                        voiceName: voiceName || '',
                        voiceRate: voiceRate ?? 1,
                        desktopNotifications: !!desktopNotifications,
                    })
                }
            } catch (error) {
                toast.error('Could not load settings')
            } finally {
                setLoading(false)
            }
        })()
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        const loadVoices = () => setVoices(window.speechSynthesis?.getVoices() || [])
        loadVoices()
        window.speechSynthesis?.addEventListener('voiceschanged', loadVoices)
        return () => window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices)
    }, [isOpen])

    useEffect(() => {
        document.documentElement.style.setProperty('--color-primary', form.accentColor)
    }, [form.accentColor])

    const save = async () => {
        try {
            setSaving(true)
            const token = await getToken()
            const { data } = await axios.post('/api/settings', { ...form, theme }, { headers: { Authorization: `Bearer ${token}` } })
            if (data.success) {
                toast.success('Settings saved')
                onClose()
            } else {
                toast.error(data.message || 'Could not save settings')
            }
        } catch (error) {
            toast.error(error.message)
        } finally {
            setSaving(false)
        }
    }

    const exportData = async () => {
        try {
            const token = await getToken()
            const { data } = await axios.get('/api/settings/export', { headers: { Authorization: `Bearer ${token}` } })
            if (data.success) {
                const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'deepseek-chats-export.json'
                a.click()
                URL.revokeObjectURL(url)
                toast.success('Export downloaded')
            }
        } catch (error) {
            toast.error('Export failed')
        }
    }

    const deleteAllChats = async () => {
        if (!window.confirm('Delete ALL your chats? This cannot be undone.')) return
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/chat/clear-all', {}, { headers: { Authorization: `Bearer ${token}` } })
            if (data.success) {
                toast.success('All chats deleted')
                fetchUsersChats(true)
                onClose()
            } else {
                toast.error(data.message || 'Could not delete chats')
            }
        } catch (error) {
            toast.error(error.message)
        }
    }

    const deleteAccount = async () => {
        if (!window.confirm('This permanently deletes all your chats and settings. Continue?')) return
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/settings/delete-account', {}, { headers: { Authorization: `Bearer ${token}` } })
            if (data.success) {
                toast.success('All data deleted')
                onClose()
                window.location.reload()
            } else {
                toast.error(data.message || 'Could not delete data')
            }
        } catch (error) {
            toast.error(error.message)
        }
    }

    const testVoice = () => {
        if (!window.speechSynthesis) { toast.error('Voice not supported in this browser'); return }
        const utter = new SpeechSynthesisUtterance("Hi, this is how I'll sound.")
        const voice = voices.find(v => v.name === form.voiceName)
        if (voice) utter.voice = voice
        utter.rate = form.voiceRate
        window.speechSynthesis.speak(utter)
    }

    const requestNotifications = async () => {
        if (!('Notification' in window)) { toast.error('Notifications not supported in this browser'); return }
        const permission = await Notification.requestPermission()
        if (permission === 'granted') {
            setForm({ ...form, desktopNotifications: true })
            new Notification('Notifications enabled', { body: "You'll be notified when a response finishes." })
        } else {
            setForm({ ...form, desktopNotifications: false })
            toast.error('Notification permission denied')
        }
    }

    const handleLogout = async () => {
        onClose()
        await signOut({ redirectUrl: '/' })
    }

    if (!isOpen) return null

    return (
        <div className='fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4' onClick={onClose}>
            <div
                style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-primary)' }}
                className='w-full max-w-2xl rounded-2xl overflow-hidden max-h-[85vh] flex flex-col md:flex-row'
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ borderColor: 'var(--border-color)' }} className='md:w-44 shrink-0 border-b md:border-b-0 md:border-r p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible'>
                    <div className='flex items-center justify-between mb-2 px-1'>
                        <h3 className='text-sm font-semibold hidden md:block'>Settings</h3>
                    </div>
                    {TABS.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{ backgroundColor: activeTab === tab ? 'var(--color-primary)' : 'transparent' }}
                            className={`text-left px-3 py-2 rounded-lg text-sm whitespace-nowrap shrink-0 ${activeTab === tab ? 'text-white' : 'hover:bg-white/10'}`}
                        >
                            {tab}
                        </button>
                    ))}
                    <button
                        onClick={handleLogout}
                        className='text-left px-3 py-2 rounded-lg text-sm whitespace-nowrap shrink-0 hover:bg-white/10 text-red-400 mt-2'
                    >
                        Log out
                    </button>
                </div>

                <div className='flex-1 p-5 overflow-y-auto'>
                    <div className='flex items-center justify-between mb-4'>
                        <h3 className='text-lg font-medium'>{activeTab}</h3>
                        <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className='hover:opacity-80'>{'\u2715'}</button>
                    </div>

                    {loading ? (
                        <p style={{ color: 'var(--text-muted)' }} className='text-sm py-8 text-center'>Loading...</p>
                    ) : (
                        <div className='flex flex-col gap-4'>

                            {activeTab === 'General' && (
                                <>
                                    <div>
                                        <p className='text-xs mb-1' style={{ color: 'var(--text-muted)' }}>Keyboard shortcuts</p>
                                        <div style={{ borderColor: 'var(--border-color)' }} className='border rounded-lg p-3 text-sm flex flex-col gap-1.5'>
                                            <div className='flex justify-between'><span>New chat</span><span style={{ color: 'var(--text-muted)' }}>Ctrl + Shift + O</span></div>
                                            <div className='flex justify-between'><span>Send message</span><span style={{ color: 'var(--text-muted)' }}>Enter</span></div>
                                            <div className='flex justify-between'><span>New line</span><span style={{ color: 'var(--text-muted)' }}>Shift + Enter</span></div>
                                        </div>
                                    </div>
                                    <div style={{ borderColor: 'var(--border-color)' }} className='border-t pt-3'>
                                        <p className='text-xs mb-2' style={{ color: 'var(--text-muted)' }}>Chat management</p>
                                        <button onClick={deleteAllChats} className='w-full text-sm text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-red-400'>
                                            Delete all chats
                                        </button>
                                    </div>
                                </>
                            )}

                            {activeTab === 'Personalization' && (
                                <>
                                    <div>
                                        <p className='text-xs mb-1' style={{ color: 'var(--text-muted)' }}>Response tone</p>
                                        <select
                                            value={form.tone}
                                            onChange={(e) => setForm({ ...form, tone: e.target.value })}
                                            style={{ borderColor: 'var(--border-color)', backgroundColor: 'transparent' }}
                                            className='w-full rounded-lg border px-2.5 py-1.5 text-sm'
                                        >
                                            <option value='neutral'>Neutral</option>
                                            <option value='professional'>Professional</option>
                                            <option value='friendly'>Friendly</option>
                                            <option value='creative'>Creative</option>
                                        </select>
                                    </div>

                                    <div>
                                        <p className='text-xs mb-1' style={{ color: 'var(--text-muted)' }}>Response length</p>
                                        <div className='flex gap-2'>
                                            {['short', 'medium', 'long'].map((l) => (
                                                <button
                                                    key={l}
                                                    onClick={() => setForm({ ...form, responseLength: l })}
                                                    style={{ borderColor: form.responseLength === l ? 'var(--color-primary)' : 'var(--border-color)' }}
                                                    className='flex-1 py-1.5 rounded-lg border text-sm capitalize'
                                                >
                                                    {l}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <p className='text-xs mb-1' style={{ color: 'var(--text-muted)' }}>Custom instructions</p>
                                        <textarea
                                            value={form.customInstructions}
                                            onChange={(e) => setForm({ ...form, customInstructions: e.target.value })}
                                            rows={4}
                                            placeholder="e.g. Keep answers concise. I'm a Computer Engineering student."
                                            style={{ borderColor: 'var(--border-color)', backgroundColor: 'transparent' }}
                                            className='w-full rounded-lg border px-2.5 py-1.5 text-sm resize-none'
                                        />
                                    </div>
                                </>
                            )}

                            {activeTab === 'Appearance' && (
                                <>
                                    <div>
                                        <p className='text-xs mb-1' style={{ color: 'var(--text-muted)' }}>Theme</p>
                                        <div className='flex gap-2'>
                                            {['light', 'dark', 'system'].map((t) => (
                                                <button
                                                    key={t}
                                                    onClick={() => setTheme(t)}
                                                    style={{ borderColor: theme === t ? 'var(--color-primary)' : 'var(--border-color)' }}
                                                    className='flex-1 py-1.5 rounded-lg border text-sm capitalize'
                                                >
                                                    {t}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className='text-xs mb-2' style={{ color: 'var(--text-muted)' }}>Accent color</p>
                                        <div className='flex gap-2'>
                                            {ACCENT_COLORS.map((c) => (
                                                <button
                                                    key={c}
                                                    onClick={() => setForm({ ...form, accentColor: c })}
                                                    style={{ backgroundColor: c, borderColor: form.accentColor === c ? 'white' : 'transparent' }}
                                                    className='w-8 h-8 rounded-full border-2'
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {activeTab === 'Voice' && (
                                <>
                                    <div>
                                        <p className='text-xs mb-1' style={{ color: 'var(--text-muted)' }}>Voice</p>
                                        <select
                                            value={form.voiceName}
                                            onChange={(e) => setForm({ ...form, voiceName: e.target.value })}
                                            style={{ borderColor: 'var(--border-color)', backgroundColor: 'transparent' }}
                                            className='w-full rounded-lg border px-2.5 py-1.5 text-sm'
                                        >
                                            <option value=''>Default</option>
                                            {voices.map((v) => (
                                                <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <p className='text-xs mb-1' style={{ color: 'var(--text-muted)' }}>Speaking speed: {form.voiceRate.toFixed(1)}x</p>
                                        <input
                                            type='range'
                                            min='0.5'
                                            max='2'
                                            step='0.1'
                                            value={form.voiceRate}
                                            onChange={(e) => setForm({ ...form, voiceRate: parseFloat(e.target.value) })}
                                            className='w-full'
                                        />
                                    </div>
                                    <button onClick={testVoice} style={{ borderColor: 'var(--border-color)' }} className='text-sm border rounded-lg px-3 py-1.5 hover:bg-white/10 w-fit'>
                                        Test voice
                                    </button>
                                </>
                            )}

                            {activeTab === 'Memory' && (
                                <>
                                    <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                                        DeepSeek can remember details you share so it doesn't ask again. This uses the same custom instructions from Personalization.
                                    </p>
                                    <textarea
                                        value={form.customInstructions}
                                        onChange={(e) => setForm({ ...form, customInstructions: e.target.value })}
                                        rows={5}
                                        placeholder="e.g. I'm a Computer Engineering student at PVG COETM, Pune. I prefer concise, example-driven answers."
                                        style={{ borderColor: 'var(--border-color)', backgroundColor: 'transparent' }}
                                        className='w-full rounded-lg border px-2.5 py-1.5 text-sm resize-none'
                                    />
                                    <button
                                        onClick={() => setForm({ ...form, customInstructions: '' })}
                                        className='text-sm text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-red-400 w-fit'
                                    >
                                        Clear all memory
                                    </button>
                                </>
                            )}

                            {activeTab === 'Data Controls' && (
                                <>
                                    <label className='flex items-center gap-2 text-sm'>
                                        <input
                                            type='checkbox'
                                            checked={form.desktopNotifications}
                                            onChange={(e) => e.target.checked ? requestNotifications() : setForm({ ...form, desktopNotifications: false })}
                                        />
                                        Desktop notifications when a response finishes
                                    </label>
                                    <div style={{ borderColor: 'var(--border-color)' }} className='border-t pt-3 flex flex-col gap-2'>
                                        <button onClick={exportData} className='text-sm text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10'>
                                            Export all chat data (JSON)
                                        </button>
                                        <button onClick={deleteAllChats} className='text-sm text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-red-400'>
                                            Delete all chats
                                        </button>
                                        <button onClick={deleteAccount} className='text-sm text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-red-400'>
                                            Delete all my data
                                        </button>
                                    </div>
                                </>
                            )}

                            {activeTab === 'Security' && (
                                <div className='flex flex-col gap-3 text-sm'>
                                    <p style={{ color: 'var(--text-secondary)' }}>
                                        Password, two-factor authentication, and active sessions are managed through your account provider.
                                    </p>
                                    <button
                                        onClick={() => { onClose(); openUserProfile(); }}
                                        style={{ borderColor: 'var(--border-color)' }}
                                        className='text-sm border rounded-lg px-3 py-1.5 hover:bg-white/10 w-fit'
                                    >
                                        Manage account security
                                    </button>
                                </div>
                            )}

                            {activeTab === 'Help' && (
                                <div className='flex flex-col gap-2 text-sm'>
                                    <div className='flex justify-between py-1.5'>
                                        <span style={{ color: 'var(--text-muted)' }}>Version</span>
                                        <span>1.0.0</span>
                                    </div>
                                    <div style={{ borderColor: 'var(--border-color)' }} className='border-t pt-2 flex flex-col gap-1'>
                                        <a href='#' className='px-2.5 py-1.5 rounded-lg hover:bg-white/10'>Help Center</a>
                                        <a href='#' className='px-2.5 py-1.5 rounded-lg hover:bg-white/10'>Privacy Policy</a>
                                        <a href='#' className='px-2.5 py-1.5 rounded-lg hover:bg-white/10'>Terms of Use</a>
                                    </div>
                                </div>
                            )}

                            {activeTab !== 'Help' && activeTab !== 'General' && activeTab !== 'Security' && (
                                <button
                                    onClick={save}
                                    disabled={saving}
                                    className='mt-1 w-full py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60'
                                    style={{ backgroundColor: 'var(--color-primary)' }}
                                >
                                    {saving ? 'Saving...' : 'Save settings'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default SettingsModal
