import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

interface ILandingPageProps {
  onFileSelect: (file: File) => void;
}

export const LandingPage: React.FC<ILandingPageProps> = ({ onFileSelect }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf') {
        onFileSelect(file);
      } else {
        alert('Please upload a valid PDF file.');
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 flex flex-col font-sans">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-200">
            L
          </div>
          <span className="text-xl font-bold text-slate-800 tracking-tight">Lumina</span>
        </div>
        <button className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors">
          Sign In
        </button>
      </nav>

      {/* Hero Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center max-w-4xl mx-auto w-full">
        <div className="space-y-6 mb-12">
          <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.1]">
            The intelligent way to <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
              experience documents.
            </span>
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Fast, beautiful, and powered by AI. Drag and drop your PDF to get started, or explore
            our interactive demo.
          </p>
        </div>

        {/* Upload Zone */}
        <div
          className={`
                w-full max-w-xl bg-white rounded-2xl p-8 shadow-xl shadow-slate-200/50 border-2 border-dashed transition-all duration-300 cursor-pointer
                ${isDragging ? 'border-indigo-500 bg-indigo-50/50 scale-[1.02]' : 'border-slate-200 hover:border-indigo-300 hover:shadow-2xl'}
            `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            type="file"
            ref={inputRef}
            onChange={handleInputChange}
            accept="application/pdf"
            className="hidden"
          />

          <div className="flex flex-col items-center space-y-4">
            <div
              className={`
                    w-16 h-16 rounded-full flex items-center justify-center transition-colors
                    ${isDragging ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}
                `}
            >
              <Upload size={32} strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Drop your PDF here</h3>
              <p className="text-slate-500 text-sm mt-1">or click to browse local files</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
