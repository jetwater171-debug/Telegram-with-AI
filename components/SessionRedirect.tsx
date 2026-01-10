import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { validateSession, clearCorruptedSession } from '../services/sessionValidator';

/**
 * Página intermediária invisível que valida a sessão antes de carregar o chat.
 * Previne tela cinza ao detectar e limpar sessões inválidas automaticamente.
 */
const SessionRedirect: React.FC = () => {
    const navigate = useNavigate();
    const [isValidating, setIsValidating] = useState(true);

    useEffect(() => {
        const validateAndRedirect = async () => {
            try {
                console.log('🔍 SessionRedirect: Iniciando validação...');

                // Passo 1: Verificar se existe sessionId no localStorage
                const savedSessionId = localStorage.getItem('chat_session_id');

                if (!savedSessionId) {
                    console.log('📝 Nenhuma sessão salva. Redirecionando para criar nova...');
                    navigate('/chat', { replace: true });
                    return;
                }

                // Passo 2: Validar se a sessão ainda existe no servidor
                console.log('🔄 Validando sessão no servidor:', savedSessionId);
                const isValid = await validateSession(savedSessionId);

                if (!isValid) {
                    // Passo 3: Sessão inválida - limpar localStorage
                    console.log('❌ Sessão inválida detectada. Limpando localStorage...');
                    clearCorruptedSession();
                    console.log('✨ localStorage limpo. Redirecionando para criar nova sessão...');
                } else {
                    console.log('✅ Sessão válida! Redirecionando para o chat...');
                }

                // Passo 4: Redirecionar para o chat (com ou sem sessão válida)
                navigate('/chat', { replace: true });

            } catch (error) {
                console.error('💥 Erro crítico na validação:', error);
                // Em caso de erro, limpar tudo e tentar criar nova sessão
                clearCorruptedSession();
                navigate('/chat', { replace: true });
            } finally {
                setIsValidating(false);
            }
        };

        validateAndRedirect();
    }, [navigate]);

    // Loading mínimo e discreto
    return (
        <div className="flex justify-center items-center h-screen bg-[#d1d7db]">
            <div className="flex flex-col items-center gap-4">
                {/* Spinner discreto */}
                <div className="w-12 h-12 border-4 border-[#008069] border-t-transparent rounded-full animate-spin"></div>
                {isValidating && (
                    <p className="text-[#54656f] text-sm">Carregando...</p>
                )}
            </div>
        </div>
    );
};

export default SessionRedirect;
