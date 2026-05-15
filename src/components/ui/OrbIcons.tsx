import React from 'react';

const OrbBase = ({ color, glowing }: { color: string, glowing?: boolean }) => (
  <>
    <defs>
      <radialGradient id={`glow-${color.replace('#', '')}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={color} stopOpacity="1" />
        <stop offset="60%" stopColor={color} stopOpacity="0.4" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`core-${color.replace('#', '')}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
        <stop offset="40%" stopColor={color} stopOpacity="0.8" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="12" cy="12" r={glowing ? "10" : "8"} fill={`url(#glow-${color.replace('#', '')})`} className={glowing ? "animate-pulse" : ""} />
    <circle cx="12" cy="12" r="4" fill={`url(#core-${color.replace('#', '')})`} />
  </>
);

export const OrbHand: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
    <OrbBase color="#00FFFF" glowing={true} />
    {/* Abstract Hand lines mapping to orbital rings */}
    <circle cx="12" cy="12" r="11" fill="none" stroke="#00FFFF" strokeWidth="0.5" strokeDasharray="2 4" className="animate-spin-slow" />
    <circle cx="12" cy="12" r="9" fill="none" stroke="#ffffff" strokeWidth="0.5" strokeDasharray="1 6" className="animate-reverse-spin-slow" />
    <path d="M12 2 L12 6 M12 18 L12 22 M2 12 L6 12 M18 12 L22 12" stroke="#00FFFF" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

export const OrbMove: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
    <OrbBase color="#00FFFF" />
    <path d="M12 2 L9 5 M12 2 L15 5 M12 2 L12 8 M12 22 L9 19 M12 22 L15 19 M12 22 L12 16 M2 12 L5 9 M2 12 L5 15 M2 12 L8 12 M22 12 L19 9 M22 12 L19 15 M22 12 L16 12" stroke="#00FFFF" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="10" fill="none" stroke="#00FFFF" strokeWidth="0.2" opacity="0.5" />
  </svg>
);

export const OrbZoom: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
    <OrbBase color="#FF00FF" />
    <circle cx="12" cy="12" r="8" fill="none" stroke="#FF00FF" strokeWidth="1" strokeDasharray="2 2" className="animate-spin-slow" />
    <path d="M12 8 L12 16 M8 12 L16 12" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
