import React, { useEffect, useState } from 'react';

export const FloatingStatsWidget: React.FC<{ workerCount: number; executionCount: number }> = ({ workerCount, executionCount }) => {
    const [fps, setFps] = useState(0);
    const [memory, setMemory] = useState<string>('N/A');
    const [isMinimized, setIsMinimized] = useState(false);

    useEffect(() => {
        let frameCount = 0;
        let lastTime = performance.now();
        let animationFrameId: number;

        const updateStats = () => {
            const now = performance.now();
            frameCount++;

            if (now - lastTime >= 1000) {
                setFps(Math.round((frameCount * 1000) / (now - lastTime)));
                frameCount = 0;
                lastTime = now;

                if ((performance as any).memory) {
                    const memInfo = (performance as any).memory;
                    setMemory(`${(memInfo.usedJSHeapSize / 1048576).toFixed(1)} MB`);
                } else {
                    setMemory('N/A');
                }
            }

            animationFrameId = requestAnimationFrame(updateStats);
        };

        animationFrameId = requestAnimationFrame(updateStats);

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <div className={`fixed top-4 right-4 z-50 bg-black/50 border border-cyan-500/50 shadow-[0_0_15px_rgba(0,255,255,0.2)] rounded-xl font-mono text-xs md:text-sm text-cyan-300 w-56 flex flex-col backdrop-blur-xl transition-all duration-300 ${isMinimized ? 'h-10 overflow-hidden' : 'p-4 gap-2 h-auto'}`}>
            <div className={`flex justify-between items-center ${isMinimized ? 'p-3' : 'border-b border-cyan-500/30 pb-1'}`}>
                <span className="text-fuchsia-400 font-bold uppercase tracking-wider select-none">Sys_Stats</span>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                    <button 
                        onClick={() => setIsMinimized(!isMinimized)} 
                        className="text-cyan-500 hover:text-cyan-300 pointer-events-auto px-1 focus:outline-none"
                    >
                        {isMinimized ? '+' : '-'}
                    </button>
                </div>
            </div>
            
            {!isMinimized && (
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2">
                    <span className="opacity-70">FPS:</span>
                    <span className={`text-right font-bold ${fps > 55 ? 'text-green-400' : fps > 30 ? 'text-yellow-400' : 'text-red-400'}`}>{fps}</span>
                    
                    <span className="opacity-70">Mem/Heap:</span>
                    <span className="text-right text-fuchsia-300">{memory}</span>
                    
                    <span className="opacity-70">Workers:</span>
                    <span className="text-right">{workerCount}</span>
                    
                    <span className="opacity-70">Exec Op:</span>
                    <span className="text-right">{executionCount}</span>
                </div>
            )}
        </div>
    );
};

