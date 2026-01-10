import React from 'react';
import { IconPhone, IconVideo, IconMore, IconBack } from './Icons';
import { User } from '../types';

interface ChatHeaderProps {
  user: User;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ user }) => {
  return (
    <div className="bg-[#008069] h-[60px] flex items-center px-2 shadow-md z-20 flex-shrink-0">
      <div className="flex items-center flex-1 overflow-hidden cursor-pointer">
        <button className="p-1 rounded-full active:bg-white/10 mr-1">
          <IconBack />
        </button>

        <div className="relative w-[38px] h-[38px] mr-2.5 flex-shrink-0">
          <img
            src={user.avatar}
            alt={user.name}
            className="w-full h-full rounded-full object-cover border-[1px] border-white/10"
          />
        </div>

        <div className="flex flex-col justify-center overflow-hidden flex-1">
          <h1 className="text-white font-medium text-[17px] leading-tight truncate">
            {user.name}
          </h1>
          <span className="text-white/80 text-[13px] leading-tight truncate">
            online
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-5 mr-2">
        <button className="opacity-95 active:opacity-100"><IconVideo /></button>
        <button className="opacity-95 active:opacity-100"><IconPhone /></button>
        <button className="opacity-95 active:opacity-100"><IconMore /></button>
      </div>
    </div>
  );
};

export default ChatHeader;