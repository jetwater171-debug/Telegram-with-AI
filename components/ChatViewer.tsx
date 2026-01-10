
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { MessageCircle, User, Clock, RefreshCw } from 'lucide-react';

interface Session {
    id: string;
    user_name: string;
    created_at: string;
    last_message_at: string;
    lead_score: string;
    messages?: any[];
}

interface Message {
    id: string;
    sender: string;
    content: string;
    created_at: string;
}

export const ChatViewer: React.FC = () => {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);

    // Auto-scroll ref
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const fetchSessions = async () => {
        const { data } = await supabase
            .from('sessions')
            .select('*')
            .order('last_message_at', { ascending: false });

        if (data) setSessions(data);
    };

    const fetchMessages = async (sessionId: string) => {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (data) setMessages(data);
        scrollToBottom();
    };

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
    };

    useEffect(() => {
        fetchSessions();

        // Realtime subscription for Sessions
        const sessionChannel = supabase
            .channel('public:sessions')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
                fetchSessions();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(sessionChannel);
        };
    }, []);

    useEffect(() => {
        if (selectedSessionId) {
            fetchMessages(selectedSessionId);

            // Realtime subscription for Messages
            const messageChannel = supabase
                .channel(`public:messages:${selectedSessionId}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_id=eq.${selectedSessionId}` }, (payload) => {
                    setMessages(prev => [...prev, payload.new as Message]);
                    scrollToBottom();
                })
                .subscribe();

            return () => {
                supabase.removeChannel(messageChannel);
            };
        }
    }, [selectedSessionId]);

    return (
        <div className="flex h-[600px] border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
            {/* Sidebar List */}
            <div className="w-1/3 border-r border-gray-100 bg-gray-50 flex flex-col">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white">
                    <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                        <MessageCircle size={18} />
                        Conversas
                    </h3>
                    <button onClick={fetchSessions} className="text-gray-400 hover:text-gray-600">
                        <RefreshCw size={16} />
                    </button>
                </div>
                <div className="overflow-y-auto flex-1">
                    {sessions.map(session => (
                        <div
                            key={session.id}
                            onClick={() => setSelectedSessionId(session.id)}
                            className={`p-4 border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-100 ${selectedSessionId === session.id ? 'bg-white border-l-4 border-l-indigo-500 shadow-sm' : ''}`}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className="font-medium text-gray-900 truncate flex items-center gap-1">
                                    <User size={14} className="text-gray-400" />
                                    {session.user_name || 'Desconhecido'}
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${JSON.stringify(session.lead_score).includes('carente') ? 'bg-pink-100 text-pink-700' :
                                    JSON.stringify(session.lead_score).includes('tarado') ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                                    }`}>
                                    {session.lead_score ? (String(session.lead_score).startsWith('{') ? JSON.parse(String(session.lead_score))?.lead_classification || 'Novo' : session.lead_score) : 'Novo'}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Clock size={12} />
                                {new Date(session.last_message_at || session.created_at).toLocaleString('pt-BR')}
                            </div>
                        </div>
                    ))}
                    {sessions.length === 0 && (
                        <div className="p-8 text-center text-gray-400 text-sm">
                            Nenhuma conversa ainda.
                        </div>
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col bg-[#f0f2f5]">
                {selectedSessionId ? (
                    <>
                        <div className="p-3 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between">
                            <span className="font-medium text-gray-700">Histórico de Mensagens</span>
                            <span className="text-xs text-gray-400 font-mono">{selectedSessionId.slice(0, 8)}...</span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {messages.map(msg => {
                                const isBot = msg.sender === 'bot' || msg.sender === 'model';
                                return (
                                    <div key={msg.id} className={`flex ${isBot ? 'justify-start' : 'justify-end'}`}>
                                        <div className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm text-sm ${isBot
                                            ? 'bg-white text-gray-800 rounded-tl-none'
                                            : 'bg-indigo-600 text-white rounded-tr-none'
                                            }`}>
                                            <p>{msg.content}</p>
                                            <span className={`text-[10px] block mt-1 ${isBot ? 'text-gray-400' : 'text-indigo-200'}`}>
                                                {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                        <MessageCircle size={48} className="mb-2 opacity-20" />
                        <p>Selecione uma conversa para visualizar</p>
                    </div>
                )}
            </div>
        </div>
    );
};
