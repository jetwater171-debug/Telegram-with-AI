import React, { useState, useRef, useEffect } from 'react';
import { Message } from '../types';
import { IconStatusSent, IconStatusDelivered, IconStatusRead, IconPlay, IconPause } from './Icons';

interface MessageBubbleProps {
  message: Message;
}

const AudioPlayer: React.FC<{ src: string, isMe: boolean }> = ({ src, isMe }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      setDuration(audio.duration);
    };

    const setAudioTime = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', setAudioData);
    audio.addEventListener('timeupdate', setAudioTime);
    audio.addEventListener('ended', handleEnded);
    audio.preload = "metadata";

    return () => {
      audio.removeEventListener('loadedmetadata', setAudioData);
      audio.removeEventListener('timeupdate', setAudioTime);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = Number(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  return (
    <div className="flex items-center gap-3 min-w-[200px] py-1">
      <audio ref={audioRef} src={src} />
      <button
        onClick={togglePlay}
        className="w-9 h-9 flex items-center justify-center bg-[#e9e9e9] rounded-full flex-shrink-0"
      >
        {isPlaying ? <IconPause /> : <IconPlay />}
      </button>
      <div className="flex flex-col flex-1 gap-1">
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 bg-[#d1d7db] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#008069] [&::-webkit-slider-thumb]:rounded-full"
        />
        <div className="flex justify-between text-[11px] text-[#667781] leading-none">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};

const MediaAttachment: React.FC<{ type: 'image' | 'video', isBlur?: boolean, src?: string }> = ({ type, isBlur, src }) => {
  // Imagens de placeholder para simular conteúdo da Larissa (Fallback)
  // Foto mais "selfie no espelho" vibe
  const imageFallback = "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=400&auto=format&fit=crop";
  // Video placeholder (frame)
  const videoFallback = "https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=400&auto=format&fit=crop";

  const mediaSrc = src || (type === 'image' ? imageFallback : videoFallback);

  return (
    <div className="mb-2 relative rounded-lg overflow-hidden max-w-[260px] cursor-pointer">
      <div className={`relative ${isBlur ? 'blur-[8px] scale-105' : ''} transition-all duration-500`}>
        {type === 'video' ? (
          <video
            src={mediaSrc}
            controls={!isBlur}
            playsInline
            preload="metadata"
            className="w-full h-auto object-cover aspect-[3/4]"
          />
        ) : (
          <img src={mediaSrc} alt="" className="w-full h-auto object-cover aspect-[3/4]" />
        )}
        {type === 'video' && isBlur && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
            <div className="w-10 h-10 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm">
              <IconPlay />
            </div>
          </div>
        )}
      </div>
      {isBlur && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/20">
          <span className="text-white font-medium text-shadow-sm text-xs bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-md flex items-center gap-1">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            Mídia Privada
          </span>
        </div>
      )}
    </div>
  );
};

const PixBubble: React.FC<{ paymentData: NonNullable<Message['paymentData']> }> = ({ paymentData }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(paymentData.pixCopiaCola || paymentData.qrCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-2 p-3 bg-[#dcf8c6] rounded-lg border border-[#34b7f1]/20">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 bg-[#00a884] rounded-full flex items-center justify-center text-white">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
        </div>
        <div>
          <p className="text-[11px] text-[#667781] font-normal">Pagamento Pix</p>
          <p className="text-[15px] font-semibold text-[#111b21]">R$ {paymentData.value.toFixed(2)}</p>
        </div>
      </div>

      <button
        onClick={handleCopy}
        className="w-full py-2.5 px-4 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-md text-[13px] font-medium transition-colors flex items-center justify-center gap-2"
      >
        {copied ? (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            Copiado!
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            Copiar código Pix
          </>
        )}
      </button>
    </div>
  );
};

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isMe = message.sender === 'user';

  const bgColor = isMe ? 'bg-[#d9fdd3]' : 'bg-white';
  const alignClass = isMe ? 'justify-end' : 'justify-start';
  const roundedClass = isMe ? 'rounded-tr-none' : 'rounded-tl-none';

  return (
    <div className={`flex w-full mb-1 ${alignClass} px-[5%] md:px-[7%] lg:px-[9%] py-1 group`}>
      <div
        className={`
          relative max-w-[85%] md:max-w-[65%] min-w-[80px]
          ${bgColor} rounded-lg shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] 
          text-[#111b21] text-[14.2px] leading-[19px] 
          px-2 pt-[6px] pb-2 flex flex-col
          ${roundedClass}
        `}
      >
        {isMe && (
          <span className="absolute -right-2 top-0 text-[#d9fdd3]">
            <svg viewBox="0 0 8 13" height="13" width="8" preserveAspectRatio="xMidYMid slice" version="1.1">
              <path opacity="0.13" d="M5.188,1H0v11.193l6.467-8.625 C7.526,2.156,6.958,1,5.188,1z"></path>
              <path fill="currentColor" d="M5.188,0H0v11.193l6.467-8.625C7.526,1.156,6.958,0,5.188,0z"></path>
            </svg>
          </span>
        )}

        {!isMe && (
          <span className="absolute -left-2 top-0 text-white">
            <svg viewBox="0 0 8 13" height="13" width="8" preserveAspectRatio="xMidYMid slice" version="1.1">
              <path opacity="0.13" d="M1.533,3.568L8,12.193V1H2.812 C1.042,1,0.474,2.156,1.533,3.568z"></path>
              <path fill="currentColor" d="M1.533,2.568L8,11.193V0L2.812,0C1.042,0,0.474,1.156,1.533,2.568z"></path>
            </svg>
          </span>
        )}

        <div className={message.audioUrl ? "" : "pr-2 break-words whitespace-pre-wrap"}>
          {message.mediaType && (message.mediaType === 'image' || message.mediaType === 'video') && (
            <MediaAttachment type={message.mediaType} isBlur={message.isBlur} src={message.mediaUrl} />
          )}

          {message.paymentData && (
            <PixBubble paymentData={message.paymentData} />
          )}

          {message.audioUrl ? (
            <AudioPlayer src={message.audioUrl} isMe={isMe} />
          ) : (
            message.text
          )}
          {!message.audioUrl && <span className="inline-block w-[70px] h-[0px]"></span>}
        </div>

        <div className="absolute bottom-1 right-2 flex items-center space-x-1 select-none">
          <span className="text-[11px] text-[#667781] font-normal">
            {message.timestamp}
          </span>
          {isMe && (
            <div className="flex items-center">
              {message.status === 'sent' && <IconStatusSent />}
              {message.status === 'delivered' && <IconStatusDelivered />}
              {message.status === 'read' && <IconStatusRead />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;