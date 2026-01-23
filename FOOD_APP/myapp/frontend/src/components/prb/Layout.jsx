import React from "react";

export default function Layout({ children }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900 transition-colors">
      <div className="bg-white dark:bg-gray-800 text-black dark:text-white p-8 space-y-6 rounded shadow-md max-w-md w-full text-center">
        {children}
      </div>
    </div>
  );
}