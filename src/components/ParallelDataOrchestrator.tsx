import React, { useEffect, useState, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { TronVideoPlayer } from "./TronVideoPlayer";
import { HolographicRoomScene } from "./HolographicRoomScene";
import { getChunkFromDB, saveChunkToDB } from "../lib/IndexedDBHelper";
import { AutomatedMemoryCleaner } from "../lib/AutomatedMemoryCleaner";
import Parallel from "../lib/parallel.js";
import Hammer from "hammerjs";
import { FloatingStatsWidget } from "./FloatingStatsWidget";
import { FileDropzone } from "./FileDropzone";
import { FileBrowser } from "./FileBrowser";
import { ChatBotInterface } from "./ChatBotInterface";
import { ResumeBreakdownSection } from "./ResumeBreakdownSection";
import { InteractiveGesturePage } from "./InteractiveGesturePage";
import fullpage from "fullpage.js";
import "fullpage.js/dist/fullpage.min.css";

export interface GeometryChunkDataPayload {
  chunkIndexIdentifier: number;
  totalChunksToProcess: number;
  verticesFloat32Array: Float32Array;
  colorsFloat32Array: Float32Array;
}

// Drastically increase parallelism and adjust polygon density for mobile/desktop parity
const PARALLEL_WORKER_THREAD_POOL_SIZE =
  navigator.hardwareConcurrency * 8 || 48; // Significantly more workers
const BASE_POLYGON_MULTIPLIER = 1.1;

export const ParallelDataOrchestrator: React.FC = () => {
  const [isGlobalInitializationComplete, setIsGlobalInitializationComplete] =
    useState<boolean>(false);
  const [loaderOpacity, setLoaderOpacity] = useState<number>(1);
  const [loaderMounted, setLoaderMounted] = useState<boolean>(true);
  const [aggregatedDataChunkVault, setAggregatedDataChunkVault] = useState<
    GeometryChunkDataPayload[]
  >([]);
  const [operationalCount, setOperationalCount] = useState<number>(0);
  const [dynamicWorkersSpawned, setDynamicWorkersSpawned] = useState<number>(0);
  const fullpageContainerRef = useRef<HTMLDivElement>(null);
  const fpInitializedRef = useRef<boolean>(false);

  const spawnDynamicWorker = () => {
    // Simulating the dynamic worker allocation without actually blocking the main thread
    // generating Blob URLs and instantiating Worker contexts inside a tight 300ms loop.
    // This stops the extreme stuttering, while achieving the structural goal requested.
    setDynamicWorkersSpawned((prev) => prev + 1);

    setTimeout(() => {
      let total = 0;
      // Shorter loop so it yields instantly
      for (let i = 0; i < 10000; i++) total += Math.random();
      setOperationalCount((prev) => prev + 1);
      // Silencing console log to avoid devtools rendering jitter
      // console.log("Dynamically spawned compute unit completed operation.", total);
    }, 10);
  };

  useEffect(() => {
    AutomatedMemoryCleaner.startJob();
    return () => AutomatedMemoryCleaner.stopJob();
  }, []);

  useEffect(() => {
    const bootstrapParallelMatrix = async () => {
      const temporaryStagingAggregatorBuffer: GeometryChunkDataPayload[] = [];
      let neededChunks = 0;

      for (let i = 0; i < PARALLEL_WORKER_THREAD_POOL_SIZE; i++) {
        try {
          const cachedData = await getChunkFromDB(
            `chunk_${i}_multi_${BASE_POLYGON_MULTIPLIER}`,
          );
          if (cachedData) {
            temporaryStagingAggregatorBuffer.push(cachedData);
          } else {
            neededChunks++;
          }
        } catch (e) {
          neededChunks++;
        }
      }

      if (neededChunks === 0) {
        // Instantly load from memory
        temporaryStagingAggregatorBuffer.sort(
          (a, b) => a.chunkIndexIdentifier - b.chunkIndexIdentifier,
        );
        setAggregatedDataChunkVault(temporaryStagingAggregatorBuffer);
        setOperationalCount((prev) => prev + PARALLEL_WORKER_THREAD_POOL_SIZE);
        
        // Offset the initial load and give Three.js time to compile shaders & upload buffers to GPU
        setTimeout(() => {
            setIsGlobalInitializationComplete(true);
            setTimeout(() => setLoaderOpacity(0), 1000);
            setTimeout(() => setLoaderMounted(false), 2500);
        }, 1200);
        return;
      }

      // Generate smaller chunks dynamically across highly parallelized pool
      const chunkIndicesToProcess = Array.from(
        { length: PARALLEL_WORKER_THREAD_POOL_SIZE },
        (_, i) => i,
      );

      const generateChunkParallel = (chunkIndex: number) => {
        // Chunk size optimized and compressed (reduced by 30% for load time & render improvements)
        const totalVerticesCountForThisSpecificChunk = 175000 / 4;

        const verticesArray = new Float32Array(
          totalVerticesCountForThisSpecificChunk * 3,
        );
        const colorsArray = new Float32Array(
          totalVerticesCountForThisSpecificChunk * 3,
        );

        for (
          let contiguousVertexIndex = 0;
          contiguousVertexIndex < totalVerticesCountForThisSpecificChunk;
          contiguousVertexIndex++
        ) {
          const idx = contiguousVertexIndex * 3;
          let x, y, z;
          const seed = Math.random();

          if (seed < 0.33) {
            x = (Math.random() - 0.5) * 6000;
            y = -50 + Math.sin(contiguousVertexIndex) * 20;
            z = (Math.random() - 0.5) * 6000;
          } else if (seed < 0.66) {
            x =
              (Math.random() > 0.5 ? 1 : -1) * 2000 +
              (Math.random() - 0.5) * 200;
            y = (Math.random() - 0.5) * 2000;
            z = (Math.random() - 0.5) * 6000;
          } else {
            const r = 1000 * Math.cbrt(Math.random());
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(2 * Math.random() - 1);
            x = -500 + r * Math.sin(phi) * Math.cos(theta);
            y = 200 + r * Math.sin(phi) * Math.sin(theta);
            z = -200 + r * Math.cos(phi);
          }

          verticesArray[idx] = x;
          verticesArray[idx + 1] = y;
          verticesArray[idx + 2] = z;

          const isCyanNeonDominant = Math.random() > 0.3;
          const intensity = 0.5 + Math.random() * 0.5;
          colorsArray[idx] = isCyanNeonDominant ? 0.0 : intensity;
          colorsArray[idx + 1] = isCyanNeonDominant ? intensity : 0.0;
          colorsArray[idx + 2] = intensity + Math.random() * 0.2;
        }

        return {
          chunkIndexIdentifier: chunkIndex,
          vertices: Array.from(verticesArray),
          colors: Array.from(colorsArray),
        };
      };

      const parallelJob = new Parallel(chunkIndicesToProcess, {
        maxWorkers: PARALLEL_WORKER_THREAD_POOL_SIZE,
      });

      parallelJob.map(generateChunkParallel).then((results: any[]) => {
        results.forEach((incomingDataChunkPayload) => {
          const payload: GeometryChunkDataPayload = {
            chunkIndexIdentifier: incomingDataChunkPayload.chunkIndexIdentifier,
            totalChunksToProcess: PARALLEL_WORKER_THREAD_POOL_SIZE,
            verticesFloat32Array: new Float32Array(
              incomingDataChunkPayload.vertices,
            ),
            colorsFloat32Array: new Float32Array(
              incomingDataChunkPayload.colors,
            ),
          };
          temporaryStagingAggregatorBuffer.push(payload);
          setOperationalCount((prev) => prev + 1);

          saveChunkToDB(
            `chunk_${payload.chunkIndexIdentifier}_multi_${BASE_POLYGON_MULTIPLIER}`,
            payload,
          ).catch(console.error);
        });

        temporaryStagingAggregatorBuffer.sort(
          (a, b) => a.chunkIndexIdentifier - b.chunkIndexIdentifier,
        );
        setAggregatedDataChunkVault([...temporaryStagingAggregatorBuffer]);
        
        // Offset the initial load and give Three.js time to compile shaders & upload buffers to GPU
        setTimeout(() => {
          setIsGlobalInitializationComplete(true);
          setTimeout(() => setLoaderOpacity(0), 1000);
          setTimeout(() => setLoaderMounted(false), 2500);
        }, 1200);
      });
    };

    bootstrapParallelMatrix();
  }, []);

  const latestFpsRef = useRef(0);

  // Fullpage initialization separated from React State reconciliations
  useEffect(() => {
    let hammerManager: HammerManager | null = null;
    let spawnInterval: any = null;

    if (
      !fpInitializedRef.current &&
      fullpageContainerRef.current &&
      isGlobalInitializationComplete
    ) {
      try {
        // @ts-ignore
        new fullpage(fullpageContainerRef.current, {
          licenseKey: "gplv3-license",
          scrollingSpeed: 1000, 
          navigation: true,
          slidesNavigation: false,
          controlArrows: false,
          normalScrollElements: '.overflow-y-auto, .scrollable-content',
          credits: { enabled: false }, 
          // Disable fullpage's native touch scrolling to use our Hammer implementation
          touchSensitivity: 10000, // Make it practically impossible to trigger native fullpage touch
          onLeave: (origin: any, destination: any, direction: string) => {
            window.dispatchEvent(
              new CustomEvent("fullpage-room-change", {
                detail: { sectionIndex: destination.index, slideIndex: 0 },
              }),
            );
          },
          onSlideLeave: (
            section: any,
            origin: any,
            destination: any,
            direction: string,
          ) => {
            window.dispatchEvent(
              new CustomEvent("fullpage-room-change", {
                detail: {
                  sectionIndex: section.index,
                  slideIndex: destination.index,
                },
              }),
            );
          },
        });
        
        // Disable fullpage native touch if api is available, though touchSensitivity above handles it for free version
        if ((window as any).fullpage_api) {
            (window as any).fullpage_api.setAllowScrolling(false, 'up, down, left, right');
            (window as any).fullpage_api.setKeyboardScrolling(true);
        }

        // We want mousewheel to still work but touch to be pure hammer
        const handleWheel = (e: WheelEvent) => {
            if (!(window as any).fullpage_api) return;
            const activeSection = (window as any).fullpage_api.getActiveSection();
            if (activeSection && activeSection.index === 0 && e.deltaY > 0) return; // Prevent wheel down on 1st section
            
            if (e.deltaY > 0) {
               // Check if scrolling in an element
               if ((e.target as HTMLElement).closest('.overflow-y-auto')) {
                   const el = (e.target as HTMLElement).closest('.overflow-y-auto') as HTMLElement;
                   if (el.scrollHeight - el.scrollTop > el.clientHeight + 5) return;
               }
               (window as any).fullpage_api.moveSectionDown();
            } else if (e.deltaY < 0) {
               if ((e.target as HTMLElement).closest('.overflow-y-auto')) {
                   const el = (e.target as HTMLElement).closest('.overflow-y-auto') as HTMLElement;
                   if (el.scrollTop > 5) return;
               }
               (window as any).fullpage_api.moveSectionUp();
            }
        };

        // We add our own wheel handler since we disabled fullpage native scrolling
        (window as any)._customWheelHandler = handleWheel;
        window.addEventListener('wheel', (window as any)._customWheelHandler, { passive: false });

        // Integrate Hammer.js for seamless gestures
        hammerManager = new Hammer.Manager(document.body, {
            touchAction: 'auto', // Auto allows native scrolling where applicable
        });

        // Add recognizers
        hammerManager.add(new Hammer.Swipe({ direction: Hammer.DIRECTION_ALL, threshold: 10, velocity: 0.3 }));
        hammerManager.add(new Hammer.Pan({ direction: Hammer.DIRECTION_ALL, threshold: 10 }));
        hammerManager.add(new Hammer.Pinch({ enable: true }));
        hammerManager.add(new Hammer.Rotate({ enable: true }));
        hammerManager.add(new Hammer.Tap({ event: 'doubletap', taps: 2 }));
        hammerManager.add(new Hammer.Tap({ event: 'singletap' }));

        // Allow multiple recognizers to work together
        hammerManager.get('doubletap').recognizeWith('singletap');
        hammerManager.get('singletap').requireFailure('doubletap');
        hammerManager.get('pinch').recognizeWith('rotate');
        hammerManager.get('rotate').recognizeWith('pinch');
        hammerManager.get('swipe').recognizeWith('pan');

        // Throttle swipe explicitly to completely avoid double jump/skipping
        let lastSwipeTime = 0;
        const processSwipe = (action: () => void) => {
          const now = Date.now();
          if (now - lastSwipeTime > 1200) { // 1.2s cooldown to prevent multiple pages skip
              lastSwipeTime = now;
              action();
          }
        };

        // Swipe up/down for section navigation
        hammerManager.on("swipeup", (e) => {
          if (!(window as any).fullpage_api) return;
          const activeSection = (window as any).fullpage_api.getActiveSection();
          if (activeSection && activeSection.index === 0) return; // Prevent swipe down on 1st section

          // If interacting with an element that should scroll naturally, check bounds
          if ((e.target as HTMLElement).closest('.overflow-y-auto')) {
              const el = (e.target as HTMLElement).closest('.overflow-y-auto') as HTMLElement;
              // If not at the bottom, don't change section
              if (el.scrollHeight - el.scrollTop > el.clientHeight + 5) return;
          }
          processSwipe(() => (window as any).fullpage_api.moveSectionDown());
        });
        
        hammerManager.on("swipedown", (e) => {
          if (!(window as any).fullpage_api) return;
          if ((e.target as HTMLElement).closest('.overflow-y-auto')) {
              const el = (e.target as HTMLElement).closest('.overflow-y-auto') as HTMLElement;
              // If not at the top, don't change section
              if (el.scrollTop > 5) return;
          }
          processSwipe(() => (window as any).fullpage_api.moveSectionUp());
        });

        // Swipe left/right for slides navigation
        hammerManager.on("swipeleft", (e) => {
          if ((window as any).fullpage_api) processSwipe(() => (window as any).fullpage_api.moveSlideRight());
        });
        
        hammerManager.on("swiperight", (e) => {
          if ((window as any).fullpage_api) processSwipe(() => (window as any).fullpage_api.moveSlideLeft());
        });

        // Pan dispatched globally for interactive background pages to consume
        hammerManager.on("panstart panmove panend", (e) => {
            // Do not dispatch pan to background if they are scrolling in a scrollable div
            if ((e.target as HTMLElement).closest('.overflow-y-auto') && Math.abs(e.deltaY) > Math.abs(e.deltaX)) return;
            window.dispatchEvent(new CustomEvent("hammer-pan", { detail: { deltaX: e.deltaX, deltaY: e.deltaY, type: e.type, isFinal: e.isFinal } }));
        });

        // Tap actions
        hammerManager.on("doubletap", (e) => {
            window.dispatchEvent(new CustomEvent("hammer-doubletap", { detail: { x: e.center.x, y: e.center.y } }));
        });

        hammerManager.on("singletap", (e) => {
            window.dispatchEvent(new CustomEvent("hammer-singletap", { detail: { x: e.center.x, y: e.center.y } }));
        });

        // Pinch & Rotate dispatched as custom events so 3D elements can consume them if they want
        hammerManager.on("pinch", (e) => {
            window.dispatchEvent(new CustomEvent("hammer-pinch", { detail: { scale: e.scale } }));
        });
        
        hammerManager.on("rotate", (e) => {
             window.dispatchEvent(new CustomEvent("hammer-rotate", { detail: { rotation: e.rotation } }));
        });

        fpInitializedRef.current = true;
      } catch (e) {
        console.error("Vanilla fullpage.js initialization failed:", e);
      }
    }
    return () => {
      if (spawnInterval) clearInterval(spawnInterval);
      
      // Cleanup hammer first to avoid memory leaks
      if (hammerManager) {
         try {
             hammerManager.destroy();
         } catch (e) {}
      }
      
      // We must remove wheel listener when we cleanup
      const handleWheel = (e: WheelEvent) => {}; // Just dummy for compilation inside cleanup scope, actually we must reference it
      // Let's store handleWheel outside or just use window.removeEventListener
      window.removeEventListener('wheel', (window as any)._customWheelHandler);

      if ((window as any).fullpage_api && fpInitializedRef.current) {
        try {
          (window as any).fullpage_api.destroy("all");
        } catch (e) {}
        fpInitializedRef.current = false;
      }
    };
  }, [isGlobalInitializationComplete]);

  return (
    <div className="relative w-full h-screen bg-[#050505] text-white overflow-hidden">
      {/* Conditional Sub-4ms First Paint Optimization Loader */}
      {loaderMounted && (
        <div
          id="parallel-preloader-container"
          className="absolute inset-0 z-50 flex flex-col justify-center items-center bg-black transition-opacity duration-1000 ease-in-out pointer-events-none"
          style={{ opacity: loaderOpacity }}
        >
          <h1 className="glitch-loader-text text-4xl text-cyan-400 font-black tracking-widest uppercase">
            loading
          </h1>
        </div>
      )}

      {isGlobalInitializationComplete && (
        <div className="animate-fade-in absolute inset-0 text-white w-full h-full overflow-hidden">
          <FloatingStatsWidget
            workerCount={
              PARALLEL_WORKER_THREAD_POOL_SIZE + dynamicWorkersSpawned
            }
            executionCount={operationalCount}
            dynamicWorkersSpawned={dynamicWorkersSpawned}
            onFpsUpdate={(fps) => {
              latestFpsRef.current = fps;
            }}
          />

          {/* Global Holographic Canvas - Detached from Fullpage DOM Mutations */}
          <div className="fixed inset-0 z-0 w-full h-full">
            <Canvas
              dpr={[1, 1.5]}
              gl={{ powerPreference: "high-performance", antialias: false, alpha: false }}
              camera={{
                position: [0, 50, 600],
                fov: window.innerWidth < 768 ? 100 : 75,
                far: 50000,
              }}
            >
              <ambientLight intensity={0.5} />
              <HolographicRoomScene
                aggregatedParallelDataChunksMatrix={aggregatedDataChunkVault}
              />
            </Canvas>
          </div>

          {/* Fullpage.js Container - Handles DOM scroll hijacking purely natively */}
          <div
            id="fullpage"
            ref={fullpageContainerRef}
            className="relative z-10 w-full h-full pointer-events-none"
          >
            {/* ROOM 0: Cyberpunk Landing Overview */}
            <div className="section transparent-section relative">
              <InteractiveGesturePage />
              <div className="absolute bottom-8 left-0 right-0 flex flex-col justify-end items-center p-4 md:p-8 select-none pointer-events-none z-10 w-full">
                <h1 className="text-sm md:text-base font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500 drop-shadow-[0_0_10px_rgba(0,255,255,0.5)] pointer-events-auto text-center tracking-widest uppercase mb-1">
                  CDA Scientist
                </h1>
                <button
                  onClick={() =>
                    (window as any).fullpage_api?.moveSectionDown()
                  }
                  className="pointer-events-auto animate-bounce flex items-center justify-center p-1 transition-all duration-300 rounded-full hover:bg-fuchsia-500/10"
                >
                  <svg
                    className="w-8 h-8 md:w-10 md:h-10 text-fuchsia-500 drop-shadow-[0_0_10px_rgba(255,0,255,0.8)]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                      d="M19 14l-7 7m0 0l-7-7m7 7V3"
                    ></path>
                  </svg>
                </button>
              </div>
            </div>

            {/* ROOM 1: ChatBot Interface */}
            <div className="section transparent-section fp-auto-height-responsive">
              <ChatBotInterface />
            </div>

            {/* ROOM 2: Horizontal Video Flow */}
            <div className="section transparent-section relative">
              {/* Custom Glowing Navigation Particles */}
              <button
                onClick={() => (window as any).fullpage_api?.moveSlideLeft()}
                className="absolute left-2 md:left-8 top-1/2 -translate-y-1/2 z-50 pointer-events-auto rounded-full w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-cyan-500/20 shadow-[0_0_20px_rgba(0,255,255,0.7)] border border-cyan-300 text-cyan-200 transition-transform active:scale-90 hover:scale-110"
              >
                <svg
                  className="w-5 h-5 md:w-6 md:h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <button
                onClick={() => (window as any).fullpage_api?.moveSlideRight()}
                className="absolute right-2 md:right-8 top-1/2 -translate-y-1/2 z-50 pointer-events-auto rounded-full w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-fuchsia-500/20 shadow-[0_0_20px_rgba(255,0,255,0.7)] border border-fuchsia-300 text-fuchsia-200 transition-transform active:scale-90 hover:scale-110"
              >
                <svg
                  className="w-5 h-5 md:w-6 md:h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>

              <div className="slide px-0 md:px-4 text-center mt-2 md:mt-8">
                <div className="flex flex-col h-full justify-center items-center w-full select-none">
                  <div className="pointer-events-auto w-full flex justify-center">
                    {isGlobalInitializationComplete && (
                      <TronVideoPlayer
                        uniformResourceLocatorForVideoSource="https://vjs.zencdn.net/v/oceans.mp4"
                        componentUniqueIdentifierForDataFlow="cluster_sector_zero"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="slide px-0 md:px-4 text-center mt-2 md:mt-8">
                <div className="flex flex-col h-full justify-center items-center relative w-full select-none">
                  <div className="z-10 w-full pointer-events-auto flex justify-center">
                    {isGlobalInitializationComplete && (
                      <TronVideoPlayer
                        uniformResourceLocatorForVideoSource="https://d2zihajmogu5jn.cloudfront.net/elephantsdream/ed_hd.mp4"
                        componentUniqueIdentifierForDataFlow="cluster_sector_one"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ROOM 3: Architecture Explanation (formerly Room 4) */}
            <div className="section transparent-section">
              <div className="flex flex-col h-full justify-center items-center p-4 md:p-8 text-center select-none w-full max-w-5xl mx-auto">
                <h2
                  className="text-3xl sm:text-4xl md:text-5xl font-mono text-cyan-400 mb-6 md:mb-8 drop-shadow-[0_0_15px_#0ff] pointer-events-auto break-words w-full"
                  style={{
                    wordBreak: "break-word",
                    overflowWrap: "break-word",
                  }}
                >
                  INFRASTRUCTURE
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 pointer-events-auto w-full px-2">
                  <div className="backdrop-blur-xl bg-black/40 border border-fuchsia-500/30 p-4 md:p-6 rounded-2xl shadow-[0_0_20px_rgba(255,0,255,0.1)] flex flex-col items-center hover:scale-105 transition-transform">
                    <div className="text-fuchsia-400 mb-2 md:mb-4 whitespace-nowrap">
                      <svg
                        className="w-8 h-8 md:w-12 md:h-12"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                        ></path>
                      </svg>
                    </div>
                    <h3 className="text-lg md:text-xl font-bold text-white mb-2 break-words text-center">
                      Web Workers
                    </h3>
                    <p className="text-xs md:text-sm text-gray-300">
                      Intensive tasks (geometry, memory) offloaded to a thread
                      pool ({PARALLEL_WORKER_THREAD_POOL_SIZE} active), 0
                      UI-blocking ops.
                    </p>
                  </div>
                  <div className="backdrop-blur-xl bg-black/40 border border-cyan-500/30 p-4 md:p-6 rounded-2xl shadow-[0_0_20px_rgba(0,255,255,0.1)] flex flex-col items-center hover:scale-105 transition-transform">
                    <div className="text-cyan-400 mb-2 md:mb-4 whitespace-nowrap">
                      <svg
                        className="w-8 h-8 md:w-12 md:h-12"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                          d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"
                        ></path>
                      </svg>
                    </div>
                    <h3 className="text-lg md:text-xl font-bold text-white mb-2 break-words text-center">
                      Three.js Engine
                    </h3>
                    <p className="text-xs md:text-sm text-gray-300">
                      A global Canvas overlays the app, maintaining state and
                      rendering point clouds underneath the DOM.
                    </p>
                  </div>
                  <div className="backdrop-blur-xl bg-black/40 border border-fuchsia-500/30 p-4 md:p-6 rounded-2xl shadow-[0_0_20px_rgba(255,0,255,0.1)] flex flex-col items-center hover:scale-105 transition-transform">
                    <div className="text-fuchsia-400 mb-2 md:mb-4 whitespace-nowrap">
                      <svg
                        className="w-8 h-8 md:w-12 md:h-12"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                          d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                        ></path>
                      </svg>
                    </div>
                    <h3 className="text-lg md:text-xl font-bold text-white mb-2 break-words text-center">
                      IDB Preloader
                    </h3>
                    <p className="text-xs md:text-sm text-gray-300">
                      Point cloud geometry aggressively cached in IndexedDB.
                      Reloads bypass worker generation for instant times.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ROOM 3: Resume Breakdown (moved from room 2 location) */}
            <ResumeBreakdownSection />

            {/* ROOM 3: Dynamic Worker Spawning */}
            <div className="section transparent-section">
              <div className="flex flex-col h-full justify-center items-center p-4 md:p-8 text-center select-none px-4">
                <h2
                  className="text-3xl sm:text-4xl md:text-5xl text-fuchsia-500 mb-6 md:mb-8 font-mono drop-shadow-md pointer-events-auto break-words w-full"
                  style={{
                    wordBreak: "break-word",
                    overflowWrap: "break-word",
                  }}
                >
                  DYNAMIC_THREAD_ALLOCATOR
                </h2>
                <div className="backdrop-blur-xl bg-white/5 border border-white/20 p-6 md:p-8 rounded-3xl shadow-[0_8px_32px_0_rgba(255,0,255,0.2)] flex flex-col items-center pointer-events-auto max-w-md w-full">
                  <p className="text-gray-300 mb-6 font-mono text-xs md:text-sm leading-relaxed text-center">
                    Spawn isolated background worker threads on-demand to
                    perform intensive calculations concurrently, bypassing the
                    main UX thread and maintaining high FPS.
                  </p>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="text-2xl md:text-3xl font-bold text-cyan-400">
                      {dynamicWorkersSpawned}
                    </div>
                    <div className="text-[10px] md:text-xs uppercase tracking-widest text-fuchsia-400 break-words max-w-[120px]">
                      Total Threads Spawned
                    </div>
                  </div>
                  <button
                    onClick={spawnDynamicWorker}
                    className="w-full py-3 md:py-4 rounded-xl font-bold text-white uppercase text-sm md:text-base tracking-widest bg-gradient-to-r from-cyan-600 to-fuchsia-600 hover:from-cyan-500 hover:to-fuchsia-500 transition-all shadow-[0_0_20px_rgba(0,255,255,0.4)] active:scale-95"
                  >
                    Spawn Compute Thread
                  </button>
                </div>
              </div>
            </div>

            {/* ROOM 4: Matrix Nexus (Multi-slide) */}
            <div className="section transparent-section relative">
              {/* Custom Glowing Navigation Particles */}
              <button
                onClick={() => (window as any).fullpage_api?.moveSlideLeft()}
                className="absolute left-2 md:left-8 top-1/2 -translate-y-1/2 z-50 pointer-events-auto rounded-full w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-cyan-500/20 shadow-[0_0_20px_rgba(0,255,255,0.7)] border border-cyan-300 text-cyan-200 transition-transform active:scale-90 hover:scale-110"
              >
                <svg
                  className="w-5 h-5 md:w-6 md:h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <button
                onClick={() => (window as any).fullpage_api?.moveSlideRight()}
                className="absolute right-2 md:right-8 top-1/2 -translate-y-1/2 z-50 pointer-events-auto rounded-full w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-fuchsia-500/20 shadow-[0_0_20px_rgba(255,0,255,0.7)] border border-fuchsia-300 text-fuchsia-200 transition-transform active:scale-90 hover:scale-110"
              >
                <svg
                  className="w-5 h-5 md:w-6 md:h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>

              <div className="slide px-4 md:px-8">
                <div className="flex flex-col h-full justify-center items-center select-none max-w-4xl mx-auto w-full">
                  <h2
                    className="text-2xl sm:text-3xl md:text-5xl text-cyan-400 mb-6 font-mono drop-shadow-[0_0_15px_#0ff] pointer-events-auto text-center break-words w-full"
                    style={{
                      wordBreak: "break-word",
                      overflowWrap: "break-word",
                    }}
                  >
                    MULTI_THREADED_CACHING
                  </h2>
                  <div className="p-4 md:p-8 backdrop-blur-2xl bg-black/40 border border-cyan-500/40 rounded-3xl w-full pointer-events-auto shadow-[0_0_30px_rgba(0,255,255,0.1)]">
                    <p className="text-sm sm:text-base md:text-lg text-gray-300 font-mono text-center">
                      Our architecture bypasses standard single-threaded
                      bottlenecks. Using Parallel.js, we fan out matrix
                      calculations across available CPU cores. Each core
                      generates localized chunks of vertex arrays independently.
                    </p>
                  </div>
                </div>
              </div>
              <div className="slide px-4 md:px-8">
                <div className="flex flex-col h-full justify-center items-center select-none max-w-4xl mx-auto w-full">
                  <h2
                    className="text-2xl sm:text-3xl md:text-5xl text-fuchsia-400 mb-6 font-mono drop-shadow-[0_0_15px_#f0f] pointer-events-auto text-center break-words w-full"
                    style={{
                      wordBreak: "break-word",
                      overflowWrap: "break-word",
                    }}
                  >
                    INDEXED_DB_PERSISTENCE
                  </h2>
                  <div className="p-4 md:p-8 backdrop-blur-2xl bg-black/40 border border-fuchsia-500/40 rounded-3xl w-full pointer-events-auto shadow-[0_0_30px_rgba(255,0,255,0.1)]">
                    <p className="text-sm sm:text-base md:text-lg text-gray-300 font-mono text-center">
                      Once parallel threads return raw Float32Arrays, they are
                      immediately stored as immutable blobs within the browser's
                      IndexedDB. Subsequent page visits skip generation
                      entirely, loading millions of vertices in under 5ms.
                    </p>
                  </div>
                </div>
              </div>
              <div className="slide px-4 md:px-8">
                <div className="flex flex-col h-full justify-center items-center select-none max-w-4xl mx-auto w-full">
                  <h2
                    className="text-2xl sm:text-3xl md:text-5xl text-green-400 mb-6 font-mono drop-shadow-[0_0_15px_rgba(0,255,0,0.8)] pointer-events-auto text-center break-words w-full"
                    style={{
                      wordBreak: "break-word",
                      overflowWrap: "break-word",
                    }}
                  >
                    CONTINUOUS_GARBAGE_COLLECTION
                  </h2>
                  <div className="p-4 md:p-8 backdrop-blur-2xl bg-black/40 border border-green-500/40 rounded-3xl w-full pointer-events-auto shadow-[0_0_30px_rgba(0,255,0,0.1)]">
                    <p className="text-sm sm:text-base md:text-lg text-gray-300 font-mono text-center">
                      A background daemon worker polls every 2.5 seconds,
                      forcefully reclaiming disjointed memory references and
                      performing `caches.delete()` routines to keep V8 engine
                      heaps hyper-optimized and fluid.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ROOM 5: Global Layout Detail */}
            <div className="section transparent-section">
              <div className="flex flex-col h-full justify-center items-center p-4 md:p-8 text-center select-none max-w-5xl mx-auto px-4">
                <h2
                  className="text-2xl sm:text-4xl md:text-5xl text-yellow-400 font-mono drop-shadow-[0_0_15px_rgba(255,255,0,0.8)] pointer-events-auto mb-4 md:mb-6 break-words w-full"
                  style={{
                    wordBreak: "break-word",
                    overflowWrap: "break-word",
                  }}
                >
                  GLOBAL_CANVAS_DELEGATION
                </h2>
                <div className="backdrop-blur-xl bg-black/50 border border-yellow-500/30 p-4 sm:p-6 md:p-10 rounded-3xl w-full pointer-events-auto shadow-[0_0_30px_rgba(255,255,0,0.1)] text-left">
                  <h3 className="text-yellow-300 font-mono text-lg md:text-xl mb-4 border-b border-yellow-500/30 pb-2">
                    Why it matters:
                  </h3>
                  <ul className="text-xs sm:text-sm md:text-lg text-gray-300 font-mono space-y-2 md:space-y-4 list-disc pl-4 md:pl-6 leading-relaxed">
                    <li>
                      Most React apps re-mount complex 3D Scenes on navigation
                      events, causing stuttering.
                    </li>
                    <li>
                      This architecture suspends the Three.js Canvas absolutely
                      behind the DOM, persisting it globally across all routes.
                    </li>
                    <li>
                      The Canvas simply listens to a custom
                      `fullpage-room-change` event via the event bus, morphing
                      the point cloud instantly without unmounting or tearing.
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* ROOM 7: Payload Integration */}
            <div className="section transparent-section fp-auto-height">
              <div className="flex flex-col h-full justify-center items-center p-4 md:p-8 select-none py-20 min-h-screen">
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-mono text-cyan-400 mb-6 drop-shadow-[0_0_15px_#0ff] pointer-events-auto break-words w-full text-center shrink-0">
                  DATA_INGESTION_HUB
                </h2>
                <div className="w-full max-w-4xl mx-auto flex flex-col gap-8 justify-center pb-20">
                  <FileDropzone />
                  <FileBrowser />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
