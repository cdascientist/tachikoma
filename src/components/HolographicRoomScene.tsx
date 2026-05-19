import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { AutomatedMemoryCleaner } from '../lib/AutomatedMemoryCleaner';
import { SocialIcons3D } from './SocialIcons3D';

interface HolographicRoomSceneProperties {
    aggregatedParallelDataChunksMatrix: any[];
    activeRoomIndex?: number;
}

export const HolographicRoomScene: React.FC<HolographicRoomSceneProperties> = React.memo(({
    aggregatedParallelDataChunksMatrix,
    activeRoomIndex = 0,
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

    // Smooth main-thread camera pan state
    const targetCameraPos = useRef(new THREE.Vector3(0, 50, 600));
    const targetLookAt = useRef(new THREE.Vector3(0, 50, 0));
    const currentLookAt = useRef(new THREE.Vector3(0, 50, 0));

    // Journey mode
    const journeySequence = useRef<{pos: number[], look: number[]}[]>([]);

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

            if (destIndex === 0) { // Chat
                tp = [0, 50, 600];
                tl = [0, 50, 0];
            } else if (destIndex === 1) { // Gesture
                tp = [0, 800, 1800];
                tl = [0, 100, -200];
            } else if (destIndex === 2) { // Agent Config
                tp = [600, 50, 450];
                tl = [600, 50, -100];
            }

            baseTp = [...tp];
            baseTl = [...tl];

            targetCameraPos.current.set(tp[0], tp[1], tp[2]);
            targetLookAt.current.set(tl[0], tl[1], tl[2]);
        };

        const onPan = (e: any) => {
            if (currentRoomDest === 0) {
                const { deltaX, deltaY, type } = e.detail;
                const panFactor = 0.5;
                const newTp = [baseTp[0] - deltaX * panFactor, baseTp[1] + deltaY * panFactor, baseTp[2]];
                const newTl = [baseTl[0] - deltaX * panFactor * 0.5, baseTl[1] + deltaY * panFactor * 0.5, baseTl[2]];

                targetCameraPos.current.set(newTp[0], newTp[1], newTp[2]);
                targetLookAt.current.set(newTl[0], newTl[1], newTl[2]);

                if (type === 'panend' || type === 'panstart' && e.detail.isFinal) {
                    baseTp = [...newTp];
                    baseTl = [...newTl];
                }
            }
        };

        const onDoubleTap = (e: any) => {
            if (currentRoomDest === 0) {
                journeySequence.current = [
                    { pos: [0, 800, 1000], look: [0, 100, -200] },
                    { pos: [600, 50, 0], look: [600, 50, -100] },
                    { pos: [0, 50, 600], look: [0, 50, 0] }
                ];

                const nextStop = journeySequence.current.shift()!;
                targetCameraPos.current.set(nextStop.pos[0], nextStop.pos[1], nextStop.pos[2]);
                targetLookAt.current.set(nextStop.look[0], nextStop.look[1], nextStop.look[2]);
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
        const safeDelta = Math.min(delta, 0.1);
        const lerpFactor = 1 - Math.exp(-6 * safeDelta);

        if (journeySequence.current.length > 0) {
            if (camera.position.distanceTo(targetCameraPos.current) < 50 && currentLookAt.current.distanceTo(targetLookAt.current) < 50) {
                const nextStop = journeySequence.current.shift()!;
                targetCameraPos.current.set(nextStop.pos[0], nextStop.pos[1], nextStop.pos[2]);
                targetLookAt.current.set(nextStop.look[0], nextStop.look[1], nextStop.look[2]);
            }
        }

        camera.position.lerp(targetCameraPos.current, lerpFactor);
        currentLookAt.current.lerp(targetLookAt.current, lerpFactor);
        camera.lookAt(currentLookAt.current);
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

            {/* Point cloud rendering */}
            {massiveConcatenatedVerticesCount > 0 && (
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
                    <pointsMaterial
                        size={8}
                        vertexColors={true}
                        transparent
                        opacity={0.8}
                        sizeAttenuation={true}
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                    />
                </points>
            )}

            <SocialIcons3D />
        </group>
    );
});
