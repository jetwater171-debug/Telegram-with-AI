import React, { useState, useRef, useEffect } from 'react';
import { IconSmile, IconPaperclip, IconMic, IconSend, IconTrash, IconMicActive, IconCamera } from './Icons';

interface InputAreaProps {
  onSendMessage: (text: string, audio?: Blob) => void;
  defaultText?: string;
}

const InputArea: React.FC<InputAreaProps> = ({ onSendMessage, defaultText = '' }) => {
  const [text, setText] = useState(defaultText);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      // Reset height to auto to get the correct scrollHeight
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 120)}px`;
    }
  }, [text]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  };

  const stopRecording = () => {
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop()); // Stop stream
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setIsRecording(false);
    }
  };

  const cancelRecording = () => {
    stopRecording();
    // Clear chunks to prevent sending
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingTime(0);
  };

  const finishRecordingAndSend = () => {
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && isRecording) {
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        onSendMessage('', audioBlob);
        setRecordingTime(0);
      };
      stopRecording();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (text.trim()) {
      onSendMessage(text);
      setText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.focus();
      }
    }
  };

  // Recording UI
  if (isRecording) {
    return (
      <div className="bg-transparent px-1 py-1 flex items-end w-full z-20 flex-shrink-0 relative mb-1">
        <div className="flex-1 bg-white rounded-[26px] min-h-[50px] flex items-center px-4 shadow-sm border border-black/5 mx-1 animate-pulse">
          <div className="flex items-center gap-3 w-full">
            <button onClick={cancelRecording} className="p-2 text-red-500">
              <IconTrash />
            </button>
            <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-[#54656f] text-lg font-medium flex-1">
              {formatTime(recordingTime)}
            </span>
            <span className="text-[#54656f] text-sm animate-pulse mr-2">Gravando...</span>
          </div>
        </div>

        <button
          onClick={finishRecordingAndSend}
          className="bg-[#008069] rounded-full w-[48px] h-[48px] flex items-center justify-center shadow-lg hover:bg-[#00705a] transition-colors mb-[1px] mr-1"
        >
          <IconSend />
        </button>
      </div>
    );
  }

  // Normal UI - Mobile Style
  return (
    <div className="bg-transparent w-full min-h-[60px] flex items-end px-1 pb-1.5 pt-1 z-20 relative">
      <div className="flex-1 bg-white rounded-[24px] min-h-[48px] flex items-end shadow-sm mx-1.5 mb-[1px] relative">
        <div className="flex items-end h-full pb-[11px] pl-3">
          <button className="text-[#798288] active:text-[#54656f]">
            <IconSmile />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Mensagem"
          className="flex-1 bg-transparent text-[#111b21] text-[16px] px-3 py-[12px] focus:outline-none resize-none overflow-y-auto max-h-[120px] leading-[22px] min-h-[48px]"
          rows={1}
        />

        <div className="flex items-end h-full pb-[11px] pr-3 gap-4">
          <button className="text-[#798288] active:text-[#54656f] rotate-45">
            <IconPaperclip />
          </button>
          {!text.trim() && (
            <button className="text-[#798288] active:text-[#54656f]">
              <IconCamera />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center w-[48px] h-[48px] mb-[1px] mr-1 flex-shrink-0">
        {text.trim() ? (
          <button
            onClick={handleSend}
            className="bg-[#008069] rounded-full w-[48px] h-[48px] flex items-center justify-center shadow-lg hover:bg-[#00705a] transition-colors"
          >
            <IconSend />
          </button>
        ) : (
          <button
            onClick={startRecording}
            className="bg-[#008069] rounded-full w-[48px] h-[48px] flex items-center justify-center shadow-lg hover:bg-[#00705a] transition-colors"
          >
            <IconMicActive />
          </button>
        )}
      </div>
    </div>
  );
};

export default InputArea;