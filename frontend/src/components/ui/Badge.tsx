import React from 'react';
export const Badge = ({ children, variant = 'default', className = '' }: any) => {
  const variants: Record<string, string> = {
    default: "bg-gray-800 text-gray-300",
    success: "bg-green-900 text-green-300",
    error: "bg-red-900 text-red-300",
    warning: "bg-amber-900 text-amber-300",
    info: "bg-blue-900 text-blue-300",
  };
  return <span className={`px-2 py-1 text-xs rounded-full font-medium ${variants[variant]} ${className}`}>{children}</span>;
};
