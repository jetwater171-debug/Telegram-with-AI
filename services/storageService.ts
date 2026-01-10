import { supabase } from './supabaseClient';

/**
 * Serviço para gerenciar upload e armazenamento de arquivos no Supabase Storage
 */

const BUCKET_NAME = 'media';

export const StorageService = {
    /**
     * Upload de arquivo para o Supabase Storage
     */
    async uploadFile(file: File, folder: 'previews' | 'content' = 'previews'): Promise<string> {
        const fileExt = file.name.split('.').pop();
        const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Upload error:', error);
            throw new Error(`Erro ao fazer upload: ${error.message}`);
        }

        // Retorna a URL pública do arquivo
        const { data: { publicUrl } } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(fileName);

        return publicUrl;
    },

    /**
     * Deletar arquivo do storage
     */
    async deleteFile(fileUrl: string): Promise<void> {
        // Extrai o caminho do arquivo da URL
        const urlParts = fileUrl.split(`${BUCKET_NAME}/`);
        if (urlParts.length < 2) {
            throw new Error('URL inválida');
        }
        const filePath = urlParts[1];

        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([filePath]);

        if (error) {
            console.error('Delete error:', error);
            throw new Error(`Erro ao deletar arquivo: ${error.message}`);
        }
    },

    /**
     * Listar arquivos de uma pasta
     */
    async listFiles(folder: string = ''): Promise<any[]> {
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .list(folder);

        if (error) {
            console.error('List error:', error);
            throw new Error(`Erro ao listar arquivos: ${error.message}`);
        }

        return data || [];
    }
};
