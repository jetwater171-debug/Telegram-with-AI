import React, { useState, useEffect, useRef } from 'react';
import ChatHeader from './ChatHeader';
import MessageBubble from './MessageBubble';
import InputArea from './InputArea';
import { sendMessageToGemini, initializeChat, resumeChatSession } from '../services/geminiService';
import { WiinPayService } from '../services/wiinpayService';
import { supabase } from '../services/supabaseClient';
import { Message, User } from '../types';

// Placeholder image for "Larissa"
const AVATAR_URL = "/lari-profile.jpg";

const LARISSA: User = {
    name: "Lari 💗",
    avatar: AVATAR_URL,
    status: "online"
};

const ChatPage: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [userLocation, setUserLocation] = useState<string>("São Paulo");
    const [isHighTicketDevice, setIsHighTicketDevice] = useState<boolean>(false);
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showInstallButton, setShowInstallButton] = useState(false);

    const getCurrentTime = () => {
        const now = new Date();
        return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    // Função robusta para tentar várias APIs de IP se uma falhar
    const fetchLocation = async (): Promise<string | null> => {
        // Tentativa 1: ipapi.co
        try {
            const res = await fetch('https://ipapi.co/json/');
            if (res.ok) {
                const data = await res.json();
                if (data.city) return `${data.city} - ${data.region_code || data.region}`;
            }
        } catch (e) {
            console.warn("⚠️ IP API 1 falhou, tentando próxima...");
        }

        // Tentativa 2: freeipapi.com
        try {
            const res = await fetch('https://freeipapi.com/api/json');
            if (res.ok) {
                const data = await res.json();
                if (data.cityName) return `${data.cityName} - ${data.regionName}`;
            }
        } catch (e) {
            console.warn("⚠️ IP API 2 falhou, tentando próxima...");
        }

        // Tentativa 3: ipwhois.app
        try {
            const res = await fetch('https://ipwhois.app/json/');
            if (res.ok) {
                const data = await res.json();
                if (data.city) return `${data.city} - ${data.region}`;
            }
        } catch (e) {
            console.warn("⚠️ IP API 3 falhou.");
        }

        return null;
    };

    // Detectar se é dispositivo High Ticket (iPhone/iPad)
    const detectDevice = (): boolean => {
        const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
        return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    };

    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                // remove data:audio/webm;base64, prefix
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const uploadAudioToSupabase = async (audioBlob: Blob): Promise<string | null> => {
        try {
            const fileName = `audio_${Date.now()}.webm`;
            const { data, error } = await supabase.storage
                .from('media')
                .upload(`audios/${fileName}`, audioBlob, {
                    contentType: audioBlob.type,
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) {
                console.error("Erro ao fazer upload do áudio:", error);
                return null;
            }

            const { data: publicUrlData } = supabase.storage
                .from('media')
                .getPublicUrl(`audios/${fileName}`);

            return publicUrlData.publicUrl;
        } catch (error) {
            console.error("Erro inesperado no upload:", error);
            return null;
        }
    };

    const handleSendMessage = async (text: string, audioBlob?: Blob) => {
        const newMessage: Message = {
            id: Date.now().toString(),
            text: text,
            sender: 'user',
            timestamp: getCurrentTime(),
            status: 'sent',
        };

        if (audioBlob) {
            // Create an object URL for previewing the audio locally
            newMessage.audioUrl = URL.createObjectURL(audioBlob);
            newMessage.audioMimeType = audioBlob.type;
        }

        setMessages(prev => [...prev, newMessage]);

        // Simulate "sent" -> "delivered" -> "read"
        setTimeout(() => {
            setMessages(prev => prev.map(m => m.id === newMessage.id ? { ...m, status: 'delivered' } : m));
        }, 1000);
        setTimeout(() => {
            setMessages(prev => prev.map(m => m.id === newMessage.id ? { ...m, status: 'read' } : m));
        }, 2500);

        setIsTyping(true);

        try {

            // Delay to simulate reading/thinking
            await new Promise(resolve => setTimeout(resolve, 1500));

            let aiResult;
            if (audioBlob) {
                const base64Audio = await blobToBase64(audioBlob);
                // Upload para Supabase para persistência
                const audioUrl = await uploadAudioToSupabase(audioBlob);

                // Se falhar o upload, ainda enviamos para a IA processar, mas não terá URL persistente
                aiResult = await sendMessageToGemini(text, { data: base64Audio, mimeType: audioBlob.type }, audioUrl || undefined);
            } else {
                aiResult = await sendMessageToGemini(text);
            }

            // 🧠 DEBUG NO CONSOLE: Veja o que a Larissa está pensando
            console.group("🧠 Larissa AI Brain");
            console.log("📍 Contexto Local:", userLocation); // Note: This might show initial state on first run
            console.log("📱 High Ticket Device:", isHighTicketDevice);
            console.log("💭 Pensamento:", aiResult.internal_thought);
            console.log("📊 Estado Funil:", aiResult.current_state);
            console.log("🏷️ Lead Type:", aiResult.lead_classification);
            console.log("🎬 Ação:", aiResult.action);
            console.groupEnd();

            const responseMessages = aiResult.messages || ["..."];

            // === SISTEMA DE DELAY INTELIGENTE ===
            // Simula comportamento humano realista ao digitar

            /**
             * Calcula o tempo de "leitura" da mensagem do usuário
             * Humanos leem ~200-250 palavras por minuto
             */
            const calculateReadingTime = (text: string): number => {
                const words = text.trim().split(/\s+/).length;
                const readingSpeed = 250; // palavras por minuto
                const baseReadingTimeMs = (words / readingSpeed) * 60 * 1000;

                // Adiciona tempo mínimo e máximo para parecer natural
                const minReadingTime = 800;
                const maxReadingTime = 3000;

                return Math.min(Math.max(baseReadingTimeMs, minReadingTime), maxReadingTime);
            };

            /**
             * Calcula o tempo de digitação baseado no tamanho da mensagem
             * Considera velocidade humana de ~40-60 caracteres por minuto (variável)
             */
            const calculateTypingTime = (text: string): number => {
                const charCount = text.length;

                // Velocidade de digitação: ~50 caracteres por minuto (média)
                // Convertendo para ms por caractere
                const baseCharsPerSecond = 3.5; // ~50 CPM / 60 segundos ≈ 0.83, mas vamos fazer mais lento: ~210 CPM / 60
                const msPerChar = 1000 / baseCharsPerSecond;

                // Tempo base de digitação
                let typingTime = charCount * msPerChar;

                // Adiciona variação aleatória de ±20% para parecer humano
                const variance = 0.2;
                const randomFactor = 1 + (Math.random() * variance * 2 - variance);
                typingTime *= randomFactor;

                // Adiciona pausas para "pensar" em mensagens longas
                if (charCount > 50) {
                    typingTime += Math.random() * 800 + 400; // 400-1200ms de pausa
                }

                // Tempo mínimo e máximo
                const minTypingTime = 1000;
                const maxTypingTime = 8000;

                return Math.min(Math.max(typingTime, minTypingTime), maxTypingTime);
            };

            /**
             * Calcula pausa entre mensagens múltiplas
             * Simula o tempo que leva para pensar na próxima resposta
             */
            const calculatePauseBetweenMessages = (): number => {
                // Pausa aleatória entre 500ms e 1500ms
                return Math.random() * 1000 + 500;
            };

            // Loop para enviar múltiplas mensagens em sequência
            for (let i = 0; i < responseMessages.length; i++) {
                const msgText = responseMessages[i];

                // Primeira mensagem: simula tempo de leitura da mensagem do usuário
                if (i === 0) {
                    const readingTime = calculateReadingTime(text);
                    await new Promise(resolve => setTimeout(resolve, readingTime));
                }

                // Mostra animação de digitando antes de cada mensagem
                setIsTyping(true);

                // Simula tempo de digitação inteligente baseado no tamanho da mensagem
                const typingTime = calculateTypingTime(msgText);
                await new Promise(resolve => setTimeout(resolve, typingTime));

                const botMessage: Message = {
                    id: (Date.now() + i).toString(),
                    text: msgText,
                    sender: 'bot',
                    timestamp: getCurrentTime()
                };

                // Se for a última mensagem, verifica se tem ação de mídia
                if (i === responseMessages.length - 1) {
                    if (aiResult.action === 'send_photo_preview') {
                        botMessage.mediaType = 'image';
                        botMessage.isBlur = true;
                    } else if (['send_shower_photo', 'send_lingerie_photo', 'send_wet_finger_photo'].includes(aiResult.action)) {
                        botMessage.mediaType = 'image';
                        botMessage.isBlur = true; // Fotos de gatilho geralmente são borradas inicialmente ou não? O user não especificou, mas vou deixar true por padrão de "preview" ou false se for pra ver direto.
                        // O user disse "posso ver?" -> "manda foto". Geralmente é pra ver.
                        // Vou deixar isBlur = false para essas fotos específicas pois são "gatilhos" enviados explicitamente.
                        botMessage.isBlur = false;
                        botMessage.mediaUrl = aiResult.media_url;
                    } else if (aiResult.action === 'send_video_preview') {
                        botMessage.mediaType = 'video';
                        botMessage.isBlur = false;
                        botMessage.mediaUrl = aiResult.media_url;
                    } else if (aiResult.action === 'generate_pix_payment' && aiResult.payment_details) {
                        try {
                            // Simula um pequeno delay de "gerando cobrança..."
                            await new Promise(resolve => setTimeout(resolve, 1000));

                            const payment = await WiinPayService.createPayment({
                                value: aiResult.payment_details.value,
                                name: aiResult.extracted_user_name || "Cliente Anônimo",
                                email: "cliente@chat.com", // Placeholder, idealmente pediria o email
                                description: aiResult.payment_details.description,
                                webhook_url: "https://seusite.com/webhook"
                            });

                            const paymentData = {
                                pixCopiaCola: payment.pixCopiaCola || payment.qr_code,
                                qrCode: payment.qrCode || payment.qr_code,
                                value: aiResult.payment_details.value,
                                paymentId: payment.paymentId
                            };

                            botMessage.paymentData = paymentData;

                            // PERSISTÊNCIA: Salvar paymentData no Supabase
                            // O ID da mensagem no banco veio anexado ao aiResult (hackzinho)
                            const dbMessageId = (aiResult as any).dbMessageId;
                            if (dbMessageId) {
                                console.log("💾 Salvando Pix no banco para msg:", dbMessageId);
                                import('../services/supabaseClient').then(({ supabase }) => {
                                    supabase.from('messages')
                                        .update({ payment_data: paymentData })
                                        .eq('id', dbMessageId)
                                        .then(({ error }) => {
                                            if (error) console.error("Erro ao salvar Pix no banco:", error);
                                        });
                                });
                            }

                        } catch (e) {
                            console.error("Erro ao gerar Pix:", e);
                            botMessage.text += "\n⚠️ (Ops, deu erro no banco aqui amor... tenta pedir de novo?)";
                        }
                    } else if (aiResult.action === 'request_app_install') {
                        setShowInstallButton(true);
                        localStorage.setItem('can_install_app', 'true');
                    }
                }

                setIsTyping(false);
                setMessages(prev => [...prev, botMessage]);

                // Pausa inteligente entre mensagens múltiplas
                if (i < responseMessages.length - 1) {
                    const pauseTime = calculatePauseBetweenMessages();
                    await new Promise(resolve => setTimeout(resolve, pauseTime));
                }
            }

        } catch (error) {
            console.error("Failed to get response", error);
            setIsTyping(false);
        }
    };

    const initializationRef = useRef(false);

    useEffect(() => {
        const initApp = async () => {
            if (initializationRef.current) return;
            initializationRef.current = true;

            try {
                const isIOS = detectDevice();
                setIsHighTicketDevice(isIOS);

                // 1. Tentar recuperar sessão EXISTENTE (já validada pelo SessionRedirect)
                const savedSessionId = localStorage.getItem('chat_session_id');

                if (savedSessionId) {
                    console.log("🔄 Recuperando sessão validada:", savedSessionId);
                    const { success, messages: history } = await resumeChatSession(savedSessionId);

                    if (success) {
                        console.log("✅ Sessão recuperada com sucesso!");

                        const formattedMessages: Message[] = history.map(m => ({
                            id: m.id,
                            text: m.content,
                            sender: m.sender === 'user' ? 'user' : 'bot',
                            timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            status: 'read',
                            mediaType: m.media_type === 'image' ? 'image' : m.media_type === 'video' ? 'video' : m.media_type === 'audio' ? 'audio' : undefined,
                            mediaUrl: m.media_url,
                            audioUrl: m.media_type === 'audio' ? m.media_url : undefined,
                            isBlur: m.media_type === 'image' && m.media_url !== "/lari-profile.jpg",
                            paymentData: m.payment_data
                        }));
                        setMessages(formattedMessages);

                        fetchLocation().then(city => {
                            if (city) setUserLocation(city);
                        });

                        return; // Sessão ok
                    }

                    // Se chegou aqui, a sessão falhou mesmo após validação
                    // Isso não deveria acontecer, mas vamos limpar e criar nova
                    console.warn("⚠️ Sessão falhou após validação. Criando nova...");
                    localStorage.removeItem('chat_session_id');
                }

                // 2. Criação de NOVA Sessão
                console.log("🌍 Criando nova sessão...");
                let city = "São Paulo";

                const detectedLocation = await fetchLocation();
                if (detectedLocation) {
                    city = detectedLocation;
                }
                setUserLocation(city);

                const newSessionId = await initializeChat(city, isIOS);
                if (newSessionId) {
                    localStorage.setItem('chat_session_id', newSessionId);
                    console.log("✨ Nova sessão criada e salva:", newSessionId);

                    setTimeout(() => {
                        handleSendMessage("Oiii Lari tudo bem?");
                    }, 500);
                } else {
                    console.error("🚨 FALHA CRÍTICA: Não foi possível criar uma nova sessão no Supabase.");
                }

            } catch (error) {
                console.error("💥 Erro fatal no initApp:", error);
            }
        };

        initApp();

        // Check if user previously unlocked the install button
        if (localStorage.getItem('can_install_app') === 'true') {
            setShowInstallButton(true);
        }
    }, []);

    // Real-time subscription for new messages (especially from admin)
    useEffect(() => {
        const sessionId = localStorage.getItem('chat_session_id');
        if (!sessionId) {
            console.warn('⚠️ No session ID found, skipping Realtime setup');
            return;
        }

        console.log('📡 Setting up Realtime subscription for session:', sessionId);
        console.log('📡 Supabase URL:', import.meta.env.VITE_SUPABASE_URL);

        // Subscribe to new messages in this session
        const channelName = `messages:${sessionId}`;
        const subscription = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `session_id=eq.${sessionId}`
                },
                (payload) => {
                    console.log('📨 New message received via Realtime:', payload);
                    const newMsg = payload.new as any;

                    // Only add admin messages (user messages are already added locally)
                    if (newMsg.sender === 'admin') {
                        console.log('✅ Admin message detected, adding to UI');
                        const formattedMessage: Message = {
                            id: newMsg.id,
                            text: newMsg.content,
                            sender: 'bot', // Display admin messages as bot messages
                            timestamp: new Date(newMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            status: 'read',
                            mediaType: newMsg.media_type === 'image' ? 'image' : newMsg.media_type === 'video' ? 'video' : newMsg.media_type === 'audio' ? 'audio' : undefined,
                            mediaUrl: newMsg.media_url,
                            audioUrl: newMsg.media_type === 'audio' ? newMsg.media_url : undefined,
                            isBlur: newMsg.media_type === 'image' && newMsg.media_url !== "/lari-profile.jpg",
                            paymentData: newMsg.payment_data
                        };

                        setMessages(prev => {
                            // Check if message already exists (avoid duplicates)
                            if (prev.some(m => m.id === newMsg.id)) {
                                console.log('⚠️ Message already exists, skipping duplicate');
                                return prev;
                            }
                            console.log('✅ Adding new admin message to state');
                            return [...prev, formattedMessage];
                        });
                    } else {
                        console.log('ℹ️ Non-admin message, skipping (sender:', newMsg.sender, ')');
                    }
                }
            )
            .subscribe((status, err) => {
                console.log('📡 Realtime subscription status:', status);
                if (err) {
                    console.error('❌ Realtime subscription error:', err);
                }
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Successfully subscribed to Realtime channel:', channelName);
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('❌ Channel error - Realtime may not be enabled in Supabase');
                } else if (status === 'TIMED_OUT') {
                    console.error('⏱️ Subscription timed out');
                } else if (status === 'CLOSED') {
                    console.warn('🔌 Channel closed');
                }
            });

        // Fallback: Poll for new messages every 3 seconds if Realtime fails
        let pollInterval: NodeJS.Timeout;
        setTimeout(() => {
            // Check if subscription is actually working after 5 seconds
            const channel = supabase.getChannels().find(ch => ch.topic === channelName);
            if (!channel || channel.state !== 'joined') {
                console.warn('⚠️ Realtime not working, falling back to polling');

                let lastMessageId: string | null = null;
                pollInterval = setInterval(async () => {
                    try {
                        const { data, error } = await supabase
                            .from('messages')
                            .select('*')
                            .eq('session_id', sessionId)
                            .eq('sender', 'admin')
                            .order('created_at', { ascending: false })
                            .limit(1);

                        if (!error && data && data.length > 0) {
                            const latestMsg = data[0];
                            if (latestMsg.id !== lastMessageId) {
                                lastMessageId = latestMsg.id;
                                console.log('📨 New admin message found via polling');

                                const formattedMessage: Message = {
                                    id: latestMsg.id,
                                    text: latestMsg.content,
                                    sender: 'bot',
                                    timestamp: new Date(latestMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                    status: 'read',
                                    mediaType: latestMsg.media_type === 'image' ? 'image' : latestMsg.media_type === 'video' ? 'video' : latestMsg.media_type === 'audio' ? 'audio' : undefined,
                                    mediaUrl: latestMsg.media_url,
                                    audioUrl: latestMsg.media_type === 'audio' ? latestMsg.media_url : undefined,
                                    isBlur: latestMsg.media_type === 'image' && latestMsg.media_url !== "/lari-profile.jpg",
                                    paymentData: latestMsg.payment_data
                                };

                                setMessages(prev => {
                                    if (prev.some(m => m.id === latestMsg.id)) return prev;
                                    return [...prev, formattedMessage];
                                });
                            }
                        }
                    } catch (e) {
                        console.error('❌ Error polling for messages:', e);
                    }
                }, 3000);
            }
        }, 5000);

        // Cleanup subscription on unmount
        return () => {
            console.log('📡 Cleaning up Realtime subscription');
            if (pollInterval) {
                clearInterval(pollInterval);
                console.log('🛑 Stopped polling fallback');
            }
            supabase.removeChannel(subscription);
        };
    }, []);

    useEffect(() => {
        // Register Service Worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/service-worker.js')
                    .then(registration => {
                        console.log('SW registered: ', registration);
                    })
                    .catch(registrationError => {
                        console.log('SW registration failed: ', registrationError);
                    });
            });
        }

        // Handle Install Prompt
        const handleBeforeInstallPrompt = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
            setDeferredPrompt(null);
            setShowInstallButton(false);

            // Request Notification Permission
            if ('Notification' in window) {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        console.log('Notification permission granted.');
                        // Here we would subscribe the user to push notifications
                        // navigator.serviceWorker.ready.then(registration => { ... })
                    }
                });
            }
        }
    };

    return (
        <div className="flex justify-center items-center h-[100dvh] bg-[#d1d7db] min-w-[320px] overflow-hidden">
            {/* App Container - Full width/height for mobile feel */}
            <div className="w-full h-full bg-[#efe7dd] relative overflow-hidden flex flex-col shadow-none md:max-w-md md:h-[90vh] md:rounded-[30px] md:border-4 md:border-gray-800 md:shadow-2xl">

                {/* Header */}
                <ChatHeader user={LARISSA} />

                {/* Chat Background & Area */}
                <div
                    className="flex-1 overflow-y-auto relative custom-scrollbar"
                    style={{
                        backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')",
                        backgroundRepeat: 'repeat',
                        backgroundSize: '400px',
                        backgroundColor: '#efe7dd'
                    }}
                >
                    {/* Overlay to dim the background pattern */}
                    <div className="absolute inset-0 bg-[#efe7dd] opacity-40 pointer-events-none"></div>

                    <div className="relative z-10 py-4 flex flex-col min-h-full">
                        {/* Encryption Notice */}
                        <div className="flex justify-center mb-6 px-4">
                            <div className="bg-[#FFEECD] text-[#54656f] text-[12.5px] px-3 py-1.5 rounded-lg shadow-sm text-center max-w-[90%]">
                                <span className="flex items-center justify-center gap-1">
                                    🔒 As mensagens e as chamadas são protegidas com criptografia de ponta a ponta.
                                </span>
                            </div>
                        </div>

                        {messages.map((msg) => (
                            <MessageBubble key={msg.id} message={msg} />
                        ))}

                        {isTyping && (
                            <div className="flex w-full mb-1 justify-start px-[5%] py-1">
                                <div className="bg-white rounded-lg rounded-tl-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] px-4 py-3 flex items-center space-x-1 w-fit">
                                    <div className="w-2 h-2 bg-[#b4b4b4] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                    <div className="w-2 h-2 bg-[#b4b4b4] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                    <div className="w-2 h-2 bg-[#b4b4b4] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Footer/Input */}
                <InputArea onSendMessage={handleSendMessage} />



                {/* Install App Button */}
                {showInstallButton && deferredPrompt && (
                    <div className="absolute top-20 right-4 z-50 animate-bounce">
                        <button
                            onClick={handleInstallClick}
                            className="bg-[#008069] text-white px-4 py-2 rounded-full shadow-lg font-bold flex items-center gap-2 hover:bg-[#006d59] transition-colors"
                        >
                            <span>📲 Instalar App</span>
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
};

export default ChatPage;
