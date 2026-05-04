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

        const onRoomChange = (e: any) => {
            const destIndex = e.detail?.sectionIndex ?? e.detail;
            const slideIndex = e.detail?.slideIndex ?? 0;
            let tp = [0, 50, 600];
            let tl = [0, 50, 0];

            if (destIndex === 0) {
                tp = [0, 50, 600];
                tl = [0, 50, 0];
            } else if (destIndex === 1) {
                tp = [slideIndex * 200, 50, 200];   
                tl = [slideIndex * 200, 50, -500]; 
            } else if (destIndex === 2) {
                tp = [300 + (slideIndex * 350), -100 - (slideIndex * 100), -300 - (slideIndex * 250)]; 
                tl = [0, (slideIndex * -80), 0];
            } else if (destIndex === 3) {
                tp = [-500, 200, -100];
                tl = [-500, 200, -200];
            } else if (destIndex === 4) {
                tp = [500, 150, -100];
                tl = [500, 100, -500];
            } else if (destIndex === 5) {
                tp = [0, -100, 0];
                tl = [0, -100, -500];
            } else if (destIndex === 6) {
                tp = [200, 300, 400];
                tl = [0, 0, 0];
            } else if (destIndex >= 7) {
                tp = [0, 0, 800];
                tl = [0, 0, 0];
            }

            panningWorkerRef.current?.postMessage({
                type: 'SET_TARGET',
                targetPos: tp,
                targetLookAt: tl
            });
        };

        window.addEventListener('fullpage-room-change', onRoomChange);
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('fullpage-room-change', onRoomChange);
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
