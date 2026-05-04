import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { AutomatedMemoryCleaner } from '../lib/AutomatedMemoryCleaner';

import { SocialIcons3D } from './SocialIcons3D';
import { workerCode } from '../workers/PanningWorker';

interface HolographicRoomSceneProperties {
    aggregatedParallelDataChunksMatrix: any[];
}

export const HolographicRoomScene: React.FC<HolographicRoomSceneProperties> = React.memo(({
    aggregatedParallelDataChunksMatrix
}) => {
    const { camera, gl } = useThree();
    
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
                tp = [-150, 100, 300];
                tl = [-150, 50, -100];
            } else if (destIndex === 2) { // Video
                tp = [slideIndex * 200, 50, 200];   
                tl = [slideIndex * 200, 50, -500]; 
            } else if (destIndex === 3) { // Gesture Interactive Background
                tp = [0, 150, 100];
                tl = [0, 150, -200];
            } else if (destIndex === 4) { // Infrastructure Explanation
                tp = [-500, 200, -100];
                tl = [-500, 200, -200];
            } else if (destIndex === 5) { // Resume
                tp = [300 + (slideIndex * 350), -100 - (slideIndex * 100), -300 - (slideIndex * 250)]; 
                tl = [0, (slideIndex * -80), 0];
            } else if (destIndex === 6) { // Dynamic Thread
                tp = [500, 150, -100];
                tl = [500, 100, -500];
            } else if (destIndex === 7) { // Nexus
                tp = [0, -100, 0];
                tl = [0, -100, -500];
            } else if (destIndex >= 8) { // End hub
                tp = [200, 300, 400]; 
                tl = [0, 0, 0];
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
            // Only strictly override manual panning for Room 3
            if (currentRoomDest === 3) {
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
            if (currentRoomDest === 3) {
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

        if (pointCloudRef.current) {
            pointCloudRef.current.rotation.y += delta * 0.05;
            const mat = pointCloudRef.current.material as THREE.PointsMaterial;
            mat.opacity = 0.7 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
        }
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

    return (
        <group>
            <ambientLight intensity={1.5} />
            <directionalLight position={[10, 20, 10]} intensity={2} />
            <points ref={pointCloudRef}>
                <bufferGeometry>
                    <bufferAttribute
                        attach="attributes-position"
                        count={massiveConcatenatedVerticesCount / 3}
                        array={monolithicVertexFloatBuffer}
                        itemSize={3}
                    />
                    <bufferAttribute
                        attach="attributes-color"
                        count={massiveConcatenatedVerticesCount / 3}
                        array={monolithicColorFloatBuffer}
                        itemSize={3}
                    />
                </bufferGeometry>
                {/* Tron-style AdditiveBlending Material optimized for 70 fps */}
                <pointsMaterial
                    size={0.15}
                    vertexColors={true}
                    transparent={true}
                    opacity={0.9}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    sizeAttenuation={true}
                />
            </points>
            <SocialIcons3D />
        </group>
    );
});
