import React from 'react';
export const Toast = ({ message, type, onClose }: any) => {
  const types: Record<string, string> = {
    success: 'border-green-500 bg-green-900/80 text-green-100',
    error: 'border-red-500 bg-red-900/80 text-red-100',
    info: 'border-blue-500 bg-blue-900/80 text-blue-100'
  };
  return (
    <div className={`flex items-center justify-between p-4 mb-3 border rounded-md shadow-lg backdrop-blur-md ${types[type]} min-w-[320px] transform transition-all duration-300 translate-y-0 opacity-100`}>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-4 hover:opacity-75 focus:outline-none">&times;</button>
    </div>
  );
};
