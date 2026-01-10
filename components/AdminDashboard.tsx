import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Trash2, MessageSquare, Video, Gift, LogOut, Menu, X, Search, MoreVertical, Check, CheckCheck, Play, Pause, RefreshCw, Bot } from 'lucide-react';
import AdminPreviews from './AdminPreviews';
import AdminDeliverables from './AdminDeliverables';
import { AdminBots } from './AdminBots';

// Configuração do Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface Message {
    id: string;
    role: 'user' | 'model';
    sender?: string;
    text: string;
    timestamp: any;
    is_audio?: boolean;
    audio_url?: string;
    created_at: string;
}

interface Session {
    session_id: string;
    user_city: string;
    device_type: string;
    created_at: string;
    last_message?: string;
    last_message_time?: string;
    unread_count?: number;
    status?: string;
    lead_score?: any;
}

export default function AdminDashboard() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [activeTab, setActiveTab] = useState<'chat' | 'previews' | 'deliverables' | 'bots'>('chat');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isNearBottom, setIsNearBottom] = useState(true);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const previousMessageCountRef = useRef<number>(0);

    const fetchSessions = async () => {
        const { data, error } = await supabase
            .from('sessions')
            .select('*')
            .order('last_message_at', { ascending: false });

        if (error) {
            console.error('Erro ao buscar sessões:', error);
            return;
        }

        const formattedSessions = data?.map((session: any) => ({
            session_id: session.id,
            user_city: session.user_city || 'Desconhecido',
            device_type: session.device_type || 'Desconhecido',
            created_at: session.created_at,
            last_message: '...',
            last_message_time: session.last_message_at,
            status: session.status,
            lead_score: session.lead_score
        })) || [];

        setSessions(formattedSessions);
    };

    const fetchMessages = async (sessionId: string) => {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Erro ao buscar mensagens:', error);
        } else {
            const formattedMessages = data?.map((msg: any) => ({
                id: msg.id,
                role: (msg.sender === 'user' ? 'user' : 'model') as 'user' | 'model',
                sender: msg.sender,
                text: msg.content,
                created_at: msg.created_at,
                timestamp: msg.created_at
            })) || [];
            setMessages(formattedMessages);
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedSessionId) return;

        const { error } = await supabase
            .from('messages')
            .insert([
                { session_id: selectedSessionId, sender: 'admin', content: newMessage }
            ]);

        if (error) {
            console.error('Erro ao enviar mensagem:', error);
        } else {
            setNewMessage('');
            fetchMessages(selectedSessionId);
        }
    };

    const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Tem certeza que deseja excluir esta conversa?')) {
            const { error } = await supabase
                .from('sessions')
                .delete()
                .eq('id', sessionId);

            if (error) {
                console.error('Erro ao excluir sessão:', error);
            } else {
                setSessions(sessions.filter(s => s.session_id !== sessionId));
                if (selectedSessionId === sessionId) setSelectedSessionId(null);
            }
        }
    };

    const handleResetSession = async () => {
        if (!selectedSessionId) return;
        if (confirm('Tem certeza que deseja RESETAR esta conversa? Todas as mensagens serão apagadas.')) {
            // 1. Apagar mensagens
            const { error: msgError } = await supabase
                .from('messages')
                .delete()
                .eq('session_id', selectedSessionId);

            if (msgError) {
                console.error("Erro ao apagar mensagens:", msgError);
                return;
            }

            // 2. Resetar status da sessão
            const { error: sessionError } = await supabase
                .from('sessions')
                .update({
                    status: 'active',
                    lead_score: null,
                    last_message_at: new Date()
                })
                .eq('id', selectedSessionId);

            if (sessionError) {
                console.error("Erro ao resetar sessão:", sessionError);
            } else {
                fetchSessions();
                fetchMessages(selectedSessionId);
            }
        }
    };

    const handleToggleAI = async () => {
        if (!selectedSessionId) return;
        const currentSession = sessions.find(s => s.session_id === selectedSessionId);
        if (!currentSession) return;

        const newStatus = currentSession.status === 'paused' ? 'active' : 'paused';

        const { error } = await supabase
            .from('sessions')
            .update({ status: newStatus })
            .eq('id', selectedSessionId);

        if (error) {
            console.error("Erro ao alterar status da IA:", error);
        } else {
            fetchSessions(); // Atualiza a lista para refletir o novo status
        }
    };

    // Helper para parsear lead_score
    const getLeadStats = (session: Session | undefined) => {
        if (!session || !session.lead_score) return null;
        try {
            if (typeof session.lead_score === 'string' && session.lead_score.startsWith('{')) {
                return JSON.parse(session.lead_score);
            }
            return null;
        } catch (e) {
            return null;
        }
    };

    const handleScroll = () => {
        if (!messagesContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        // Consider "near bottom" if within 100px
        setIsNearBottom(distanceFromBottom < 100);
    };

    useEffect(() => {
        fetchSessions();
        const interval = setInterval(fetchSessions, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (selectedSessionId) {
            fetchMessages(selectedSessionId);
            const interval = setInterval(() => fetchMessages(selectedSessionId), 3000);
            return () => clearInterval(interval);
        }
    }, [selectedSessionId]);

    useEffect(() => {
        // Only auto-scroll if:
        // 1. User is already near the bottom (not scrolling through history)
        // 2. A new message was added (message count increased from previous)
        const currentCount = messages.length;
        const previousCount = previousMessageCountRef.current;

        if (isNearBottom && currentCount > previousCount && currentCount > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }

        // Update the ref for next comparison
        previousMessageCountRef.current = currentCount;
    }, [messages, isNearBottom]);

    const renderContent = () => {
        if (activeTab === 'previews') return <AdminPreviews />;
        if (activeTab === 'deliverables') return <AdminDeliverables />;
        if (activeTab === 'bots') return <AdminBots />;

        const currentSession = sessions.find(s => s.session_id === selectedSessionId);
        const stats = getLeadStats(currentSession);

        return (
            <div className="flex h-full bg-[#0b141a]">
                {/* Lista de Sessões (Sidebar Interna) */}
                <div className={`w-96 border-r border-[#2a3942] flex flex-col bg-[#111b21] ${!selectedSessionId ? 'block' : 'hidden md:flex'}`}>
                    <div className="p-4 bg-[#202c33] flex justify-between items-center border-b border-[#2a3942]">
                        <h2 className="text-xl font-bold text-[#e9edef]">Conversas</h2>
                        <button onClick={fetchSessions} className="text-[#aebac1] hover:text-[#e9edef]">
                            <RefreshCw size={20} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {sessions.map((session) => (
                            <div
                                key={session.session_id}
                                onClick={() => setSelectedSessionId(session.session_id)}
                                className={`p-4 border-b border-[#2a3942] cursor-pointer hover:bg-[#202c33] transition-colors ${selectedSessionId === session.session_id ? 'bg-[#2a3942]' : ''}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="font-semibold text-[#e9edef] truncate w-32">
                                        {session.user_city}
                                    </h3>
                                    <span className="text-xs text-[#8696a0]">
                                        {new Date(session.last_message_time!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <p className="text-sm text-[#8696a0] truncate flex-1 mr-2">
                                        {session.last_message}
                                    </p>
                                    <button
                                        onClick={(e) => deleteSession(session.session_id, e)}
                                        className="text-[#8696a0] hover:text-red-500 p-1 rounded-full hover:bg-[#202c33]"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                    <span className="text-[10px] bg-[#202c33] text-[#8696a0] px-1.5 py-0.5 rounded border border-[#2a3942]">
                                        {session.device_type}
                                    </span>
                                    {session.status === 'paused' && (
                                        <span className="text-[10px] bg-yellow-900 text-yellow-200 px-1.5 py-0.5 rounded border border-yellow-700">
                                            IA PAUSADA
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Área de Chat */}
                <div className={`flex-1 flex flex-col bg-[#0b141a] bg-opacity-95 relative ${selectedSessionId ? 'block' : 'hidden md:flex'}`}>
                    {selectedSessionId ? (
                        <>
                            {/* Header do Chat */}
                            <div className="bg-[#202c33] p-4 flex items-center justify-between border-b border-[#2a3942]">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white font-bold">
                                        {currentSession?.user_city[0]}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-[#e9edef]">
                                            {currentSession?.user_city}
                                        </h3>
                                        <p className="text-xs text-[#8696a0]">
                                            {currentSession?.status === 'active' ? 'IA Ativa' : 'IA Pausada'}
                                        </p>
                                    </div>
                                </div>

                                {/* Stats Display */}
                                {stats && (
                                    <div className="hidden lg:flex gap-4 mr-4">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[10px] text-[#8696a0] uppercase">Tarado</span>
                                            <div className="w-16 h-1.5 bg-[#2a3942] rounded-full overflow-hidden">
                                                <div className="h-full bg-red-500" style={{ width: `${(stats.tarado / 10) * 100}%` }} />
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[10px] text-[#8696a0] uppercase">Carente</span>
                                            <div className="w-16 h-1.5 bg-[#2a3942] rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500" style={{ width: `${(stats.carente / 10) * 100}%` }} />
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[10px] text-[#8696a0] uppercase">Financeiro</span>
                                            <div className="w-16 h-1.5 bg-[#2a3942] rounded-full overflow-hidden">
                                                <div className="h-full bg-green-500" style={{ width: `${(stats.financeiro / 10) * 100}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-2 text-[#aebac1]">
                                    <button
                                        onClick={handleToggleAI}
                                        className={`p-2 rounded hover:bg-[#2a3942] transition-colors ${currentSession?.status === 'paused' ? 'text-yellow-400' : 'text-[#aebac1]'}`}
                                        title={currentSession?.status === 'paused' ? "Retomar IA" : "Pausar IA"}
                                    >
                                        {currentSession?.status === 'paused' ? <Play size={20} /> : <Pause size={20} />}
                                    </button>
                                    <button
                                        onClick={handleResetSession}
                                        className="p-2 rounded hover:bg-[#2a3942] hover:text-red-400 transition-colors"
                                        title="Resetar Conversa"
                                    >
                                        <RefreshCw size={20} />
                                    </button>
                                    <Search size={20} className="p-2 box-content" />
                                    <MoreVertical size={20} className="p-2 box-content" />
                                </div>
                            </div>

                            {/* Lista de Mensagens */}
                            <div
                                ref={messagesContainerRef}
                                onScroll={handleScroll}
                                className="flex-1 overflow-y-auto p-4 space-y-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-opacity-10"
                            >
                                {messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                                    >
                                        <div
                                            className={`max-w-[70%] rounded-lg p-3 relative ${msg.role === 'user'
                                                ? 'bg-[#202c33] text-[#e9edef] rounded-tl-none'
                                                : msg.sender === 'admin'
                                                    ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-none' // Admin
                                                    : 'bg-[#005c4b] text-[#e9edef] rounded-tr-none' // Bot
                                                }`}
                                        >
                                            {msg.sender === 'admin' && (
                                                <div className="text-[10px] text-[#8696a0] mb-1 font-bold uppercase tracking-wider">
                                                    Admin
                                                </div>
                                            )}
                                            {/* Render Internal Thought if present */}
                                            {(() => {
                                                const thoughtMatch = msg.text && msg.text.match(/\[INTERNAL_THOUGHT\]([\s\S]*?)\[\/INTERNAL_THOUGHT\]/);
                                                const thought = thoughtMatch ? thoughtMatch[1] : null;
                                                const cleanText = msg.text ? msg.text.replace(/\[INTERNAL_THOUGHT\][\s\S]*?\[\/INTERNAL_THOUGHT\]\n?/, '') : '';

                                                return (
                                                    <>
                                                        {thought && (
                                                            <div className="mb-2 p-2 bg-[#1f2c34] border-l-2 border-yellow-500 rounded text-xs text-yellow-200 italic">
                                                                <span className="font-bold not-italic text-yellow-500 block text-[10px] uppercase mb-1">🧠 Pensamento da IA:</span>
                                                                {thought}
                                                            </div>
                                                        )}
                                                        <p className="text-sm whitespace-pre-wrap">{cleanText}</p>
                                                    </>
                                                );
                                            })()}
                                            <div className="flex justify-end items-center gap-1 mt-1">
                                                <span className="text-[10px] text-[#8696a0]">
                                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                {msg.role !== 'user' && (
                                                    <CheckCheck size={14} className="text-[#53bdeb]" />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input de Mensagem */}
                            <div className="bg-[#202c33] p-3 flex items-center gap-4 border-t border-[#2a3942]">
                                <button className="text-[#8696a0] hover:text-[#aebac1]">
                                    <Gift size={24} />
                                </button>
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                                    placeholder="Digite uma mensagem..."
                                    className="flex-1 bg-[#2a3942] text-[#e9edef] rounded-lg px-4 py-2 focus:outline-none placeholder-[#8696a0]"
                                />
                                <button
                                    onClick={handleSendMessage}
                                    className="p-2 bg-[#00a884] text-white rounded-full hover:bg-[#008f6f] transition-colors"
                                >
                                    <MessageSquare size={20} />
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-[#8696a0] border-b-[6px] border-[#00a884]">
                            <h1 className="text-3xl font-light mb-4 text-[#e9edef]">WhatsApp Web Admin</h1>
                            <p>Selecione uma conversa para começar a monitorar.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-screen w-screen bg-[#0b141a] overflow-hidden font-sans">
            {/* Sidebar Principal (Navegação) */}
            <div className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-[#202c33] border-r border-[#2a3942] flex flex-col transition-all duration-300 z-20`}>
                <div className="p-4 flex items-center justify-between border-b border-[#2a3942] h-16">
                    {isSidebarOpen && <h1 className="text-[#e9edef] font-bold text-lg tracking-wider">ADMIN</h1>}
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-[#aebac1] hover:text-[#e9edef] p-1 rounded hover:bg-[#2a3942]">
                        {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>

                <nav className="flex-1 py-6 space-y-2 px-2">
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg transition-all ${activeTab === 'chat' ? 'bg-[#2a3942] text-[#00a884]' : 'text-[#aebac1] hover:bg-[#111b21]'}`}
                    >
                        <MessageSquare size={22} />
                        {isSidebarOpen && <span className="font-medium">Chat Monitor</span>}
                    </button>

                    <button
                        onClick={() => setActiveTab('bots')}
                        className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg transition-all ${activeTab === 'bots' ? 'bg-[#2a3942] text-[#00a884]' : 'text-[#aebac1] hover:bg-[#111b21]'}`}
                    >
                        <Bot size={22} />
                        {isSidebarOpen && <span className="font-medium">Meus Bots</span>}
                    </button>

                    <button
                        onClick={() => setActiveTab('previews')}
                        className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg transition-all ${activeTab === 'previews' ? 'bg-[#2a3942] text-[#00a884]' : 'text-[#aebac1] hover:bg-[#111b21]'}`}
                    >
                        <Video size={22} />
                        {isSidebarOpen && <span className="font-medium">Prévias (Grátis)</span>}
                    </button>

                    <button
                        onClick={() => setActiveTab('deliverables')}
                        className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg transition-all ${activeTab === 'deliverables' ? 'bg-[#2a3942] text-[#00a884]' : 'text-[#aebac1] hover:bg-[#111b21]'}`}
                    >
                        <Gift size={22} />
                        {isSidebarOpen && <span className="font-medium">Entregáveis (Pagos)</span>}
                    </button>
                </nav>

                <div className="p-4 border-t border-[#2a3942]">
                    <button className="w-full flex items-center gap-4 px-4 py-3 text-red-400 hover:bg-[#2a3942] rounded-lg transition-all">
                        <LogOut size={22} />
                        {isSidebarOpen && <span className="font-medium">Sair</span>}
                    </button>
                </div>
            </div>

            {/* Conteúdo Principal */}
            <div className="flex-1 h-full overflow-hidden relative">
                {renderContent()}
            </div>
        </div>
    );
}
