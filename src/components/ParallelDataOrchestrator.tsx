import React, { useEffect, useState, useRef, Component, ErrorInfo, ReactNode } from "react";
import { Canvas } from "@react-three/fiber";

class ErrorBoundary extends Component<{children: ReactNode, fallback?: ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) { console.error("Caught error:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || <div className="absolute inset-0 bg-red-900 text-white p-10 font-mono overflow-auto z-[9999]"><h1>System Error</h1><pre>{this.state.error?.stack}</pre></div>;
    }
    return this.props.children;
  }
}

import ReactFullpage from '@fullpage/react-fullpage';
import { HolographicRoomScene } from "./HolographicRoomScene";
import { getChunkFromDB, saveChunkToDB } from "../lib/IndexedDBHelper";
import Hammer from "hammerjs";
import { FloatingStatsWidget } from "./FloatingStatsWidget";
import { ChatBotInterface } from "./ChatBotInterface";
import { InteractiveGesturePage } from "./InteractiveGesturePage";
import { AgentConfigPage } from "./AgentConfigPage";

export interface GeometryChunkDataPayload {
  chunkIndexIdentifier: number;
  totalChunksToProcess: number;
  verticesFloat32Array: Float32Array;
  colorsFloat32Array: Float32Array;
}

// Drastically increase parallelism and adjust polygon density for mobile/desktop parity
const PARALLEL_WORKER_THREAD_POOL_SIZE =
  navigator.hardwareConcurrency * 16 || 128; // Even more workers to offset performance
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

  useEffect(() => {
    let active = true;

    const initializeDataChunks = async () => {
      const MAX_CHUNKS = Math.floor(12 * BASE_POLYGON_MULTIPLIER); // generate chunks based on max factor
      const chunks: GeometryChunkDataPayload[] = [];
      let completed = 0;

      for (let i = 0; i < MAX_CHUNKS; i++) {
        // try to get from IndexedDB first
        const cached = await getChunkFromDB(`chunk_v3_${i}`);
        if (cached && active) {
           chunks.push(cached as GeometryChunkDataPayload);
           completed++;
           setLoaderOpacity(1 - (completed / MAX_CHUNKS));
           if (completed === MAX_CHUNKS) {
              setAggregatedDataChunkVault(chunks);
              setIsGlobalInitializationComplete(true);
              setTimeout(() => setLoaderMounted(false), 1000);
           }
        } else if (active) {
          const workerData = await new Promise<GeometryChunkDataPayload>((resolve) => {
             setTimeout(() => {
               const pointsCount = 7000;
               const verticesFloat32Array = new Float32Array(pointsCount * 3);
               const colorsFloat32Array = new Float32Array(pointsCount * 3);

               const shapeType = Math.floor(Math.random() * 4);
               const cx = (Math.random() - 0.5) * 2000;
               const cy = (Math.random() - 0.5) * 1000 + 500;
               const cz = (Math.random() - 0.5) * 2000;
               const shapeRadius = 200 + Math.random() * 600;

               for (let p = 0; p < pointsCount; p++) {
                 let px, py, pz;

                 if (shapeType === 0) {
                   // Sphere
                   const theta = Math.random() * 2 * Math.PI;
                   const phi = Math.acos((Math.random() * 2) - 1);
                   px = cx + shapeRadius * Math.sin(phi) * Math.cos(theta);
                   py = cy + shapeRadius * Math.sin(phi) * Math.sin(theta);
                   pz = cz + shapeRadius * Math.cos(phi);
                 } else if (shapeType === 1) {
                   // Cubic Cluster
                   px = cx + (Math.random() - 0.5) * shapeRadius;
                   py = cy + (Math.random() - 0.5) * shapeRadius;
                   pz = cz + (Math.random() - 0.5) * shapeRadius;
                 } else if (shapeType === 2) {
                   // Ring
                   const r2 = Math.random() * 100;
                   const t1 = Math.random() * 2 * Math.PI;
                   const t2 = Math.random() * 2 * Math.PI;
                   px = cx + (shapeRadius + r2 * Math.cos(t2)) * Math.cos(t1);
                   py = cy + r2 * Math.sin(t2);
                   pz = cz + (shapeRadius + r2 * Math.cos(t2)) * Math.sin(t1);
                 } else {
                   // Widespread background
                   const radius = 500 + Math.random() * 2000;
                   const theta = Math.random() * 2 * Math.PI;
                   const phi = Math.acos((Math.random() * 2) - 1);
                   px = radius * Math.sin(phi) * Math.cos(theta);
                   py = radius * Math.sin(phi) * Math.sin(theta);
                   pz = radius * Math.cos(phi);
                 }

                 verticesFloat32Array[p * 3] = px;
                 verticesFloat32Array[p * 3 + 1] = py;
                 verticesFloat32Array[p * 3 + 2] = pz;

                 colorsFloat32Array[p * 3] = 0.2 + Math.random() * 0.5; // r
                 colorsFloat32Array[p * 3 + 1] = 0.5 + Math.random() * 0.5; // g
                 colorsFloat32Array[p * 3 + 2] = 0.8 + Math.random() * 0.2; // b
               }
               const payload: GeometryChunkDataPayload = {
                  chunkIndexIdentifier: i,
                  totalChunksToProcess: MAX_CHUNKS,
                  verticesFloat32Array,
                  colorsFloat32Array
               };
               saveChunkToDB(`chunk_v3_${i}`, payload);
               resolve(payload);
             }, 10);
          });
          if (!active) return;
          chunks.push(workerData);
          completed++;
          setLoaderOpacity(1 - (completed / MAX_CHUNKS));
          setDynamicWorkersSpawned(completed);
          if (completed === MAX_CHUNKS) {
              setAggregatedDataChunkVault(chunks);
              setIsGlobalInitializationComplete(true);
              setTimeout(() => setLoaderMounted(false), 1000);
          }
        }
      }
    };

    initializeDataChunks();
    return () => { active = false; };
  }, []);

  const latestFpsRef = useRef<number>(0);
  const [activeRoomIndex, setActiveRoomIndex] = useState<number>(0);

  useEffect(() => {
    let hammerManager: HammerManager | null = null;

    if (isGlobalInitializationComplete) {
      hammerManager = new Hammer.Manager(document.body, { touchAction: 'none' });
      hammerManager.add(new Hammer.Pan({ direction: Hammer.DIRECTION_ALL, threshold: 10 }));
      hammerManager.add(new Hammer.Tap({ event: 'doubletap', taps: 2 }));

      hammerManager.on("pan", (e) => {
          window.dispatchEvent(new CustomEvent("hammer-pan", { detail: { deltaX: e.deltaX, deltaY: e.deltaY, type: e.type, isFinal: e.isFinal } }));
      });

      hammerManager.on("doubletap", (e) => {
          window.dispatchEvent(new CustomEvent("hammer-doubletap", { detail: { x: e.center.x, y: e.center.y } }));
      });
    }

    return () => {
      if (hammerManager) hammerManager.destroy();
    };
  }, [isGlobalInitializationComplete]);

  return (
    <div className="relative w-full h-screen bg-[#050505] text-white overflow-y-auto overflow-x-hidden custom-scrollbar">
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
        <div className="animate-fade-in relative z-0 w-full h-full">
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

          <div className="fixed inset-0 z-0 w-full h-full">
            <ErrorBoundary>
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
                activeRoomIndex={activeRoomIndex}
              />
            </Canvas>
            </ErrorBoundary>
          </div>

          <div className="relative z-10 pointer-events-none">

            {/* React Fullpage for Pages */}
            <div className="absolute inset-0 z-30 pointer-events-none">
              <ReactFullpage
                scrollingSpeed={1000}
                credits={{ enabled: false }}
                afterLoad={(origin, destination, direction, trigger) => {
                  setActiveRoomIndex(destination.index);
                  window.dispatchEvent(new CustomEvent("fullpage-room-change", { detail: destination.index }));
                }}
                render={({ state, fullpageApi }) => {
                  return (
                    <ReactFullpage.Wrapper>
                      <div className="section pointer-events-none">
                        <div className="w-full h-full flex justify-center items-center pointer-events-none p-4 md:p-8 animate-fade-in">
                          <div className="pointer-events-auto w-full md:w-auto">
                            <ChatBotInterface />
                          </div>
                        </div>
                      </div>

                      <div className="section pointer-events-none">
                        <div className="w-full h-full relative pointer-events-none">
                            <InteractiveGesturePage />
                        </div>
                      </div>

                      <div className="section pointer-events-none">
                        <div className="w-full h-full flex justify-center items-center pointer-events-none p-4 md:p-8 animate-fade-in">
                          <div className="pointer-events-auto w-full md:w-auto">
                            <AgentConfigPage />
                          </div>
                        </div>
                      </div>
                    </ReactFullpage.Wrapper>
                  );
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
