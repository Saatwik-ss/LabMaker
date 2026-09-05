import React from 'react';
export const Card = ({ children, className = '', ...props }: any) => (
  <div className={`bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-sm ${className}`} {...props}>
    {children}
  </div>
);
