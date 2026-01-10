import React from 'react';
import { Phone, Video, MoreVertical, Search, Paperclip, Mic, Send, Smile, ArrowLeft, Check, CheckCheck, Trash2, Play, Pause, Camera } from 'lucide-react';

export const IconPhone = () => <Phone className="w-6 h-6 text-white" strokeWidth={2} />;
export const IconVideo = () => <Video className="w-6 h-6 text-white" strokeWidth={2} />;
export const IconMore = () => <MoreVertical className="w-6 h-6 text-white" strokeWidth={2} />;
export const IconSearch = () => <Search className="w-6 h-6 text-[#54656f]" strokeWidth={2} />;
export const IconPaperclip = () => <Paperclip className="w-6 h-6 text-[#798288] transform -rotate-45" strokeWidth={2} />;
export const IconCamera = () => <Camera className="w-6 h-6 text-[#798288]" strokeWidth={2} />;
export const IconMic = () => <Mic className="w-6 h-6 text-[#54656f]" strokeWidth={2} />;
export const IconMicActive = () => <Mic className="w-6 h-6 text-white" strokeWidth={2} />;
export const IconSend = () => <Send className="w-5 h-5 text-white ml-0.5" strokeWidth={2} />;
export const IconSmile = () => <Smile className="w-6.5 h-6.5 text-[#798288]" strokeWidth={2} />;
export const IconBack = () => <ArrowLeft className="w-6 h-6 text-white" strokeWidth={2} />;
export const IconTrash = () => <Trash2 className="w-6 h-6 text-[#54656f]" strokeWidth={2} />;
export const IconPlay = () => <Play className="w-5 h-5 text-[#54656f] fill-current" strokeWidth={2} />;
export const IconPause = () => <Pause className="w-5 h-5 text-[#54656f] fill-current" strokeWidth={2} />;

export const IconStatusSent = () => <Check className="w-3.5 h-3.5 text-[#8696a0]" strokeWidth={2} />;
export const IconStatusDelivered = () => <CheckCheck className="w-3.5 h-3.5 text-[#8696a0]" strokeWidth={2} />;
export const IconStatusRead = () => <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" strokeWidth={2} />; // Blue checks