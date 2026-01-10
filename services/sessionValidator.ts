import { supabase } from './supabaseClient';

/**
 * Valida se uma sessão existe e está ativa no Supabase
 * @param sessionId - ID da sessão a ser validada
 * @returns true se a sessão é válida, false caso contrário
 */
export async function validateSession(sessionId: string): Promise<boolean> {
    try {
        const { data, error } = await supabase
            .from('sessions')
            .select('id, status')
            .eq('id', sessionId)
            .single();

        if (error || !data) {
            console.warn('❌ Sessão não encontrada no servidor:', sessionId);
            return false;
        }

        if (data.status !== 'active') {
            console.warn('⚠️ Sessão existe mas não está ativa:', data.status);
            return false;
        }

        console.log('✅ Sessão válida:', sessionId);
        return true;
    } catch (error) {
        console.error('🔥 Erro ao validar sessão:', error);
        return false;
    }
}

/**
 * Limpa dados de sessão corrompidos do localStorage
 */
export function clearCorruptedSession(): void {
    console.log('🧹 Limpando sessão corrompida do localStorage...');
    localStorage.removeItem('chat_session_id');
    // Limpar outros dados relacionados se necessário
    localStorage.removeItem('can_install_app');
}
