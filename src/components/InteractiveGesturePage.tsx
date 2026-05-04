import React, { useEffect, useState } from 'react';
import { Hand, Move, ZoomIn, ArrowLeft } from 'lucide-react';

export const InteractiveGesturePage: React.FC = React.memo(() => {
    const [hasInteracted, setHasInteracted] = useState(false);

    useEffect(() => {
        const handlePan = (e: any) => {
            const { type } = e.detail;
            if (type === 'panstart' || type === 'panmove') {
                if (!hasInteracted) setHasInteracted(true);
            }
        };

        window.addEventListener('hammer-pan', handlePan);
        return () => window.removeEventListener('hammer-pan', handlePan);
    }, [hasInteracted]);

    const returnToMainMenu = () => {
        if ((window as any).fullpage_api) {
            (window as any).fullpage_api.moveTo(1);
        }
    };

    return (
        <div className="flex flex-col items-center justify-between w-full h-full p-4 md:p-8 pointer-events-auto select-none safe-area-inset">
            
            {/* Top Navigation */}
            <div className="w-full max-w-5xl flex justify-start pt-safe mt-4 md:mt-8 z-50">
                <button 
                    onClick={returnToMainMenu}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-gray-300 hover:text-white hover:bg-white/10 backdrop-blur-md transition-all active:scale-95 shadow-[0_0_15px_rgba(0,255,255,0.1)]"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-xs md:text-sm font-bold tracking-widest uppercase">Main Menu</span>
                </button>
            </div>

            {/* iOS-like gesture guide - Persistent but minimized when interacting */}
            <div className={`transition-all duration-1000 ease-in-out flex flex-col items-center justify-center w-full max-w-sm mx-auto text-center z-40 ${hasInteracted ? 'scale-75 opacity-50 translate-y-20' : 'scale-100 opacity-100 space-y-6'}`}>
                
                {!hasInteracted && (
                    <div className="relative mb-6">
                        <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full animate-pulse z-0"></div>
                        <Hand className="w-16 h-16 text-cyan-400 relative z-10 animate-bounce" strokeWidth={1.5} />
                    </div>
                )}
                
                <div className={`transition-all duration-700 ${hasInteracted ? 'hidden' : 'block'}`}>
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-fuchsia-400 mb-2 font-mono tracking-tight">
                        INTERACTIVE SPACE
                    </h2>
                    <p className="text-gray-400 text-sm md:text-base mb-6">
                        Touch and drag to take manual control of the holographic engine. Fast swipe up or down to navigate. Double tap to zoom forward.
                    </p>
                </div>
                
                <div className={`flex flex-col gap-3 ${hasInteracted ? 'mt-auto pb-safe pointer-events-none' : ''}`}>
                    <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl px-6 py-3 backdrop-blur-md shadow-[0_0_20px_rgba(0,255,255,0.05)]">
                        <Move className="w-5 h-5 text-cyan-400" />
                        <span className="text-xs md:text-sm text-gray-300 font-mono tracking-wider">DRAG TO PAN</span>
                    </div>
                    
                    <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl px-6 py-3 backdrop-blur-md shadow-[0_0_20px_rgba(255,0,255,0.05)]">
                        <ZoomIn className="w-5 h-5 text-fuchsia-400" />
                        <span className="text-xs md:text-sm text-gray-300 font-mono tracking-wider">DOUBLE TAP TO ZOOM</span>
                    </div>
                </div>
            </div>
            
            {/* Spacer for bottom layout */}
            <div className="h-10"></div>
        </div>
    );
});
