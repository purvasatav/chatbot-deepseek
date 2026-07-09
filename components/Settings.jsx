import { useUser, useClerk } from '@clerk/nextjs'
import axios from 'axios'
import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

const TABS = ['AI', 'Voice', 'Appearance', 'Notifications', 'Account']

const Settings = ({ isOpen, onClose }) => {
    const { user } = useUser()
    const { signOut } = useClerk()

    const [activeTab, setActiveTab] = useState('AI')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [voices, setVoices] = useState([])
    const [deleting, setDeleting] = useState(false)

    const [settings, setSettings] = useState({
        customInstructions: '',
        tone: 'neutral',
        responseLength: 'medium',
        model: 'openai/gpt-oss-120b',
        theme: 'dark',
        voiceName: '',
        voiceRate: 1,
        desktopNotifications: false
    })

    useEffect(() => {
        if (!isOpen) return
        const loadSettings = async () => {
            setLoading(true)
            try {
                const { data } = await axios.get('/api/settings')
                if (data.success) {
                    setSettings((prev) => ({ ...prev, ...data.data }))
                } else {
                    toast.error('Failed to load settings')
                }
            } catch (err) {
                toast.error('Failed to load settings')
            }
            setLoading(false)
        }
        loadSettings()
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        if (!('speechSynthesis' in window)) return
        const loadVoices = () => setVoices(window.speechSynthesis.getVoices())
        loadVoices()
        window.speechSynthesis.onvoiceschanged = loadVoices
    }, [isOpen])

    const updateField = (field, value) => {
        setSettings((prev) => ({ ...prev, [field]: value }))
    }

    const saveSettings = async () => {
        setSaving(true)
        try {
            const { data } = await axios.post('/api/settings', settings)
            if (data.success) {
                localStorage.setItem('voiceName', settings.voiceName || '')
                localStorage.setItem('voiceRate', String(settings.voiceRate || 1))
                toast.success('Settings saved')
            } else {
                toast.error(data.message || 'Failed to save settings')
            }
        } catch (err) {
            toast.error('Failed to save settings')
        }
        setSaving(false)
    }

    const testVoice = () => {
        if (!('speechSynthesis' in window)) { toast.error('Voice not supported in this browser'); return; }
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance("This is what your assistant will sound like.")
        const chosen = voices.find(v => v.name === settings.voiceName)
        if (chosen) utterance.voice = chosen
        utterance.rate = settings.voiceRate
        window.speechSynthesis.speak(utterance)
    }

    const requestNotificationPermission = async () => {
        if (!('Notification' in window)) { toast.error('Notifications not supported in this browser'); return; }
        const permission = await Notification.requestPermission()
        if (permission === 'granted') {
            updateField('desktopNotifications', true)
            toast.success('Notifications enabled')
        } else {
            updateField('desktopNotifications', false)
            toast.error('Notification permission denied')
        }
    }

    const exportAllChats = async () => {
        try {
            const { data } = await axios.get('/api/settings/export')
            if (!data.success) { toast.error(data.message || 'Export failed'); return; }
            const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'my-chats-export.json'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            toast.success('Chats exported')
        } catch (err) {
            toast.error('Export failed')
        }
    }

    const deleteAllData = async () => {
        const confirmed = window.confirm('This will permanently delete all your chats and settings. This cannot be undone. Continue?')
        if (!confirmed) return
        setDeleting(true)
        try {
            const { data } = await axios.post('/api/settings/delete-account')
            if (data.success) {
                toast.success('All data deleted. Signing out...')
                setTimeout(() => signOut(), 1200)
            } else {
                toast.error(data.message || 'Failed to delete data')
            }
        } catch (err) {
            toast.error('Failed to delete data')
        }
        setDeleting(false)
    }

    if (!isOpen) return null

    return (
        <div className='fixed inset-0 bg-black/60 flex items-center justify-center z-[100]' onClick={onClose}>
            <div className='bg-[#2a2a2e] w-full max-w-2xl rounded-2xl overflow-hidden max-h-[85vh] flex' onClick={(e) => e.stopPropagation()}>

                {/* Sidebar tabs */}
                <div className='w-40 bg-[#232326] p-3 flex flex-col gap-1 shrink-0'>
                    <h3 className='text-white/90 font-medium px-2 py-2 text-sm'>Settings</h3>
                    {TABS.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`text-left px-3 py-2 rounded-lg text-sm transition ${activeTab === tab ? 'bg-primary text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className='flex-1 flex flex-col min-w-0'>
                    <div className='flex items-center justify-between px-5 py-4 border-b border-white/10'>
                        <h4 className='text-white font-medium'>{activeTab}</h4>
                        <button onClick={onClose} className='text-white/50 hover:text-white'>✕</button>
                    </div>

                    <div className='flex-1 overflow-y-auto p-5 text-sm'>
                        {loading ? (
                            <p className='text-white/40'>Loading settings...</p>
                        ) : (
                            <>
                            {activeTab === 'AI' && (
                                <div className='space-y-5'>
                                    <div>
                                        <label className='text-white/70 block mb-1.5'>Tone</label>
                                        <select
                                            value={settings.tone}
                                            onChange={(e) => updateField('tone', e.target.value)}
                                            className='w-full bg-[#1e1e21] text-white rounded-lg px-3 py-2 outline-none border border-white/10'
                                        >
                                            <option value='neutral'>Neutral</option>
                                            <option value='professional'>Professional</option>
                                            <option value='friendly'>Friendly</option>
                                            <option value='creative'>Creative</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className='text-white/70 block mb-1.5'>Response length</label>
                                        <select
                                            value={settings.responseLength}
                                            onChange={(e) => updateField('responseLength', e.target.value)}
                                            className='w-full bg-[#1e1e21] text-white rounded-lg px-3 py-2 outline-none border border-white/10'
                                        >
                                            <option value='short'>Short</option>
                                            <option value='medium'>Medium</option>
                                            <option value='long'>Long</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className='text-white/70 block mb-1.5'>Custom instructions</label>
                                        <textarea
                                            value={settings.customInstructions}
                                            onChange={(e) => updateField('customInstructions', e.target.value)}
                                            rows={4}
                                            placeholder='e.g. Always answer in bullet points. Avoid jargon.'
                                            className='w-full bg-[#1e1e21] text-white rounded-lg px-3 py-2 outline-none border border-white/10 resize-none'
                                        />
                                    </div>
                                </div>
                            )}

                            {activeTab === 'Voice' && (
                                <div className='space-y-5'>
                                    <div>
                                        <label className='text-white/70 block mb-1.5'>Voice</label>
                                        <select
                                            value={settings.voiceName}
                                            onChange={(e) => updateField('voiceName', e.target.value)}
                                            className='w-full bg-[#1e1e21] text-white rounded-lg px-3 py-2 outline-none border border-white/10'
                                        >
                                            <option value=''>Browser default</option>
                                            {voices.map((v) => (
                                                <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                                            ))}
                                        </select>
                                        {voices.length === 0 && (
                                            <p className='text-white/30 text-xs mt-1'>No voices found — this depends on your browser/OS.</p>
                                        )}
                                    </div>

                                    <div>
                                        <label className='text-white/70 block mb-1.5'>Speed: {settings.voiceRate.toFixed(1)}x</label>
                                        <input
                                            type='range'
                                            min='0.5'
                                            max='2'
                                            step='0.1'
                                            value={settings.voiceRate}
                                            onChange={(e) => updateField('voiceRate', parseFloat(e.target.value))}
                                            className='w-full'
                                        />
                                    </div>

                                    <button
                                        onClick={testVoice}
                                        className='text-xs px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white'
                                    >
                                        🔊 Test voice
                                    </button>
                                </div>
                            )}

                            {activeTab === 'Appearance' && (
                                <div className='space-y-4'>
                                    <label className='text-white/70 block mb-1.5'>Theme</label>
                                    <div className='flex gap-3'>
                                        <button
                                            onClick={() => updateField('theme', 'dark')}
                                            className={`flex-1 py-3 rounded-lg border text-sm ${settings.theme === 'dark' ? 'border-primary bg-primary/20 text-white' : 'border-white/10 text-white/60 hover:bg-white/5'}`}
                                        >
                                            🌙 Dark
                                        </button>
                                        <button
                                            onClick={() => updateField('theme', 'light')}
                                            className={`flex-1 py-3 rounded-lg border text-sm ${settings.theme === 'light' ? 'border-primary bg-primary/20 text-white' : 'border-white/10 text-white/60 hover:bg-white/5'}`}
                                        >
                                            ☀️ Light
                                        </button>
                                    </div>
                                    <p className='text-white/30 text-xs'>Saved with your account. Full app-wide light mode styling is still a work in progress — this saves your preference for now.</p>
                                </div>
                            )}

                            {activeTab === 'Notifications' && (
                                <div className='space-y-4'>
                                    <div className='flex items-center justify-between'>
                                        <div>
                                            <p className='text-white/90'>Desktop notifications</p>
                                            <p className='text-white/40 text-xs'>Get notified when a response finishes, even in another tab.</p>
                                        </div>
                                        <button
                                            onClick={() => settings.desktopNotifications ? updateField('desktopNotifications', false) : requestNotificationPermission()}
                                            className={`w-11 h-6 rounded-full transition relative shrink-0 ${settings.desktopNotifications ? 'bg-primary' : 'bg-white/20'}`}
                                        >
                                            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${settings.desktopNotifications ? 'left-5.5' : 'left-0.5'}`}></span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'Account' && (
                                <div className='space-y-5'>
                                    <div className='flex items-center gap-3'>
                                        {user?.imageUrl && (
                                            <img src={user.imageUrl} alt='' className='w-12 h-12 rounded-full' />
                                        )}
                                        <div>
                                            <p className='text-white'>{user?.fullName || user?.username || 'User'}</p>
                                            <p className='text-white/40 text-xs'>{user?.primaryEmailAddress?.emailAddress}</p>
                                        </div>
                                    </div>

                                    <div className='border-t border-white/10 pt-4'>
                                        <p className='text-white/90 mb-1'>Export your data</p>
                                        <p className='text-white/40 text-xs mb-2'>Download all your chats as a JSON file.</p>
                                        <button onClick={exportAllChats} className='text-xs px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white'>
                                            ⬇️ Export all chats
                                        </button>
                                    </div>

                                    <div className='border-t border-white/10 pt-4'>
                                        <p className='text-red-400 mb-1'>Delete all data</p>
                                        <p className='text-white/40 text-xs mb-2'>Permanently deletes all your chats and saved settings, then signs you out. This does not delete your login account itself.</p>
                                        <button
                                            onClick={deleteAllData}
                                            disabled={deleting}
                                            className='text-xs px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300'
                                        >
                                            {deleting ? 'Deleting...' : '🗑️ Delete all my data'}
                                        </button>
                                    </div>
                                </div>
                            )}
                            </>
                        )}
                    </div>

                    {activeTab !== 'Account' && (
                        <div className='px-5 py-4 border-t border-white/10 flex justify-end'>
                            <button
                                onClick={saveSettings}
                                disabled={saving || loading}
                                className='px-4 py-2 rounded-lg bg-primary text-white text-sm hover:opacity-90 disabled:opacity-50'
                            >
                                {saving ? 'Saving...' : 'Save changes'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default Settings