'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, X, Bot, User, Loader2, Maximize2, Minimize2, Sparkles, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { useProjectStore } from '@/store';
import { usePathname } from 'next/navigation';

const ProjectChat = ({ projectId: propProjectId, projectName: propProjectName }) => {
    const { activeGroupId, activeGroupName } = useProjectStore();
    const pathname = usePathname();

    // Use props if provided, otherwise fallback to store
    const projectId = propProjectId || activeGroupId || 'all';
    const projectName = propProjectName || activeGroupName || 'All Projects';

    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [message, setMessage] = useState('');
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen && !isMinimized) {
            scrollToBottom();
        }
    }, [history, isOpen, isMinimized]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!message.trim() || loading) return;

        const userMessage = { role: 'user', content: message };
        setHistory([...history, userMessage]);
        setMessage('');
        setLoading(true);
        setError(null);

        try {
            const response = await api.post(`/chat/project/${projectId}`, {
                message: userMessage.content,
                message: userMessage.content,
                currentPath: pathname,
                history: history.slice(-6) // Send last 3 exchanges for context
            });

            if (response.data.success) {
                setHistory(prev => [...prev, { role: 'assistant', content: response.data.message }]);
            } else {
                throw new Error(response.data.error || 'Failed to get response');
            }
        } catch (err) {
            console.error('Chat error:', err);
            setError(err.response?.data?.error || 'Failed to connect to AI service');
            setHistory(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please make sure your API key is configured in the AI Settings.', isError: true }]);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/30 flex items-center justify-center hover:scale-110 transition-all z-50 group border-4 border-white"
            >
                <Sparkles className="animate-pulse group-hover:rotate-12 transition-transform" size={24} />
            </button>
        );
    }

    return (
        <div className={`fixed bottom-6 right-6 w-96 ${isMinimized ? 'h-14' : 'h-[550px]'} bg-white rounded-2xl shadow-2xl flex flex-col z-50 transition-all duration-300 border border-[var(--color-border)] overflow-hidden`}>
            {/* Header */}
            <div className="p-4 bg-[var(--color-primary)] text-white flex items-center justify-between cursor-pointer" onClick={() => isMinimized && setIsMinimized(false)}>
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
                        <Bot size={18} />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm leading-none">Project Assistant</h3>
                        <p className="text-[10px] text-white/70 mt-1 truncate max-w-[180px]">{projectName}</p>
                    </div >
                </div >
                <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }} className="p-1.5 hover:bg-white/10 rounded-md transition-colors">
                        {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} className="p-1.5 hover:bg-white/10 rounded-md transition-colors">
                        <X size={16} />
                    </button>
                </div>
            </div >

            {!isMinimized && (
                <>
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
                        {history.length === 0 && (
                            <div className="text-center py-8 px-4">
                                <div className="h-12 w-12 rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center mx-auto mb-3">
                                    <Sparkles size={24} />
                                </div>
                                <h4 className="font-bold text-gray-800 text-sm">
                                    {projectId === 'all' ? 'Chat with your Workspace' : 'Ask about your project'}
                                </h4>
                                <p className="text-xs text-gray-500 mt-2">
                                    {projectId === 'all'
                                        ? 'I can answer questions regarding any user story or BRD in your entire workspace.'
                                        : 'I can answer questions regarding user stories, requirements, and BRD details in this project.'}
                                </p>
                                <div className="mt-4 grid grid-cols-1 gap-2">
                                    {['What are the security requirements?', 'Summarize this project', 'What are the main goals?'].map((q) => (
                                        <button
                                            key={q}
                                            onClick={() => setMessage(q)}
                                            className="text-[11px] text-left p-2 rounded-lg border border-gray-200 bg-white hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
                                        >
                                            "{q}"
                                        </button>
                                    ))}
                                </div>
                            </div >
                        )}

                        {
                            history.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                        <div className={`h-7 w-7 rounded-lg flex-shrink-0 flex items-center justify-center ${msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-600'}`}>
                                            {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                                        </div>
                                        <div className={`p-3 rounded-2xl text-[13px] shadow-sm ${msg.role === 'user'
                                            ? 'bg-[var(--color-primary)] text-white rounded-tr-none'
                                            : msg.isError
                                                ? 'bg-red-50 text-red-700 border border-red-100 rounded-tl-none'
                                                : 'bg-white text-gray-800 border border-[var(--color-border)] rounded-tl-none'
                                            }`}>
                                            {msg.content}
                                        </div>
                                    </div>
                                </div>
                            ))
                        }

                        {
                            loading && (
                                <div className="flex justify-start">
                                    <div className="flex gap-2 items-center text-gray-400 text-xs italic ml-9">
                                        <Loader2 size={12} className="animate-spin" />
                                        Assistant is typing...
                                    </div>
                                </div>
                            )
                        }

                        {
                            error && (
                                <div className="p-2 rounded-lg bg-red-50 text-[11px] text-red-600 border border-red-100 flex items-center gap-2">
                                    <AlertCircle size={14} />
                                    {error}
                                </div>
                            )
                        }

                        <div ref={messagesEndRef} />
                    </div >

                    {/* Input */}
                    < form onSubmit={handleSend} className="p-4 border-t border-[var(--color-border)] bg-white" >
                        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-1 focus-within:ring-2 focus-within:ring-[var(--color-primary)]/20 focus-within:bg-white transition-all border border-transparent focus-within:border-[var(--color-primary)]/30">
                            <input
                                type="text"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Type your question..."
                                className="flex-1 bg-transparent border-none py-2 text-sm focus:outline-none"
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                disabled={!message.trim() || loading}
                                className="p-1.5 rounded-lg bg-[var(--color-primary)] text-white disabled:opacity-50 disabled:bg-gray-400 hover:scale-105 active:scale-95 transition-all"
                            >
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            </button>
                        </div>
                        <p className="text-[10px] text-center text-gray-400 mt-2">Powered by AI Study Project Intelligence</p>
                    </form >
                </>
            )}
        </div >
    );
};

export default ProjectChat;
