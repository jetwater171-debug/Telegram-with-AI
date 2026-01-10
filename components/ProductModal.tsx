import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { Product } from '../types';

interface ProductModalProps {
    product: Product | null;
    onClose: () => void;
}

const ProductModal: React.FC<ProductModalProps> = ({ product, onClose }) => {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        category: 'pack' as 'pack' | 'video_call' | 'meeting' | 'custom',
        base_price: '',
        downsell_price: '',
        upsell_price: '',
        is_active: true,
        sort_order: 0
    });
    const [deliverables, setDeliverables] = useState<string[]>([]);
    const [deliveryMethod, setDeliveryMethod] = useState('');
    const [deliveryTime, setDeliveryTime] = useState('');
    const [availableMedia, setAvailableMedia] = useState<any[]>([]);
    const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchAvailableMedia();

        if (product) {
            setFormData({
                name: product.name,
                description: product.description || '',
                category: product.category,
                base_price: product.base_price.toString(),
                downsell_price: product.downsell_price?.toString() || '',
                upsell_price: product.upsell_price?.toString() || '',
                is_active: product.is_active,
                sort_order: product.sort_order
            });
            setDeliverables(product.deliverables || []);
            setDeliveryMethod(product.delivery_method || '');
            setDeliveryTime(product.delivery_time || '');

            // Buscar mídias vinculadas
            fetchProductMedia(product.id);
        }
    }, [product]);

    const fetchAvailableMedia = async () => {
        const { data } = await supabase
            .from('media_library')
            .select('*')
            .eq('media_category', 'preview')
            .order('created_at', { ascending: false });
        setAvailableMedia(data || []);
    };

    const fetchProductMedia = async (productId: string) => {
        const { data } = await supabase
            .from('media_library')
            .select('id')
            .eq('product_id', productId);
        setSelectedMediaIds(data?.map(m => m.id) || []);
    };

    const toggleMediaSelection = (mediaId: string) => {
        setSelectedMediaIds(prev =>
            prev.includes(mediaId)
                ? prev.filter(id => id !== mediaId)
                : [...prev, mediaId]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            const dataToSave = {
                name: formData.name,
                description: formData.description || null,
                category: formData.category,
                base_price: parseFloat(formData.base_price),
                downsell_price: formData.downsell_price ? parseFloat(formData.downsell_price) : null,
                upsell_price: formData.upsell_price ? parseFloat(formData.upsell_price) : null,
                deliverables: deliverables.length > 0 ? deliverables : null,
                delivery_method: deliveryMethod || null,
                delivery_time: deliveryTime || null,
                is_active: formData.is_active,
                sort_order: formData.sort_order,
                updated_at: new Date().toISOString()
            };

            let productId = product?.id;
            let error;

            if (product) {
                // Update
                const result = await supabase
                    .from('products')
                    .update(dataToSave)
                    .eq('id', product.id)
                    .select()
                    .single();
                error = result.error;
            } else {
                // Create
                const result = await supabase
                    .from('products')
                    .insert([dataToSave])
                    .select()
                    .single();
                error = result.error;
                productId = result.data?.id;
            }

            if (error) throw error;

            // Atualizar vínculos de mídia
            if (productId) {
                // 1. Limpar vínculos antigos
                await supabase
                    .from('media_library')
                    .update({ product_id: null })
                    .eq('product_id', productId);

                // 2. Criar novos vínculos
                if (selectedMediaIds.length > 0) {
                    await supabase
                        .from('media_library')
                        .update({ product_id: productId })
                        .in('id', selectedMediaIds);
                }
            }

            alert('✅ Produto salvo com sucesso!');
            onClose();
        } catch (error: any) {
            console.error('Save error:', error);
            alert(`❌ Erro ao salvar produto: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6">
                        {product ? 'Editar Produto' : 'Novo Produto'}
                    </h2>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Coluna da Esquerda: Dados Básicos */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-gray-700 border-b pb-2">📦 Dados Básicos</h3>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Produto *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                                        placeholder="Ex: Pack de Vídeos Exclusivos"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                                        rows={3}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Categoria *</label>
                                    <select
                                        required
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                                    >
                                        <option value="pack">📦 Pack</option>
                                        <option value="video_call">📞 Vídeo Chamada</option>
                                        <option value="meeting">🤝 Encontro</option>
                                        <option value="custom">⭐ Personalizado</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Preço Base (R$)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            required
                                            value={formData.base_price}
                                            onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                                            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Downsell (R$)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.downsell_price}
                                            onChange={(e) => setFormData({ ...formData, downsell_price: e.target.value })}
                                            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Upsell (R$)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.upsell_price}
                                            onChange={(e) => setFormData({ ...formData, upsell_price: e.target.value })}
                                            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Coluna da Direita: Entrega e Mídia */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-gray-700 border-b pb-2">🚚 Entrega e Prévias</h3>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Entregáveis (um por linha)
                                    </label>
                                    <textarea
                                        value={deliverables.join('\n')}
                                        onChange={(e) => setDeliverables(e.target.value.split('\n'))}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                                        rows={4}
                                        placeholder="Ex:&#10;5 vídeos sensuais&#10;10 fotos em HD"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Método</label>
                                        <input
                                            type="text"
                                            value={deliveryMethod}
                                            onChange={(e) => setDeliveryMethod(e.target.value)}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                            placeholder="WhatsApp"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Prazo</label>
                                        <input
                                            type="text"
                                            value={deliveryTime}
                                            onChange={(e) => setDeliveryTime(e.target.value)}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                            placeholder="Imediato"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Vincular Prévias (Selecione da Biblioteca)
                                    </label>
                                    <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto border rounded-lg p-2 bg-gray-50">
                                        {availableMedia.map(media => (
                                            <div
                                                key={media.id}
                                                onClick={() => toggleMediaSelection(media.id)}
                                                className={`aspect-square relative cursor-pointer rounded overflow-hidden border-2 transition ${selectedMediaIds.includes(media.id)
                                                        ? 'border-blue-500 ring-2 ring-blue-200'
                                                        : 'border-transparent hover:border-gray-300'
                                                    }`}
                                            >
                                                {media.file_type === 'image' ? (
                                                    <img src={media.file_url} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full bg-gray-800 flex items-center justify-center text-white text-xs">
                                                        Vídeo
                                                    </div>
                                                )}
                                                {selectedMediaIds.includes(media.id) && (
                                                    <div className="absolute inset-0 bg-blue-500 bg-opacity-20 flex items-center justify-center">
                                                        <span className="bg-blue-500 text-white rounded-full p-1 text-xs">✓</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {availableMedia.length === 0 && (
                                            <div className="col-span-4 text-center text-xs text-gray-500 py-4">
                                                Nenhuma mídia disponível. Faça upload na aba "Mídia".
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Rodapé */}
                        <div className="flex justify-between items-center pt-4 border-t">
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="is_active"
                                    checked={formData.is_active}
                                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                />
                                <label htmlFor="is_active" className="ml-2 text-sm font-medium text-gray-700">
                                    Produto Ativo
                                </label>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-50"
                                >
                                    {saving ? 'Salvando...' : 'Salvar Produto'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default ProductModal;
