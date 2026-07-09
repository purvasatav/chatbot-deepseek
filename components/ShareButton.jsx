import { useAuth } from '@clerk/nextjs';
import axios from 'axios';
import toast from 'react-hot-toast';

const ShareButton = ({ chatId, className = '' }) => {
    const { getToken } = useAuth();

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
    };

    const handleShare = async (e) => {
        e.stopPropagation(); // prevent triggering parent chat-select click
        if (!chatId) {
            toast.error("No chat selected");
            return;
        }
        try {
            const token = await getToken();
            const { data } = await axios.post(
                '/api/chat/share',
                { chatId },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (data.success) {
                const copied = await copyToClipboard(data.url);
                if (copied) {
                    toast.success('Public link copied to your clipboard');
                } else {
                    toast.success(`Link ready: ${data.url}`);
                }
            } else {
                toast.error(data.message || "Failed to create share link");
            }
        } catch (err) {
            toast.error("Share failed: " + err.message);
        }
    };

    return (
        <button
            type="button"
            onClick={handleShare}
            className={`p-1.5 hover:bg-white/10 rounded-lg ${className}`}
            title="Share chat"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342a3 3 0 100-2.684m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
        </button>
    );
};

export default ShareButton;