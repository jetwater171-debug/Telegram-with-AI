import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Trash2, Plus, Play, Image as ImageIcon } from 'lucide-react';

// Configuração do Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface Deliverable {
    id: string;
    title: string;
    video_url: string;
    thumbnail_url: string | null;
    created_at: string;
}

export default function AdminDeliverables() {
    const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Form States
    const [newTitle, setNewTitle] = useState('');
    const [newVideoUrl, setNewVideoUrl] = useState('');
    const [newThumbnailUrl, setNewThumbnailUrl] = useState('');

    useEffect(() => {
        fetchDeliverables();
    }, []);

    const fetchDeliverables = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('deliverables')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Erro ao buscar entregáveis:', error);
        } else {
            setDeliverables(data || []);
        }
        setLoading(false);
    };

    const handleAddDeliverable = async () => {
        if (!newTitle || !newVideoUrl) return alert("Preencha título e URL do vídeo!");

        const { error } = await supabase
            .from('deliverables')
            .insert([{
                title: newTitle,
                video_url: newVideoUrl,
                thumbnail_url: newThumbnailUrl || null
            }]);

        if (error) {
            alert('Erro ao adicionar: ' + error.message);
        } else {
            setIsModalOpen(false);
            setNewTitle('');
            setNewVideoUrl('');
            setNewThumbnailUrl('');
            fetchDeliverables();
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Tem certeza que quer deletar este vídeo?")) return;

        const { error } = await supabase
            .from('deliverables')
            .delete()
            .eq('id', id);

        if (error) {
            alert('Erro ao deletar: ' + error.message);
        } else {
            fetchDeliverables();
        }
    };

    return (
        <div className="p-8 bg-[#111b21] min-h-full text-[#e9edef]">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-[#00a884]">Entregáveis (Pagos)</h1>
                    <p className="text-gray-400 mt-1">Gerencie os vídeos que serão enviados após a compra.</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 bg-[#00a884] hover:bg-[#008f6f] text-white px-6 py-3 rounded-lg font-medium transition-all shadow-lg hover:shadow-[#00a884]/20"
                >
                    <Plus size={20} />
                    Novo Vídeo
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00a884]"></div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {deliverables.map((item) => (
                        <div key={item.id} className="bg-[#202c33] rounded-xl overflow-hidden border border-[#2a3942] hover:border-[#00a884]/50 transition-all group">
                            <div className="relative aspect-video bg-black/40 group-hover:bg-black/20 transition-all">
                                {item.thumbnail_url ? (
                                    <img src={item.thumbnail_url} alt={item.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                                        <Play size={48} />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                                    <a href={item.video_url} target="_blank" rel="noopener noreferrer" className="text-white hover:text-[#00a884] flex items-center gap-2 font-medium">
                                        <Play size={16} fill="currentColor" /> Assistir
                                    </a>
                                </div>
                            </div>

                            <div className="p-4">
                                <h3 className="font-semibold text-lg text-[#e9edef] mb-1 truncate" title={item.title}>{item.title}</h3>
                                <div className="flex justify-between items-center mt-4 pt-4 border-t border-[#2a3942]">
                                    <span className="text-xs text-gray-500 font-mono">ID: {item.id.slice(0, 8)}...</span>
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        className="text-red-400 hover:text-red-300 p-2 hover:bg-red-500/10 rounded-full transition-colors"
                                        title="Excluir"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal de Adição */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#202c33] p-8 rounded-2xl w-full max-w-md border border-[#2a3942] shadow-2xl transform transition-all scale-100">
                        <h2 className="text-2xl font-bold mb-6 text-[#e9edef]">Novo Entregável</h2>

                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-[#8696a0] mb-2">Título do Vídeo</label>
                                <input
                                    type="text"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-lg p-3 text-[#e9edef] focus:outline-none focus:border-[#00a884] transition-colors"
                                    placeholder="Ex: Banho Premium Completo"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-[#8696a0] mb-2">URL do Vídeo (MP4/Link)</label>
                                <input
                                    type="text"
                                    value={newVideoUrl}
                                    onChange={(e) => setNewVideoUrl(e.target.value)}
                                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-lg p-3 text-[#e9edef] focus:outline-none focus:border-[#00a884] transition-colors"
                                    placeholder="https://..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-[#8696a0] mb-2">URL da Thumbnail (Opcional)</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newThumbnailUrl}
                                        onChange={(e) => setNewThumbnailUrl(e.target.value)}
                                        className="w-full bg-[#111b21] border border-[#2a3942] rounded-lg p-3 text-[#e9edef] focus:outline-none focus:border-[#00a884] transition-colors"
                                        placeholder="https://..."
                                    />
                                    {newThumbnailUrl && (
                                        <div className="w-12 h-12 rounded-lg overflow-hidden border border-[#2a3942] shrink-0">
                                            <img src={newThumbnailUrl} className="w-full h-full object-cover" alt="Preview" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-8">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-5 py-2.5 text-[#8696a0] hover:text-[#e9edef] hover:bg-[#2a3942] rounded-lg transition-colors font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleAddDeliverable}
                                className="px-5 py-2.5 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-lg font-medium shadow-lg hover:shadow-[#00a884]/20 transition-all"
                            >
                                Salvar Vídeo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
