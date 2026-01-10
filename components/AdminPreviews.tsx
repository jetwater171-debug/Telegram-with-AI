import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

interface Preview {
    id: string;
    title: string;
    category: string;
    video_url: string;
    thumbnail_url?: string;
}

const AdminPreviews: React.FC = () => {
    const [previews, setPreviews] = useState<Preview[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [newPreview, setNewPreview] = useState({ title: '', category: 'banho', video_url: '' });

    const categories = [
        { id: 'banho', title: '🛁 Banho' },
        { id: 'siririca', title: '🔥 Siririca' },
        { id: 'tio', title: '👴 Dando pro Tio' },
        { id: 'outros', title: '✨ Outros' }
    ];

    useEffect(() => {
        fetchPreviews();
    }, []);

    const fetchPreviews = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('previews').select('*').order('created_at', { ascending: false });
        if (error) console.error('Error fetching previews:', error);
        else setPreviews(data || []);
        setLoading(false);
    };

    const handleAddPreview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPreview.title || !newPreview.video_url) return alert('Preencha título e URL');

        const { error } = await supabase.from('previews').insert([newPreview]);
        if (error) {
            alert('Erro ao adicionar');
            console.error(error);
        } else {
            setShowModal(false);
            setNewPreview({ title: '', category: 'banho', video_url: '' });
            fetchPreviews();
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Tem certeza?')) return;
        const { error } = await supabase.from('previews').delete().eq('id', id);
        if (error) alert('Erro ao deletar');
        else fetchPreviews();
    };

    return (
        <div className="p-8 bg-gray-50 min-h-full">
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold text-gray-800">Gerenciar Prévias de Vídeo</h2>
                <button
                    onClick={() => setShowModal(true)}
                    className="bg-teal-600 text-white px-6 py-3 rounded-lg hover:bg-teal-700 transition font-bold shadow-lg flex items-center gap-2"
                >
                    <span>+</span> Adicionar Vídeo
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {categories.map((category) => {
                    const categoryPreviews = previews.filter(p => p.category === category.id);

                    return (
                        <div key={category.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-full">
                            <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                                <h3 className="text-xl font-bold text-gray-700">{category.title}</h3>
                                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">{categoryPreviews.length}</span>
                            </div>

                            <div className="space-y-4 flex-1 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                                {categoryPreviews.length === 0 ? (
                                    <div className="h-32 bg-gray-50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-200">
                                        <p className="text-gray-400 text-sm">Vazio</p>
                                    </div>
                                ) : (
                                    categoryPreviews.map(preview => (
                                        <div key={preview.id} className="group relative bg-gray-50 rounded-lg overflow-hidden border border-gray-200 hover:shadow-md transition">
                                            <div className="aspect-video bg-black flex items-center justify-center relative">
                                                <video src={preview.video_url} className="w-full h-full object-cover opacity-80" />
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/40">
                                                    <a href={preview.video_url} target="_blank" rel="noreferrer" className="text-white text-2xl">▶️</a>
                                                </div>
                                            </div>
                                            <div className="p-3">
                                                <h4 className="font-semibold text-gray-800 text-sm truncate" title={preview.title}>{preview.title}</h4>
                                                <div className="flex justify-between items-center mt-2">
                                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">ID: {preview.id.slice(0, 4)}</span>
                                                    <button
                                                        onClick={() => handleDelete(preview.id)}
                                                        className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition"
                                                        title="Excluir"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Modal de Adição */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md relative animate-fadeIn">
                        <button
                            onClick={() => setShowModal(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                        >
                            ✕
                        </button>
                        <h3 className="text-2xl font-bold mb-6 text-gray-800">Adicionar Nova Prévia</h3>

                        <form onSubmit={handleAddPreview} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                                <input
                                    type="text"
                                    value={newPreview.title}
                                    onChange={e => setNewPreview({ ...newPreview, title: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition"
                                    placeholder="Ex: Banho gostoso..."
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                                <select
                                    value={newPreview.category}
                                    onChange={e => setNewPreview({ ...newPreview, category: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition bg-white"
                                >
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">URL do Vídeo (MP4)</label>
                                <input
                                    type="url"
                                    value={newPreview.video_url}
                                    onChange={e => setNewPreview({ ...newPreview, video_url: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition"
                                    placeholder="https://..."
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-teal-600 text-white py-3 rounded-lg font-bold hover:bg-teal-700 transition shadow-md mt-4"
                            >
                                Salvar Vídeo
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPreviews;
