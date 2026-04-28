import React, { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

interface TronVideoPlayerInternalImplementationProps {
  uniformResourceLocatorForVideoSource: string;
  componentUniqueIdentifierForDataFlow: string;
}

export const TronVideoPlayer: React.FC<TronVideoPlayerInternalImplementationProps> = ({ 
  uniformResourceLocatorForVideoSource, 
  componentUniqueIdentifierForDataFlow 
}) => {
  const containerReferenceTargetForVideoMounting = useRef<HTMLDivElement>(null);
  const playerInstanceReferenceNode = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Iterative Data Flow Description: Video Initialization Phase
    if (!playerInstanceReferenceNode.current && containerReferenceTargetForVideoMounting.current) {
        const videoElementConstructedDomNode = document.createElement("video-js");
        videoElementConstructedDomNode.classList.add(
            'vjs-fill', // Makes sure it fills the container
            'custom-glass-video'
        );
        containerReferenceTargetForVideoMounting.current.appendChild(videoElementConstructedDomNode);

        playerInstanceReferenceNode.current = videojs(videoElementConstructedDomNode, {
            autoplay: false,
            controls: false, // We use external custom controls below
            responsive: true,
            aspectRatio: '16:9',
            fluid: true,
            sources: [{
                src: uniformResourceLocatorForVideoSource,
                type: 'video/mp4'
            }]
        }, () => {
            const player = playerInstanceReferenceNode.current;
            player.on('play', () => setIsPlaying(true));
            player.on('pause', () => setIsPlaying(false));
            player.on('timeupdate', () => {
              if (player.duration()) {
                setProgress((player.currentTime() / player.duration()) * 100);
              }
            });
            console.log(`VideoJS Element successfully materialized in Sector ${componentUniqueIdentifierForDataFlow}`);
        });
    }

    return () => {
        // Garbage collection sequencing for memory leak prevention
        if (playerInstanceReferenceNode.current && !playerInstanceReferenceNode.current.isDisposed()) {
            playerInstanceReferenceNode.current.dispose();
            playerInstanceReferenceNode.current = null;
        }
    };
  }, [uniformResourceLocatorForVideoSource, componentUniqueIdentifierForDataFlow]);

  const togglePlay = () => {
    if (playerInstanceReferenceNode.current) {
      if (isPlaying) {
        playerInstanceReferenceNode.current.pause();
      } else {
        playerInstanceReferenceNode.current.play();
      }
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (playerInstanceReferenceNode.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      const newTime = pos * playerInstanceReferenceNode.current.duration();
      playerInstanceReferenceNode.current.currentTime(newTime);
    }
  };

  return (
    <div className="relative flex flex-col items-center w-full h-[75vh] max-w-5xl px-0 md:px-0 pointer-events-auto shadow-[0_8px_32px_0_rgba(31,38,135,0.37)] backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl overflow-hidden group mx-4 max-w-[calc(100%-2rem)] md:max-w-6xl">
      {/* iOS Liquid Glass Video Container */}
      <div className="absolute inset-0 w-full h-full bg-black/50 overflow-hidden">
        <div 
            data-vjs-player 
            ref={containerReferenceTargetForVideoMounting}
            className="w-full h-full [&>video]:object-cover" 
        />
      </div>

      {/* External Controls layered on top in liquid glass style - Thinner bar on mobile */}
      <div className="absolute bottom-2 md:bottom-6 left-1/2 -translate-x-1/2 flex flex-col w-[95%] max-w-xl backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl md:rounded-2xl p-2 md:p-4 gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 z-10 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
        {/* Progress Bar */}
        <div 
          className="w-full h-1 md:h-2 bg-white/20 rounded-full overflow-hidden cursor-pointer backdrop-blur-md"
          onClick={seek}
        >
          <div 
            className="h-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 rounded-full transition-all duration-100 ease-linear shadow-[0_0_10px_rgba(0,255,255,0.8)]"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        {/* Buttons */}
        <div className="flex justify-center items-center gap-4 md:gap-6 mt-1 md:mt-0">
          <button 
            className="w-8 h-8 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 border border-white/20 backdrop-blur-xl text-white shadow-[0_4px_10px_rgba(0,255,255,0.2)] transition-all transform hover:scale-105 active:scale-95"
            onClick={() => {
              if (playerInstanceReferenceNode.current) {
                playerInstanceReferenceNode.current.currentTime(playerInstanceReferenceNode.current.currentTime() - 10);
              }
            }}
          >
            <svg className="w-4 h-4 md:w-6 md:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon></svg>
          </button>

          <button 
            className="w-10 h-10 md:w-16 md:h-16 flex items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/80 to-fuchsia-500/80 hover:from-cyan-400 hover:to-fuchsia-400 border border-white/30 backdrop-blur-2xl text-white shadow-[0_0_20px_rgba(255,0,255,0.4)] transition-all transform hover:scale-105 active:scale-95"
            onClick={togglePlay}
          >
            {isPlaying ? (
              <svg className="w-5 h-5 md:w-8 md:h-8" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
            ) : (
              <svg className="w-5 h-5 md:w-8 md:h-8" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            )}
          </button>

          <button 
            className="w-8 h-8 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 border border-white/20 backdrop-blur-xl text-white shadow-[0_4px_10px_rgba(0,255,255,0.2)] transition-all transform hover:scale-105 active:scale-95"
            onClick={() => {
              if (playerInstanceReferenceNode.current) {
                playerInstanceReferenceNode.current.currentTime(playerInstanceReferenceNode.current.currentTime() + 10);
              }
            }}
          >
            <svg className="w-4 h-4 md:w-6 md:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon></svg>
          </button>
        </div>
      </div>
    </div>
  );
};
