import React, { useRef, useState } from 'react';
import { Upload, Sparkles, FileText, Zap } from 'lucide-react';

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
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Playful gradient background */}
      <div className="absolute inset-0 gradient-playful" />

      {/* Animated background shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse [animation-delay:1s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Navigation */}
        <nav className="flex items-center justify-between px-6 md:px-8 py-5 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-primary/25 transition-transform duration-200 group-hover:scale-105">
                L
              </div>
              <div className="absolute -inset-1 bg-gradient-to-br from-primary to-accent rounded-xl opacity-0 group-hover:opacity-20 blur transition-opacity duration-200" />
            </div>
            <span className="text-xl font-bold text-foreground tracking-tight">Lumina</span>
          </div>
          <button className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary rounded-xl transition-all duration-200 cursor-pointer">
            Sign In
          </button>
        </nav>

        {/* Hero Content */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 md:py-12 text-center max-w-5xl mx-auto w-full">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 dark:bg-primary/20 rounded-full mb-8 border border-primary/20">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">AI-Powered PDF Experience</span>
          </div>

          <div className="space-y-6 mb-12">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-foreground tracking-tight leading-[1.1]">
              Documents that
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_auto] animate-[gradient_3s_linear_infinite]">
                come alive.
              </span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              A blazing-fast, beautifully crafted PDF viewer.
              <br className="hidden sm:block" />
              Drop your file and experience the difference.
            </p>
          </div>

          {/* Upload Zone */}
          <div
            className={`
              w-full max-w-xl relative group cursor-pointer
              transition-all duration-300
              ${isDragging ? 'scale-[1.02]' : 'hover:scale-[1.01]'}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            {/* Glow effect */}
            <div
              className={`
                absolute -inset-1 rounded-3xl bg-gradient-to-r from-primary via-accent to-primary opacity-0 blur-xl transition-opacity duration-300
                ${isDragging ? 'opacity-40' : 'group-hover:opacity-20'}
              `}
            />

            {/* Card */}
            <div
              className={`
                relative bg-card/80 dark:bg-card/60 backdrop-blur-xl rounded-2xl p-8 md:p-10 
                border-2 border-dashed transition-all duration-300
                shadow-xl shadow-primary/5
                ${isDragging ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-border hover:border-primary/50'}
              `}
            >
              <input
                type="file"
                ref={inputRef}
                onChange={handleInputChange}
                accept="application/pdf"
                className="hidden"
              />

              <div className="flex flex-col items-center space-y-5">
                <div
                  className={`
                    w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300
                    ${isDragging ? 'bg-primary text-white scale-110' : 'bg-secondary text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'}
                  `}
                >
                  <Upload className="w-9 h-9" strokeWidth={1.5} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-foreground">
                    {isDragging ? 'Release to upload' : 'Drop your PDF here'}
                  </h3>
                  <p className="text-muted-foreground text-sm">or click to browse your files</p>
                </div>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto w-full">
            {[
              { icon: Zap, title: 'Lightning Fast', desc: 'WebAssembly powered' },
              { icon: FileText, title: 'Full Featured', desc: 'Annotate & highlight' },
              { icon: Sparkles, title: 'Beautiful UI', desc: 'Modern & intuitive' },
            ].map((feature) => (
              <div
                key={feature.title}
                className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-card/50 dark:bg-card/30 backdrop-blur-sm border border-border/50 hover:border-primary/30 hover:bg-card/80 transition-all duration-200 cursor-pointer"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="text-center">
                  <h4 className="font-semibold text-foreground text-sm">{feature.title}</h4>
                  <p className="text-muted-foreground text-xs mt-0.5">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* CSS for gradient animation */}
      <style>{`
        @keyframes gradient {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
        }
      `}</style>
    </div>
  );
};
