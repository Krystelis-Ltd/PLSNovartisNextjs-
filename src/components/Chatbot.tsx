"use client"

import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Message {
    role: 'user' | 'assistant' | 'system'
    content: string
}

interface ChatbotProps {
    vectorStoreId: string | null;
    fetchedAnswers: Record<string, any>;
    onUpdateData: (key: string, newValue: any) => void;
}

export function Chatbot({ vectorStoreId, fetchedAnswers, onUpdateData }: ChatbotProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [messageCount, setMessageCount] = useState(0);
    const MAX_QUESTIONS = 30;
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }

    useEffect(() => {
        if (isOpen) scrollToBottom();
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!input.trim() || !vectorStoreId || messageCount >= MAX_QUESTIONS) return;

        const userMsg: Message = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);
        setMessageCount(prev => prev + 1);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMsg],
                    vectorStoreId,
                    fetchedAnswers
                })
            });

            const data = await res.json();

            if (res.ok) {
                if (data.functionCall && data.functionCall.name === "update_json_value") {
                    const args = data.functionCall.arguments;
                    if (args.key && args.newValue) {
                        onUpdateData(args.key, args.newValue);
                    }
                }
                if (data.reply) {
                    setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
                }
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that request." }]);
            }
        } catch (e) {
            setMessages(prev => [...prev, { role: 'assistant', content: "An error occurred." }]);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="fixed bottom-6 right-6 z-50">
            <AnimatePresence mode="wait">
                {isOpen ? (
                    <motion.div
                        key="chatbot-panel"
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                        className="w-80 md:w-96 h-[500px] bg-[var(--color-surface-light)] dark:bg-[var(--color-surface-dark)] border border-[var(--color-border-light)] dark:border-[var(--color-border-dark)] rounded-2xl shadow-[var(--shadow-elevated)] flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="bg-[var(--color-primary)] px-4 py-3 flex items-center justify-between text-white shadow-sm shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-xl">forum</span>
                                <span className="font-bold text-sm">Contextual Chatbot</span>
                            </div>
                            <button onClick={() => setIsOpen(false)} aria-label="Close chatbot" className="hover:bg-white/20 rounded-full p-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/50">
                                <span className="material-symbols-outlined text-lg block" aria-hidden="true">close</span>
                            </button>
                        </div>

                        {/* Chat Area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/50 text-sm custom-scrollbar">
                            {messages.length === 0 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                    className="text-center text-slate-500 mt-10"
                                >
                                    <span className="material-symbols-outlined text-4xl opacity-50 block mb-2">smart_toy</span>
                                    <p>Ask me questions about your document or extracted values!</p>
                                </motion.div>
                            )}
                            {messages.map((msg, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 shadow-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-[var(--color-primary)] text-white' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700'}`}>
                                        {msg.content}
                                    </div>
                                </motion.div>
                            ))}
                            <AnimatePresence>
                                {isLoading && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -6 }}
                                        className="flex justify-start"
                                    >
                                        <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-2 shadow-sm flex gap-1.5 items-center">
                                            <div className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-bounce"></div>
                                            <div className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-bounce [animation-delay:75ms]"></div>
                                            <div className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-bounce [animation-delay:150ms]"></div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="p-3 bg-[var(--color-surface-light)] dark:bg-[var(--color-surface-dark)] border-t border-slate-100 dark:border-slate-800 shrink-0">
                            {!vectorStoreId ? (
                                <p className="text-xs text-red-500 text-center py-2">Please upload a document first to use the chatbot.</p>
                            ) : messageCount >= MAX_QUESTIONS ? (
                                <p className="text-xs text-amber-600 dark:text-amber-500 text-center py-2 font-medium">Session limit reached ({MAX_QUESTIONS}/{MAX_QUESTIONS} questions). Please restart the application.</p>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={input}
                                            onChange={e => setInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                                            placeholder="Ask anything..."
                                            className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-4 py-2.5 rounded-full text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 transition-all font-medium disabled:opacity-50"
                                            disabled={isLoading}
                                        />
                                        <motion.button
                                            whileHover={{ scale: 1.08 }}
                                            whileTap={{ scale: 0.92 }}
                                            onClick={handleSend}
                                            disabled={!input.trim() || isLoading}
                                            aria-label="Send message"
                                            className="bg-[var(--color-primary)] text-white h-10 w-10 rounded-full flex items-center justify-center hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50 shrink-0 shadow-md outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-primary)] dark:focus-visible:ring-offset-slate-800"
                                        >
                                            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">send</span>
                                        </motion.button>
                                    </div>
                                    <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center font-medium">
                                        {messageCount} / {MAX_QUESTIONS} questions used
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                ) : (
                    <motion.button
                        key="chatbot-fab"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        onClick={() => setIsOpen(true)}
                        aria-label="Open contextual chatbot"
                        className="h-14 w-14 bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white rounded-full shadow-[var(--shadow-elevated)] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-primary)] dark:focus-visible:ring-offset-slate-900"
                    >
                        <span className="material-symbols-outlined text-2xl" aria-hidden="true">chat</span>
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    )
}
