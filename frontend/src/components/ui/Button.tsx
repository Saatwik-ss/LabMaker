import React from 'react';
export const Button = ({ children, variant = 'primary', className = '', ...props }: any) => {
  const base = "px-4 py-2 rounded-md font-medium transition-colors focus:outline-none flex items-center justify-center gap-2";
  const variants: Record<string, string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-gray-700 text-white hover:bg-gray-600",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "bg-transparent text-gray-300 hover:text-white hover:bg-gray-800"
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>;
};
