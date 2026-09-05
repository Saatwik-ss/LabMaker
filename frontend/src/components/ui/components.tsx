import React from 'react';

export const Button = ({ children, variant = 'primary', className = '', ...props }: any) => {
  const base = "px-4 py-2 rounded-md font-medium transition-colors focus:outline-none";
  const variants: Record<string, string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-gray-700 text-white hover:bg-gray-600",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "bg-transparent text-gray-300 hover:text-white hover:bg-gray-800"
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

export const Card = ({ children, className = '', ...props }: any) => (
  <div className={`bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-sm ${className}`} {...props}>
    {children}
  </div>
);

export const Badge = ({ children, variant = 'default', className = '' }: any) => {
  const variants: Record<string, string> = {
    default: "bg-gray-800 text-gray-300",
    success: "bg-green-900 text-green-300",
    error: "bg-red-900 text-red-300",
    warning: "bg-amber-900 text-amber-300",
    info: "bg-blue-900 text-blue-300",
  };
  return (
    <span className={`px-2 py-1 text-xs rounded-full font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

export const Spinner = ({ size = 'md' }: any) => {
  const sizes: Record<string, string> = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12"
  };
  return (
    <div className={`animate-spin rounded-full border-b-2 border-blue-500 ${sizes[size]}`}></div>
  );
};

export const Modal = ({ isOpen, onClose, title, children }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-lg w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
};

export const Toast = ({ message, type, onClose }: any) => {
  const types: Record<string, string> = {
    success: 'border-green-500 bg-green-900/50 text-green-100',
    error: 'border-red-500 bg-red-900/50 text-red-100',
    info: 'border-blue-500 bg-blue-900/50 text-blue-100'
  };

  return (
    <div className={`flex items-center justify-between p-4 mb-2 border rounded-md shadow-lg backdrop-blur-sm ${types[type]} min-w-[300px]`}>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-4 hover:opacity-75 focus:outline-none">&times;</button>
    </div>
  );
};
