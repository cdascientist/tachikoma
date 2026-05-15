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
import { AutomatedMemoryCleaner } from "../lib/AutomatedMemoryCleaner";
import Parallel from "../lib/parallel.js";
import Hammer from "hammerjs";
import { FloatingStatsWidget } from "./FloatingStatsWidget";
import { ChatBotInterface } from "./ChatBotInterface";
import { InteractiveGesturePage } from "./InteractiveGesturePage";

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

  // Sandbox Controls
  const [sandboxDensity, setSandboxDensity] = useState<number>(() => {
    const saved = localStorage.getItem('env_sandboxDensity'); return saved ? Number(saved) : 100;
  });
  const [sandboxOrbScale, setSandboxOrbScale] = useState<number>(() => {
    const saved = localStorage.getItem('env_sandboxOrbScale'); return saved ? Number(saved) : 1;
  });
  const [sandboxWallScale, setSandboxWallScale] = useState<number>(() => {
    const saved = localStorage.getItem('env_sandboxWallScale'); return saved ? Number(saved) : 1;
  });

  const initialPlanes: { id: string; label: string; position: [number, number, number]; scale: number }[] = [
    { id: "plane_0", label: "Plane 0", position: [0, -500, 0], scale: 100 }
  ];
  const [planesConfig, setPlanesConfig] = useState(() => {
    const saved = localStorage.getItem('env_planesConfig'); return saved ? JSON.parse(saved) : initialPlanes;
  });

  const initialWalls: { id: string; label: string; position: [number, number, number]; scale: number }[] = [
    { id: "wall_0", label: "Wall 0: Base", position: [0, 0, 0], scale: 1 }
  ];
  const [wallsConfig, setWallsConfig] = useState(() => {
    const saved = localStorage.getItem('env_wallsConfig'); return saved ? JSON.parse(saved) : initialWalls;
  });

  const initialOrbs: { id: string; label: string; position: [number, number, number] }[] = [
    { id: "orb_0", label: "Orb 0: Landing", position: [0, 50, 0] },
    { id: "orb_1", label: "Orb 1: Chatbot", position: [-300, 50, -50] },
    { id: "orb_2", label: "Orb 2: Particle Sandbox", position: [0, 100, -200] },
    { id: "orb_3", label: "Orb 3: Video", position: [300, 50, -50] },
    { id: "orb_4", label: "Orb 4: Architecture", position: [600, 50, -100] },
    { id: "orb_5", label: "Orb 5: Resume", position: [-600, 50, -100] },
    { id: "orb_6", label: "Orb 6: Dynamic Thread", position: [900, 50, -150] },
    { id: "orb_7", label: "Orb 7: Nexus", position: [-900, 50, -150] },
    { id: "orb_8", label: "Orb 8: Canvas Delegation", position: [1200, 50, -200] },
    { id: "orb_9", label: "Orb 9: Data Ingestion", position: [-1200, 50, -200] }
  ];
  const [orbsConfig, setOrbsConfig] = useState(() => {
    const saved = localStorage.getItem('env_orbsConfig'); return saved ? JSON.parse(saved) : initialOrbs;
  });

  useEffect(() => {
    localStorage.setItem('env_sandboxDensity', sandboxDensity.toString());
    localStorage.setItem('env_sandboxOrbScale', sandboxOrbScale.toString());
    localStorage.setItem('env_sandboxWallScale', sandboxWallScale.toString());
    localStorage.setItem('env_planesConfig', JSON.stringify(planesConfig));
    localStorage.setItem('env_wallsConfig', JSON.stringify(wallsConfig));
    localStorage.setItem('env_orbsConfig', JSON.stringify(orbsConfig));
  }, [sandboxDensity, sandboxOrbScale, sandboxWallScale, planesConfig, wallsConfig, orbsConfig]);

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
          // If not cached, let's use the parallel construct to generate
          // Instead of complex parallel mapping, we can mock parallel generation locally for demo max speed
          // or run small parallel tasks.
          // Since Parallel.js might have issues in some envs with DOM, we'll offload array generation to a Promise
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
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [selectedElementId, setSelectedElementId] = useState<string>("wall_0");
  const [isSandboxMenuMinimized, setIsSandboxMenuMinimized] = useState<boolean>(true);
  const [isSandboxMenuHovered, setIsSandboxMenuHovered] = useState<boolean>(false);
  const [activeRoomIndex, setActiveRoomIndex] = useState<number>(0);

  const orbPositions = orbsConfig.map(o => o.position);
  const wallPositions = wallsConfig.map(w => w.position);

  const updateOrbPosition = (id: string, axis: 0 | 1 | 2, value: number) => {
    setOrbsConfig((prev) => prev.map(o => o.id === id ? { ...o, position: Object.assign([...o.position], { [axis]: value }) } as typeof o : o));
  };

  const updateWallPosition = (id: string, axis: 0 | 1 | 2, value: number) => {
    setWallsConfig((prev) => prev.map(w => w.id === id ? { ...w, position: Object.assign([...w.position], { [axis]: value }) } as typeof w : w));
  };

  const updatePlanePosition = (id: string, axis: 0 | 1 | 2, value: number) => {
    setPlanesConfig((prev) => prev.map(p => p.id === id ? { ...p, position: Object.assign([...p.position], { [axis]: value }) } as typeof p : p));
  };

  const handleElementPositionChange = (id: string, position: [number, number, number]) => {
    if (id.startsWith("orb_")) {
      setOrbsConfig((prev) => prev.map(o => o.id === id ? { ...o, position } : o));
    } else if (id.startsWith("wall_")) {
      setWallsConfig((prev) => prev.map(w => w.id === id ? { ...w, position } : w));
    } else if (id.startsWith("plane_")) {
      setPlanesConfig((prev) => prev.map(p => p.id === id ? { ...p, position } : p));
    }
    setSelectedElementId(id);
  };

  const addNewPlane = () => {
    setPlanesConfig((prev) => [
      ...prev,
      {
        id: `plane_${Date.now()}`,
        label: `Custom Plane ${prev.length}`,
        position: [0, -200, 0],
        scale: 100
      }
    ]);
  };

  const addNewOrb = () => {
    setOrbsConfig((prev) => [
      ...prev,
      {
        id: `orb_${Date.now()}`,
        label: `Custom Orb ${prev.length}`,
        position: [
          Math.floor(Math.random() * 400 - 200),
          Math.floor(Math.random() * 200),
          Math.floor(Math.random() * 400 - 200)
        ]
      }
    ]);
  };

  const addNewWall = () => {
    setWallsConfig((prev) => [
      ...prev,
      {
        id: `wall_${Date.now()}`,
        label: `Custom Wall ${prev.length}`,
        position: [
          Math.floor(Math.random() * 400 - 200),
          Math.floor(Math.random() * 200),
          Math.floor(Math.random() * 400 - 200)
        ],
        scale: 1
      }
    ]);
  };

  const duplicateSelectedElement = () => {
    if (selectedElementId.startsWith("wall")) {
      const original = wallsConfig.find(w => w.id === selectedElementId);
      if (original) {
        setWallsConfig(prev => [
          ...prev,
          {
            ...original,
            id: `wall_${Date.now()}`,
            label: `${original.label} (Copy)`,
            position: [original.position[0] + 50, original.position[1], original.position[2] + 50]
          }
        ]);
      }
    } else if (selectedElementId.startsWith("plane")) {
      const original = planesConfig.find(p => p.id === selectedElementId);
      if (original) {
        setPlanesConfig(prev => [
          ...prev,
          {
            ...original,
            id: `plane_${Date.now()}`,
            label: `${original.label} (Copy)`,
            position: [original.position[0] + 50, original.position[1], original.position[2] + 50]
          }
        ]);
      }
    } else if (selectedElementId.startsWith("orb")) {
      const original = orbsConfig.find(o => o.id === selectedElementId);
      if (original) {
        setOrbsConfig(prev => [
          ...prev,
          {
            ...original,
            id: `orb_${Date.now()}`,
            label: `${original.label} (Copy)`,
            position: [original.position[0] + 50, original.position[1], original.position[2] + 50]
          }
        ]);
      }
    }
  };

  const updateWallScale = (id: string, scale: number) => {
    setWallsConfig((prev) => prev.map(w => w.id === id ? { ...w, scale } : w));
  };

  const updatePlaneScale = (id: string, scale: number) => {
    setPlanesConfig((prev) => prev.map(p => p.id === id ? { ...p, scale } : p));
  };

  const saveConfigToFile = () => {
    const configData = {
      sandboxDensity,
      sandboxOrbScale,
      sandboxWallScale,
      walls: wallsConfig,
      orbs: orbsConfig
    };
    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "particle_sandbox_config.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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
                sandboxDensity={sandboxDensity}
                sandboxOrbScale={sandboxOrbScale}
                sandboxWallScale={sandboxWallScale}
                wallsConfig={wallsConfig}
                planesConfig={planesConfig}
                orbPositions={orbPositions}
                activeRoomIndex={activeRoomIndex}
                selectedElementId={selectedElementId}
                onElementPositionChange={handleElementPositionChange}
                onElementSelect={setSelectedElementId}
              />
            </Canvas>
            </ErrorBoundary>
          </div>

          <div className="relative z-10 pointer-events-none">
            
            {/* Floating button to open Env Editor */}
            {isSandboxMenuMinimized && (
              <button 
                onClick={() => setIsSandboxMenuMinimized(false)}
                className="fixed top-8 left-8 p-3 rounded-full bg-fuchsia-900/40 border border-fuchsia-500/50 text-fuchsia-400 hover:bg-fuchsia-800/50 transition-colors z-[60] pointer-events-auto"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              </button>
            )}

            {/* Env Editor Pane (Left Side) */}
            <div 
              className={`fixed top-0 left-0 pointer-events-auto flex flex-col h-screen bg-black/80 md:bg-black/90 backdrop-blur-md border-r border-fuchsia-500/30 w-full md:w-[400px] lg:w-[450px] transition-transform duration-500 pt-24 pb-4 px-6 overflow-hidden shadow-[20px_0_50px_rgba(255,0,255,0.05)] z-[60] ${isSandboxMenuMinimized ? '-translate-x-full' : 'translate-x-0'}`}
            >
              <div className="flex justify-between items-center mb-6 border-b border-fuchsia-500/20 pb-4 shrink-0">
                <h2 className="text-xl sm:text-2xl font-mono text-fuchsia-400 drop-shadow-[0_0_10px_#f0f] tracking-widest uppercase">
                  Env Editor
                </h2>
                <button 
                  onClick={() => setIsSandboxMenuMinimized(true)}
                  className="text-fuchsia-300 hover:text-white p-2 w-10 h-10 flex items-center justify-center border border-fuchsia-500/50 rounded-full bg-fuchsia-500/10 hover:bg-fuchsia-500/30 transition-colors font-mono text-xs shrink-0"
                  title="Close"
                >
                  X
                </button>
              </div>
              
              <div className={`flex flex-col flex-1 overflow-y-auto pr-2 custom-scrollbar transition-opacity duration-300 ${isSandboxMenuMinimized ? 'opacity-0' : 'opacity-100'}`}>
                <p className="text-fuchsia-200/60 font-mono text-xs mb-6 uppercase tracking-widest border-l-2 border-fuchsia-500/50 pl-3 leading-relaxed">
                  Comprehensive Environment Construction. Modify Orbs, Planes, Walls, and Global Properties.
                </p>
                
                <div className="flex flex-col gap-6 pb-20">
                    <div className="flex flex-col gap-2 bg-fuchsia-900/10 p-4 rounded-xl border border-fuchsia-500/20">
                      <label className="text-fuchsia-300 font-mono text-xs uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 bg-fuchsia-500 rounded-full"></span> Scene Graph
                      </label>
                      <select 
                        className="bg-black/80 border border-fuchsia-400/50 text-fuchsia-300 p-3 rounded-lg font-mono text-sm focus:outline-none focus:border-fuchsia-400 appearance-none"
                        value={selectedElementId}
                        onChange={(e) => setSelectedElementId(e.target.value)}
                      >
                        <optgroup label="Walls">
                          {wallsConfig.map((wall) => (
                            <option key={wall.id} value={wall.id}>{wall.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Orbs">
                          {orbsConfig.map((orb) => (
                            <option key={orb.id} value={orb.id}>{orb.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Planes">
                          {planesConfig.map((plane) => (
                            <option key={plane.id} value={plane.id}>{plane.label}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={addNewWall} className="bg-cyan-600/10 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/30 py-3 rounded-lg font-mono text-xs uppercase tracking-widest transition-all hover:shadow-[0_0_15px_rgba(0,255,255,0.2)]">+ Wall</button>
                      <button onClick={addNewPlane} className="bg-purple-600/10 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30 py-3 rounded-lg font-mono text-xs uppercase tracking-widest transition-all hover:shadow-[0_0_15px_rgba(168,85,247,0.2)]">+ Plane</button>
                      <button onClick={addNewOrb} className="bg-fuchsia-600/10 hover:bg-fuchsia-600/30 text-fuchsia-400 border border-fuchsia-500/30 py-3 rounded-lg font-mono text-xs uppercase tracking-widest transition-all hover:shadow-[0_0_15px_rgba(255,0,255,0.2)]">+ Orb</button>
                      <button onClick={duplicateSelectedElement} className="bg-emerald-600/10 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 py-3 rounded-lg font-mono text-xs uppercase tracking-widest transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]">Duplicate</button>
                    </div>

                    <div className="px-5 py-6 border border-fuchsia-500/20 rounded-xl bg-black/60 flex flex-col gap-5 drop-shadow-lg">
                      <h3 className="text-fuchsia-400 font-mono text-sm tracking-widest uppercase mb-1 flex items-center justify-between">
                        <span>Transform Details</span>
                        <span className="text-xs text-fuchsia-500/50">{selectedElementId}</span>
                      </h3>
                      {(() => {
                        const isWall = selectedElementId.startsWith("wall");
                        const isPlane = selectedElementId.startsWith("plane");
                        const targetList = isWall ? wallsConfig : isPlane ? planesConfig : orbsConfig;
                        const targetItem = targetList.find(x => x.id === selectedElementId);
                        const updatePos = isWall ? updateWallPosition : isPlane ? updatePlanePosition : updateOrbPosition;

                        if (!targetItem) return <div className="text-fuchsia-500/50 text-xs font-mono">No element selected.</div>;
                        return (
                          <div className="flex flex-col gap-5 pr-1">
                            <div className="flex flex-col gap-1">
                              <label className="text-fuchsia-300/80 font-mono text-[10px] uppercase tracking-widest flex justify-between">
                                <span>Transl. X</span>
                                <input type="number" className="bg-transparent text-right w-16 text-fuchsia-400 focus:outline-none border-b border-fuchsia-500/30" value={Math.round(targetItem.position[0])} onChange={(e) => updatePos(targetItem.id, 0, Number(e.target.value))} />
                              </label>
                              <input type="range" className="w-full h-1 bg-fuchsia-900 rounded-lg appearance-none cursor-pointer accent-fuchsia-500" min="-2000" max="2000" step="10" value={targetItem.position[0]} onChange={(e) => updatePos(targetItem.id, 0, Number(e.target.value))} />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-fuchsia-300/80 font-mono text-[10px] uppercase tracking-widest flex justify-between">
                                <span>Transl. Y</span>
                                <input type="number" className="bg-transparent text-right w-16 text-fuchsia-400 focus:outline-none border-b border-fuchsia-500/30" value={Math.round(targetItem.position[1])} onChange={(e) => updatePos(targetItem.id, 1, Number(e.target.value))} />
                              </label>
                              <input type="range" className="w-full h-1 bg-fuchsia-900 rounded-lg appearance-none cursor-pointer accent-fuchsia-500" min="-2000" max="2000" step="10" value={targetItem.position[1]} onChange={(e) => updatePos(targetItem.id, 1, Number(e.target.value))} />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-fuchsia-300/80 font-mono text-[10px] uppercase tracking-widest flex justify-between">
                                <span>Transl. Z</span>
                                <input type="number" className="bg-transparent text-right w-16 text-fuchsia-400 focus:outline-none border-b border-fuchsia-500/30" value={Math.round(targetItem.position[2])} onChange={(e) => updatePos(targetItem.id, 2, Number(e.target.value))} />
                              </label>
                              <input type="range" className="w-full h-1 bg-fuchsia-900 rounded-lg appearance-none cursor-pointer accent-fuchsia-500" min="-2000" max="2000" step="10" value={targetItem.position[2]} onChange={(e) => updatePos(targetItem.id, 2, Number(e.target.value))} />
                            </div>
                            {'scale' in targetItem && (
                              <div className="flex flex-col gap-1 mt-2 p-3 bg-fuchsia-900/10 rounded-lg border border-fuchsia-500/20">
                                <label className="text-fuchsia-300/80 font-mono text-[10px] uppercase tracking-widest flex justify-between">
                                  <span>Scale Multiplier</span>
                                  <input type="number" className="bg-transparent text-right w-16 text-fuchsia-400 focus:outline-none border-b border-fuchsia-500/30" value={Number(targetItem.scale.toFixed(2))} onChange={(e) => isWall ? updateWallScale(targetItem.id, Number(e.target.value)) : updatePlaneScale(targetItem.id, Number(e.target.value))} />
                                </label>
                                <input type="range" className="w-full h-1 bg-cyan-900 rounded-lg appearance-none cursor-pointer accent-cyan-400" min="0.1" max="1000" step="1" value={targetItem.scale} onChange={(e) => isWall ? updateWallScale(targetItem.id, Number(e.target.value)) : updatePlaneScale(targetItem.id, Number(e.target.value))} />
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    <div className="h-px w-full bg-gradient-to-r from-transparent via-fuchsia-500/50 to-transparent my-2"></div>

                    <div className="flex flex-col gap-5 pb-6">
                      <h3 className="text-fuchsia-400/80 font-mono text-sm tracking-widest uppercase mb-1">Global Overrides</h3>
                      <div className="flex flex-col gap-2">
                        <label className="text-fuchsia-300/80 font-mono text-xs uppercase tracking-widest flex justify-between">
                          <span>VFX Density</span>
                          <span className="text-cyan-400 font-bold">{sandboxDensity}%</span>
                        </label>
                        <input type="range" className="w-full h-2 bg-black rounded-lg appearance-none cursor-pointer border border-cyan-500/30 accent-cyan-500" min="10" max="200" value={sandboxDensity} onChange={(e) => setSandboxDensity(Number(e.target.value))} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-fuchsia-300/80 font-mono text-xs uppercase tracking-widest flex justify-between">
                          <span>Master Orb Scale</span>
                          <span className="text-fuchsia-500 font-bold">{sandboxOrbScale.toFixed(1)}x</span>
                        </label>
                        <input type="range" className="w-full h-2 bg-black rounded-lg appearance-none cursor-pointer border border-fuchsia-500/30 accent-fuchsia-500" min="0.5" max="3" step="0.1" value={sandboxOrbScale} onChange={(e) => setSandboxOrbScale(Number(e.target.value))} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-fuchsia-300/80 font-mono text-xs uppercase tracking-widest flex justify-between">
                          <span>Space Expander</span>
                          <span className="text-purple-400 font-bold">{sandboxWallScale.toFixed(1)}x</span>
                        </label>
                        <input type="range" className="w-full h-2 bg-black rounded-lg appearance-none cursor-pointer border border-purple-500/30 accent-purple-500" min="0.5" max="5" step="0.1" value={sandboxWallScale} onChange={(e) => setSandboxWallScale(Number(e.target.value))} />
                      </div>
                    </div>
                    
                    <button onClick={saveConfigToFile} className="mt-auto bg-fuchsia-600/20 hover:bg-fuchsia-500 w-full text-white border border-fuchsia-500/50 py-4 rounded-xl font-mono text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 mb-10 shadow-[0_0_15px_rgba(255,0,255,0.1)]">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                      {isSaving ? "Publishing State..." : "Export JSON State"}
                    </button>
                </div>
              </div>
            </div>
            
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
