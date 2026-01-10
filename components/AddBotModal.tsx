import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { X, Save, AlertCircle } from 'lucide-react';

interface AddBotModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const AddBotModal: React.FC<AddBotModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [token, setToken] = useState('');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (!token.includes(':')) {
            setError("Token inválido. Deve conter ':'");
            setLoading(false);
            return;
        }

        try {
            // 1. Salvar no Supabase
            const { data, error: dbError } = await supabase
                .from('telegram_bots')
                .insert([
                    { bot_token: token, bot_name: name, webhook_status: 'pending' }
                ])
                .select()
                .single();

            if (dbError) throw dbError;

            // 2. Chamar Webhook de Setup
            try {
                await fetch('/api/setup-webhook', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ botId: data.id })
                });
            } catch (setupErr) {
                console.error("Webhook setup failed but bot saved", setupErr);
            }

            onSuccess();
            onClose();
            setToken('');
            setName('');
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Erro ao adicionar bot');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <h2 className="text-xl font-semibold text-gray-900">Novo Bot Telegram</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-start gap-2">
                            <AlertCircle size={16} className="mt-0.5 shrink-0" />
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Bot</label>
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: Larissa Atendente"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Token do Bot (BotFather)</label>
                        <input
                            type="text"
                            required
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-mono text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-1">Pegue este token criando um bot no @BotFather do Telegram.</p>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Save size={18} />
                            )}
                            Salvar Bot
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
