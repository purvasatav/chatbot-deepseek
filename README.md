# Chatbot DeepSeek

A full-featured AI chatbot web app built with Next.js, inspired by DeepSeek's interface. Supports real-time streaming responses, file uploads with OCR, image generation, voice input/output, web search, and more.

## Features

- 💬 Real-time streaming AI chat responses
- 📎 File upload support (PDF, DOCX, images) with text extraction and OCR fallback for scanned documents
- 🖼️ AI image generation and editing
- 🎙️ Voice input (speech-to-text) and voice output (text-to-speech)
- 🔍 Optional web search integration for up-to-date answers
- 📁 Chat organization: pin, archive, project folders, search
- ⚙️ Customizable settings: tone, response length, custom instructions, theme, accent color
- 🔐 Authentication via Clerk (sign in, sign up, account security, log out)
- 🔗 Shareable chat links
- 📤 Export chat history as text or full data as JSON

## Tech Stack

- **Framework:** Next.js (App Router)
- **Auth:** Clerk
- **Database:** MongoDB (Mongoose)
- **AI:** Groq API (chat + vision models)
- **Search:** Tavily API
- **OCR:** Tesseract.js + pdf-to-img
- **Styling:** Tailwind CSS

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/purvasatav/chatbot-deepseek.git
cd chatbot-deepseek
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy `.env.example` to `.env` and fill in your own values:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `GROQ_API_KEY` | Groq API key for chat/vision models |
| `MONGODB_URI` | MongoDB connection string |
| `TAVILY_API_KEY` | Tavily API key for web search |

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

This app is designed to deploy easily on [Vercel](https://vercel.com). Make sure to add all environment variables listed above in your Vercel project settings, and configure your Clerk dashboard with the deployed domain's URL.

## License

Personal project — not licensed for redistribution.
