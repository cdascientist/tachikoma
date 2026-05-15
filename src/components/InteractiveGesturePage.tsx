import React, { useEffect, useState } from 'react';
import { OrbHand, OrbMove, OrbZoom } from './ui/OrbIcons';

export const InteractiveGesturePage: React.FC = React.memo(() => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        let activityTimeout: any;

        const resetActivity = () => {
            setIsVisible(true);
            clearTimeout(activityTimeout);
            activityTimeout = setTimeout(() => setIsVisible(false), 3000); // 3 seconds timeout
        };

        window.addEventListener('mousemove', resetActivity);
        window.addEventListener('touchstart', resetActivity);
        window.addEventListener('hammer-pan', resetActivity);
        window.addEventListener('hammer-doubletap', resetActivity);
        
        resetActivity(); // Init

        return () => {
            window.removeEventListener('mousemove', resetActivity);
            window.removeEventListener('touchstart', resetActivity);
            window.removeEventListener('hammer-pan', resetActivity);
            window.removeEventListener('hammer-doubletap', resetActivity);
            clearTimeout(activityTimeout);
        };
    }, []);

    return (
        <div className="absolute inset-0 flex flex-col items-start justify-center w-full h-full p-6 md:p-12 pointer-events-none select-none z-20">
            {/* iOS-like gesture guide */}
            <div className={`transition-opacity duration-1000 ease-in-out flex flex-col items-start justify-center text-left max-w-sm ${isVisible ? 'opacity-90' : 'opacity-0'}`}>
                
                <div className="relative mb-6 ml-4">
                    <div className="absolute inset-0 bg-cyan-500/10 blur-xl rounded-full animate-pulse z-0"></div>
                    <OrbHand className="w-16 h-16 drop-shadow-[0_0_10px_#00FFFF] relative z-10" />
                </div>
                
                <div className="mb-6">
                    <h2 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-fuchsia-400 font-mono tracking-tight">
                        INTERACTIVE SPACE
                    </h2>
                </div>
                
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4 bg-black/40 border border-white/10 rounded-2xl px-5 py-3 backdrop-blur-md shadow-[0_0_20px_rgba(0,255,255,0.05)] w-full">
                        <OrbMove className="w-6 h-6" />
                        <span className="text-xs text-cyan-200 font-mono tracking-widest font-bold uppercase drop-shadow">Drag to Pan</span>
                    </div>
                    
                    <div className="flex items-center gap-4 bg-black/40 border border-white/10 rounded-2xl px-5 py-3 backdrop-blur-md shadow-[0_0_20px_rgba(255,0,255,0.05)] w-full">
                        <OrbZoom className="w-6 h-6" />
                        <span className="text-xs text-fuchsia-200 font-mono tracking-widest font-bold uppercase drop-shadow">Double Tap to Zoom</span>
                    </div>
                </div>
            </div>
        </div>
    );
});
