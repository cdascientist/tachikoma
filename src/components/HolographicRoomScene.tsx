import { ParticleWall } from './ParticleWall';
import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { AutomatedMemoryCleaner } from '../lib/AutomatedMemoryCleaner';

import { SocialIcons3D } from './SocialIcons3D';
import { HugeParticleOrb } from './HugeParticleOrb';
import { workerCode } from '../workers/PanningWorker';

interface HolographicRoomSceneProperties {
    aggregatedParallelDataChunksMatrix: any[];
    sandboxDensity?: number;
    sandboxOrbScale?: number;
    sandboxWallScale?: number;
    wallsConfig?: any[];
    orbPositions?: [number, number, number][];
    activeRoomIndex?: number;
    selectedElementId?: string;
    onElementPositionChange?: (id: string, pos: [number, number, number]) => void;
    onElementSelect?: (id: string) => void;
}

export const HolographicRoomScene: React.FC<HolographicRoomSceneProperties> = React.memo(({
    aggregatedParallelDataChunksMatrix,
    sandboxDensity = 100,
    sandboxOrbScale = 1,
    sandboxWallScale = 1,
    wallsConfig = [],
    orbPositions,
    activeRoomIndex = 0,
    selectedElementId = "",
    onElementPositionChange,
    onElementSelect
}) => {
    const { camera, gl } = useThree();
    
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

    useEffect(() => {
        const handleListening = (e: any) => setIsListening(e.detail);
        const handleSpeaking = (e: any) => setIsSpeaking(e.detail);
        window.addEventListener('chatbot-listening', handleListening);
        window.addEventListener('chatbot-speaking', handleSpeaking);
        return () => {
            window.removeEventListener('chatbot-listening', handleListening);
            window.removeEventListener('chatbot-speaking', handleSpeaking);
        };
    }, []);
    
    // Memory Optimization: Register webgl cleanup
    useEffect(() => {
        AutomatedMemoryCleaner.registerCleanupTask(() => {
            if (gl.info.memory.textures > 50) { 
                gl.clear(); 
            }
        });
    }, [gl]);

    // Use Web Workers for purely offloaded high-performance camera panning and interpolations
    const panningWorkerRef = useRef<Worker | null>(null);
    const workerCameraPos = useRef(new THREE.Vector3(0, 50, 600));
    const workerLookAt = useRef(new THREE.Vector3(0, 50, 0));

    useEffect(() => {
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const worker = new Worker(url);
        panningWorkerRef.current = worker;

        worker.onmessage = (e) => {
            if (e.data.type === 'TICK_RESULT') {
                workerCameraPos.current.set(e.data.currentPos[0], e.data.currentPos[1], e.data.currentPos[2]);
                workerLookAt.current.set(e.data.currentLookAt[0], e.data.currentLookAt[1], e.data.currentLookAt[2]);
            }
        };

        return () => {
             worker.terminate();
             URL.revokeObjectURL(url);
        };
    }, []);

    const pointCloudRef = useRef<THREE.Points>(null);

    useEffect(() => {
        const handleResize = () => {
            if (camera instanceof THREE.PerspectiveCamera) {
                camera.fov = window.innerWidth < 768 ? 100 : 75;
                camera.updateProjectionMatrix();
            }
        };
        window.addEventListener('resize', handleResize);
        handleResize(); // trigger immediately

        let currentRoomDest = 0;
        let baseTp = [0, 50, 600];
        let baseTl = [0, 50, 0];

        const onRoomChange = (e: any) => {
            const destIndex = e.detail?.sectionIndex ?? e.detail;
            const slideIndex = e.detail?.slideIndex ?? 0;
            currentRoomDest = destIndex;
            let tp = [0, 50, 600];
            let tl = [0, 50, 0];

            if (destIndex === 0) { // Landing
                tp = [0, 50, 600];
                tl = [0, 50, 0];
            } else if (destIndex === 1) { // ChatBot
                tp = [-150, 50, 400];
                tl = [-150, 50, 0];
            } else if (destIndex === 2) { // Particle Sandbox
                // Moved further back so we can see the cloud and all orbs
                tp = [0, 800, 2500]; 
                tl = [0, 100, 0];
            } else if (destIndex === 3) { // Video
                tp = [200 + (slideIndex * 50), 50, 400];   
                tl = [200 + (slideIndex * 50), 50, 0]; 
            } else if (destIndex === 4) { // Architecture
                tp = [400, 50, 450];
                tl = [400, 50, -50];
            } else if (destIndex === 5) { // Resume
                tp = [-400, 50, 450]; 
                tl = [-400, 50, -50];
            } else if (destIndex === 6) { // Dynamic Thread
                tp = [600, 50, 500];
                tl = [600, 50, -100];
            } else if (destIndex === 7) { // Nexus
                tp = [-600 + (slideIndex * 100), 50, 500];
                tl = [-600 + (slideIndex * 100), 50, -100];
            } else if (destIndex === 8) { // Global Canvas Delegation
                tp = [800, 50, 600]; 
                tl = [800, 50, -150];
            } else if (destIndex >= 9) { // Data Ingestion
                tp = [-800, 50, 600]; 
                tl = [-800, 50, -150];
            }

            baseTp = [...tp];
            baseTl = [...tl];

            panningWorkerRef.current?.postMessage({
                type: 'SET_TARGET',
                targetPos: tp,
                targetLookAt: tl
            });
        };

        const onPan = (e: any) => {
            // Only strictly override manual panning for Room 0 (Landing)
            if (currentRoomDest === 0) {
                const { deltaX, deltaY, type } = e.detail;
                // Move position horizontally/vertically based on touch delta
                const panFactor = 0.5;
                const newTp = [baseTp[0] - deltaX * panFactor, baseTp[1] + deltaY * panFactor, baseTp[2]];
                const newTl = [baseTl[0] - deltaX * panFactor * 0.5, baseTl[1] + deltaY * panFactor * 0.5, baseTl[2]];
                
                panningWorkerRef.current?.postMessage({
                    type: 'SET_TARGET',
                    targetPos: newTp,
                    targetLookAt: newTl
                });

                if (type === 'panend' || type === 'panstart' && e.detail.isFinal) {
                    baseTp = [...newTp];
                    baseTl = [...newTl];
                }
            }
        };

        const onDoubleTap = (e: any) => {
            if (currentRoomDest === 0) {
                // Zoom forward into the holographic space
                const zoomFactor = 100;
                baseTp[2] -= zoomFactor;
                baseTl[2] -= zoomFactor;

                panningWorkerRef.current?.postMessage({
                    type: 'SET_TARGET',
                    targetPos: baseTp,
                    targetLookAt: baseTl
                });
            }
        };

        window.addEventListener('fullpage-room-change', onRoomChange);
        window.addEventListener('hammer-pan', onPan);
        window.addEventListener('hammer-doubletap', onDoubleTap);
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('fullpage-room-change', onRoomChange);
            window.removeEventListener('hammer-pan', onPan);
            window.removeEventListener('hammer-doubletap', onDoubleTap);
        };
    }, [camera]);

    useFrame((state, delta) => {
        // Send a tick to the worker to calculate next frame panning positions
        panningWorkerRef.current?.postMessage({
            type: 'TICK',
            delta: delta
        });

        // Main thread only applies the calculated transformations (offloaded panning)
        camera.position.copy(workerCameraPos.current);
        camera.lookAt(workerLookAt.current);

        // removed legacy pointCloud rotation logic
    });

    // Compilation Phase (Optimized with useMemo to prevent per-frame jitter)
    const { monolithicVertexFloatBuffer, monolithicColorFloatBuffer, massiveConcatenatedVerticesCount } = React.useMemo(() => {
        let count = 0;
        aggregatedParallelDataChunksMatrix.forEach(isolatedChunkMatrixData => {
            count += isolatedChunkMatrixData.verticesFloat32Array.length;
        });

        const vertexBuffer = new Float32Array(count);
        const colorBuffer = new Float32Array(count);

        let offset = 0;
        for (const chunk of aggregatedParallelDataChunksMatrix) {
            vertexBuffer.set(chunk.verticesFloat32Array, offset);
            colorBuffer.set(chunk.colorsFloat32Array, offset);
            offset += chunk.verticesFloat32Array.length;
        }

        return {
            monolithicVertexFloatBuffer: vertexBuffer,
            monolithicColorFloatBuffer: colorBuffer,
            massiveConcatenatedVerticesCount: count
        };
    }, [aggregatedParallelDataChunksMatrix]);

    // removed legacy useEffect for single wall

    const [isPlacing, setIsPlacing] = useState(false);

    const handleElementClick = (id: string) => {
        if (activeRoomIndex !== 2) return;
        if (selectedElementId === id) {
            setIsPlacing((prev) => !prev);
        } else {
            if (onElementSelect) onElementSelect(id);
            setIsPlacing(true);
        }
    };

    const handlePlanePointerMove = (e: any) => {
        if (activeRoomIndex !== 2 || !isPlacing || !selectedElementId || !onElementPositionChange) return;
        
        let currentY = 50;
        if (selectedElementId.startsWith("orb") && orbPositions) {
            const idxStr = selectedElementId.replace("orb_", "");
            const idx = parseInt(idxStr, 10);
            if (!isNaN(idx) && orbPositions[idx]) {
                currentY = orbPositions[idx][1];
            }
        } else if (selectedElementId.startsWith("wall")) {
            const wall = wallsConfig.find(w => w.id === selectedElementId);
            if (wall) {
                currentY = wall.position[1];
            }
        }

        if (e.point) {
            onElementPositionChange(selectedElementId, [e.point.x, currentY, e.point.z]);
        }
    };

    const handlePlaneClick = (e: any) => {
        if (activeRoomIndex !== 2 || !isPlacing || !selectedElementId || !onElementPositionChange) return;
        
        let currentY = 50;
        if (selectedElementId.startsWith("orb") && orbPositions) {
            const idxStr = selectedElementId.replace("orb_", "");
            const idx = parseInt(idxStr, 10);
            if (!isNaN(idx) && orbPositions[idx]) {
                currentY = orbPositions[idx][1];
            }
        } else if (selectedElementId.startsWith("wall")) {
            const wall = wallsConfig.find(w => w.id === selectedElementId);
            if (wall) {
                currentY = wall.position[1];
            }
        }

        if (e.point) {
            onElementPositionChange(selectedElementId, [e.point.x, currentY, e.point.z]);
            setIsPlacing(false);
            e.stopPropagation();
        }
    };
    
    // ... Inside the render block, find <points ref={pointCloudRef}> and wrap it with <group>
    // Wait, let's just replace the orbs block
    
    return (
        <group>
            <ambientLight intensity={1.5} />
            <directionalLight position={[10, 20, 10]} intensity={2} />
            
            {/* Background Plane for Dragging Interaction */
             activeRoomIndex === 2 && (
                <mesh 
                    position={[0, 50, 0]} 
                    rotation={[-Math.PI / 2, 0, 0]} 
                    onPointerMove={handlePlanePointerMove} 
                    onClick={handlePlaneClick}
                >
                    <planeGeometry args={[10000, 10000]} />
                    <meshBasicMaterial transparent opacity={0.0} colorWrite={false} depthWrite={false} />
                </mesh>
            )}

            {wallsConfig.map((wall) => (
                <ParticleWall 
                    key={wall.id}
                    position={wall.position}
                    scale={wall.scale}
                    baseScale={sandboxWallScale}
                    density={sandboxDensity}
                    monolithicVertexFloatBuffer={monolithicVertexFloatBuffer}
                    monolithicColorFloatBuffer={monolithicColorFloatBuffer}
                    massiveConcatenatedVerticesCount={massiveConcatenatedVerticesCount}
                    isHighlighted={selectedElementId === wall.id}
                    onClick={() => handleElementClick(wall.id)}
                />
            ))}
            
            {orbPositions && orbPositions.map((pos, index) => {
                const isCyan = index === 0 || index === 2 || index === 3 || index === 5 || index === 6 || index === 7 || index >= 9;
                const scale = index === 1 || index === 5 ? 1.5 : (index === 2 ? 2.5 : (index === 8 ? 1.8 : (index === 3 || index === 6 ? 1.2 : 1.0)));
                return (
                    <HugeParticleOrb 
                        key={index}
                        position={pos}
                        isListening={index === 1 ? isListening : false}
                        isSpeaking={index === 1 ? isSpeaking : false}
                        isCyanDominant={isCyan}
                        offsetScale={scale * sandboxOrbScale}
                        onClick={() => handleElementClick(`orb_${index}`)}
                        isHighlighted={selectedElementId === `orb_${index}`}
                    />
                );
            })}

            <SocialIcons3D />
        </group>
    );
});
