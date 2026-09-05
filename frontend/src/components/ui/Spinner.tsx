import React from 'react';
export const Spinner = ({ size = 'md' }: any) => {
  const sizes: Record<string, string> = { sm: "w-4 h-4", md: "w-8 h-8", lg: "w-12 h-12" };
  return <div className={`animate-spin rounded-full border-b-2 border-transparent border-t-blue-500 ${sizes[size]}`}></div>;
};
