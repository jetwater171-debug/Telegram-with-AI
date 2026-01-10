
import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { Bot, Plus, Trash2, RefreshCw } from 'lucide-react';
import { AddBotModal } from './AddBotModal';

interface TelegramBot {
    id: string;
    bot_name: string;
    bot_token: string;
    webhook_status: string;
    is_active: boolean;
    created_at: string;
}

export const AdminBots: React.FC = () => {
    const [bots, setBots] = useState<TelegramBot[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchBots = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('telegram_bots')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Erro ao buscar bots:', error);
        } else {
            setBots(data || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchBots();
    }, []);

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja remover este bot?')) return;

        const { error } = await supabase.from('telegram_bots').delete().eq('id', id);
        if (error) alert('Erro ao deletar');
        else fetchBots();
    };

    const handleReconnect = async (botId: string) => {
        if (!confirm('Reconectar webhook? Isso atualizará a URL do túnel.')) return;
        try {
            await fetch('/api/setup-webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ botId })
            });
            alert("Webhook atualizado com sucesso!");
            fetchBots();
        } catch (e) {
            console.error(e);
            alert("Erro ao reconectar.");
        }
    };

    return (
        <div className="h-full bg-gray-50 p-6 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
                <header className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Gerenciar Bots</h1>
                        <p className="text-gray-500 mt-1">Configure seus bots do Telegram</p>
                    </div>

                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                    >
                        <Plus size={20} />
                        Novo Bot
                    </button>
                </header>

                {loading ? (
                    <div className="text-center py-12">
                        <RefreshCw className="animate-spin mx-auto text-indigo-600" size={32} />
                    </div>
                ) : bots.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-100">
                        <div className="bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Bot className="text-indigo-600" size={32} />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900">Nenhum bot encontrado</h3>
                        <p className="text-gray-500 mt-2 mb-6">Comece adicionando seu primeiro bot do Telegram.</p>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="text-indigo-600 font-medium hover:text-indigo-800"
                        >
                            Adicionar Bot Agora
                        </button>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {bots.map((bot) => (
                            <div key={bot.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${bot.is_active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                                        <Bot size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900">{bot.bot_name}</h3>
                                        <p className="text-sm text-gray-500 font-mono bg-gray-50 px-2 py-0.5 rounded inline-block mt-1">
                                            {bot.bot_token.substring(0, 10)}...
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="text-right mr-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${bot.webhook_status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                            }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${bot.webhook_status === 'active' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                                            {bot.webhook_status === 'active' ? 'Online' : 'Pendente'}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 border-l pl-4 border-gray-100">
                                        <button title="Reconectar Webhook" onClick={() => handleReconnect(bot.id)} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                            <RefreshCw size={18} />
                                        </button>
                                        <button title="Excluir" onClick={() => handleDelete(bot.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <AddBotModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={fetchBots}
                />
            </div>
        </div>
    );
};
