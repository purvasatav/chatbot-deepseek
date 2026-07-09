import { assets } from '@/assets/assets'
import { useAppContext } from '@/context/AppContext'
import Image from 'next/image'
import React, { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Prism from 'prismjs'
import toast from 'react-hot-toast'

const Message = ({role, content, isLast, chatId, index, fileName, fileData, fileType, attachments}) => {

    const {regenerateResponse, editMessage, deleteMessage} = useAppContext()
    const [feedback, setFeedback] = useState(null)
    const [isRegenerating, setIsRegenerating] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [editValue, setEditValue] = useState(content)
    const [isSavingEdit, setIsSavingEdit] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isSpeaking, setIsSpeaking] = useState(false)

    const displayContent = (content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

    // Normalize to a single list regardless of whether this message uses
    // the new `attachments` array or the legacy single fileName/fileData/fileType fields.
    const fileList = (attachments && attachments.length > 0)
        ? attachments
        : (fileName ? [{ fileName, fileData, fileType }] : []);

    useEffect(()=>{
        Prism.highlightAll()
    }, [displayContent])

    useEffect(()=>{
        return () => {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        }
    }, [])

    const copyToClipboard = async (text) => {
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
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
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            return ok;
        } catch (err) {
            return false;
        }
    }

    const copyMessage = async () => {
        const ok = await copyToClipboard(displayContent);
        if (ok) {
            toast.success('Message copied to clipboard');
        } else {
            toast.error('Copy failed - clipboard access needs HTTPS or localhost');
        }
    }

    const speakMessage = () => {
        if (!('speechSynthesis' in window)) {
            toast.error('Text-to-speech not supported in this browser');
            return;
        }
        if (isSpeaking) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
            return;
        }
        const utterance = new SpeechSynthesisUtterance(displayContent);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
        setIsSpeaking(true);
    }

    const handleRegenerate = async () => {
        if (!isLast) { toast.error("Can only regenerate the last message"); return; }
        if (isRegenerating) return;
        if (!chatId) { toast.error("No chat ID available"); return; }
        setIsRegenerating(true)
        try {
            await regenerateResponse(chatId)
        } catch (err) {
            toast.error("Regenerate failed: " + err.message);
        }
        setIsRegenerating(false)
    }

    const startEdit = () => {
        setEditValue(content)
        setIsEditing(true)
    }

    const cancelEdit = () => {
        setIsEditing(false)
        setEditValue(content)
    }

    const saveEdit = async () => {
        if (!editValue.trim()) { toast.error("Message can't be empty"); return; }
        if (!chatId) { toast.error("No chat ID available"); return; }
        if (index == null) { toast.error("Cannot determine message position"); return; }
        setIsSavingEdit(true)
        try {
            await editMessage(chatId, index, editValue)
            setIsEditing(false)
        } catch (err) {
            toast.error("Edit failed: " + err.message);
        }
        setIsSavingEdit(false)
    }

    const handleDelete = async () => {
        if (!chatId) { toast.error("No chat ID available"); return; }
        if (index == null) { toast.error("Cannot determine message position"); return; }
        const confirmDelete = window.confirm('Delete this message?');
        if (!confirmDelete) return;
        setIsDeleting(true)
        try {
            await deleteMessage(chatId, index)
        } catch (err) {
            toast.error("Delete failed: " + err.message);
        }
        setIsDeleting(false)
    }

    const handleLike = () => {
        setFeedback(feedback === 'like' ? null : 'like')
        toast.success('Thanks for the feedback')
    }

    const handleDislike = () => {
        setFeedback(feedback === 'dislike' ? null : 'dislike')
        toast.success('Thanks for the feedback')
    }

    const copyCodeBlock = async (code) => {
        const ok = await copyToClipboard(code);
        if (ok) {
            toast.success('Code copied to clipboard');
        } else {
            toast.error('Copy failed - clipboard access needs HTTPS or localhost');
        }
    }

    const openAttachedFile = (data) => {
        if (!data) { toast.error("File data not available"); return; }
        const win = window.open();
        if (win) {
            win.document.write(
                `<iframe src="${data}" style="width:100%;height:100%;border:none;"></iframe>`
            );
        } else {
            toast.error("Popup blocked - please allow popups to view the file");
        }
    }

    const isImageFile = (f) => (f.fileType || '').startsWith('image/') ||
        /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f.fileName || '');
    const isPdfFile = (f) => f.fileType === 'application/pdf' || (f.fileName || '').toLowerCase().endsWith('.pdf');

    const imageFiles = fileList.filter(isImageFile);
    const docFiles = fileList.filter(f => !isImageFile(f));

  return (
    <div className='flex flex-col items-center w-full max-w-3xl text-sm'>
      <div className={`flex flex-col  w-full mb-8 ${role === 'user' && 'items-end'}`}>
        {imageFiles.length > 0 && (
            <div className='mb-2 flex flex-wrap gap-2 justify-end max-w-md'>
                {imageFiles.map((f, i) => (
                    <img
                        key={i}
                        src={f.fileData}
                        alt={f.fileName}
                        onClick={()=>openAttachedFile(f.fileData)}
                        className='rounded-xl max-h-48 max-w-[10rem] w-auto cursor-pointer hover:opacity-90 transition object-contain'
                        title='Click to open full size'
                    />
                ))}
            </div>
        )}
        {docFiles.length > 0 && (
            <div className='mb-2 flex flex-col gap-2 items-end'>
                {docFiles.map((f, i) => (
                    <div
                        key={i}
                        onClick={()=>openAttachedFile(f.fileData)}
                        style={{backgroundColor: 'var(--bg-surface-2)'}}
                        className='flex items-center gap-3 hover:opacity-90 transition cursor-pointer rounded-xl px-3 py-2.5 max-w-xs'
                        title='Click to open file'
                    >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isPdfFile(f) ? 'bg-red-500' : 'bg-blue-500'}`}>
                            <span className='text-white text-xs font-bold'>{isPdfFile(f) ? 'PDF' : 'DOC'}</span>
                        </div>
                        <div className='min-w-0'>
                            <p style={{color: 'var(--text-primary)'}} className='text-sm truncate'>{f.fileName}</p>
                            <p style={{color: 'var(--text-muted)'}} className='text-xs'>{isPdfFile(f) ? 'PDF' : 'Document'} - Click to open</p>
                        </div>
                    </div>
                ))}
            </div>
        )}
        <div style={role === 'user' ? {backgroundColor: 'var(--bg-user-bubble)', color: 'var(--text-primary)'} : {color: 'var(--text-primary)'}} className={`group relative flex max-w-2xl py-3 rounded-xl ${role === 'user' ? 'px-5' : 'gap-3'}`}>
            {!isEditing && (
            <div className={`opacity-0 group-hover:opacity-100 absolute ${role === 'user' ? '-left-16 top-2.5' : 'left-9 -bottom-6'} transition-all`}>
                <div className='flex items-center gap-2 opacity-70'>
                    {
                        role === 'user' ? (
                            <>
                            <Image onClick={copyMessage} src={assets.copy_icon} alt='' className='w-4 cursor-pointer'/>
                            <Image onClick={startEdit} src={assets.pencil_icon} alt='' className='w-4.5 cursor-pointer'/>
                            <Image
                                onClick={handleDelete}
                                src={assets.delete_icon ?? assets.pencil_icon}
                                alt=''
                                className={`w-4 cursor-pointer ${isDeleting ? 'opacity-30' : ''}`}
                            />
                            </>
                        ):(
                            <>
                            <Image onClick={copyMessage} src={assets.copy_icon} alt='' className='w-4.5 cursor-pointer'/>
                            <span onClick={speakMessage} className='cursor-pointer text-sm' title={isSpeaking ? 'Stop reading' : 'Read aloud'}>{isSpeaking ? '⏹️' : '🔊'}</span>
                            {isLast && (
                                <Image
                                    onClick={handleRegenerate}
                                    src={assets.regenerate_icon}
                                    alt=''
                                    className={`w-4 cursor-pointer ${isRegenerating ? 'animate-spin' : ''}`}
                                />
                            )}
                            <Image
                                onClick={handleLike}
                                src={assets.like_icon}
                                alt=''
                                className={`w-4 cursor-pointer transition ${feedback === 'like' ? 'brightness-0 invert' : ''}`}
                            />
                            <Image
                                onClick={handleDislike}
                                src={assets.dislike_icon}
                                alt=''
                                className={`w-4 cursor-pointer transition ${feedback === 'dislike' ? 'brightness-75 sepia saturate-[10] hue-rotate-[300deg]' : ''}`}
                            />
                            <Image
                                onClick={handleDelete}
                                src={assets.delete_icon ?? assets.dislike_icon}
                                alt=''
                                className={`w-4 cursor-pointer ${isDeleting ? 'opacity-30' : ''}`}
                            />
                            </>
                        )
                    }
                </div>
            </div>
            )}
            {
                role === 'user' ? 
                (
                    isEditing ? (
                        <div className='flex flex-col gap-2 w-full min-w-[280px]'>
                            <textarea
                                value={editValue}
                                onChange={(e)=> setEditValue(e.target.value)}
                                style={{color: 'var(--text-primary)'}}
                                className='w-full bg-black/20 rounded-lg p-2 outline-none resize-none'
                                rows={3}
                                autoFocus
                            />
                            <div className='flex gap-2 justify-end'>
                                <button onClick={cancelEdit} className='text-xs px-3 py-1 rounded-lg hover:bg-white/10'>Cancel</button>
                                <button onClick={saveEdit} disabled={isSavingEdit} className='text-xs px-3 py-1 rounded-lg bg-primary text-white hover:opacity-90'>
                                    {isSavingEdit ? 'Saving...' : 'Save & Submit'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <span>{content}</span>
                    )
                )
                :
                (
                    <>
                    <Image src={assets.logo_icon} alt='' className='h-9 w-9 p-1 border border-white/15 rounded-full'/>
                    <div className='space-y-4 w-full overflow-x-auto markdown-body'>
                        <Markdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                p: ({node, ...props}) => (
                                    <div className='mb-2' {...props} />
                                ),
                                img: ({node, ...props}) => (
                                    <img
                                        {...props}
                                        className='max-w-full max-h-96 rounded-xl my-2'
                                        loading='lazy'
                                        alt={props.alt || ''}
                                    />
                                ),
                                table: ({node, ...props}) => (
                                    <div className='overflow-x-auto my-3'>
                                        <table className='border-collapse w-full text-sm' {...props} />
                                    </div>
                                ),
                                thead: ({node, ...props}) => (
                                    <thead className='bg-white/10' {...props} />
                                ),
                                th: ({node, ...props}) => (
                                    <th style={{borderColor: 'var(--border-color)'}} className='border px-3 py-2 text-left font-semibold' {...props} />
                                ),
                                td: ({node, ...props}) => (
                                    <td style={{borderColor: 'var(--border-color)'}} className='border px-3 py-2' {...props} />
                                ),
                                code: ({node, inline, className, children, ...props}) => {
                                    const codeText = String(children).replace(/\n$/, '');
                                    if (inline) {
                                        return <code className='bg-white/10 px-1.5 py-0.5 rounded text-[0.85em]' {...props}>{children}</code>;
                                    }
                                    return (
                                        <div className='relative group/code my-3'>
                                            <button
                                                onClick={()=>copyCodeBlock(codeText)}
                                                className='absolute top-2 right-2 text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded opacity-0 group-hover/code:opacity-100 transition'
                                            >
                                                Copy
                                            </button>
                                            <pre className={className}>
                                                <code className={className} {...props}>{children}</code>
                                            </pre>
                                        </div>
                                    );
                                }
                            }}
                        >{displayContent}</Markdown>
                        </div>
                    </>
                )
            }
        </div>
      </div>
    </div>
  )
}

export default Message