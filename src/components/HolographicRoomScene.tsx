import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { AutomatedMemoryCleaner } from '../lib/AutomatedMemoryCleaner';

import { SocialIcons3D } from './SocialIcons3D';

interface HolographicRoomSceneProperties {
    aggregatedParallelDataChunksMatrix: any[];
}

export const HolographicRoomScene: React.FC<HolographicRoomSceneProperties> = ({
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

    // Fast-tracking camera target interpolators
    const targetPos = useRef(new THREE.Vector3(0, 50, 600));
    const targetLookAt = useRef(new THREE.Vector3(0, 50, 0));
    const currentLookAt = useRef(new THREE.Vector3(0, 50, 0));
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

            if (destIndex === 0) {
                targetPos.current.set(0, 50, 600);
                targetLookAt.current.set(0, 50, 0);
            } else if (destIndex === 1) {
                // Video page - move depending on slide
                targetPos.current.set(slideIndex * 200, 50, 200);   
                targetLookAt.current.set(slideIndex * 200, 50, -500); 
            } else if (destIndex === 2) {
                // Resume Breakdown Matrix - has 9 slides (index 0 to 8)
                targetPos.current.set(300 + (slideIndex * 350), -100 - (slideIndex * 100), -300 - (slideIndex * 250)); 
                targetLookAt.current.set(0, (slideIndex * -80), 0);
            } else if (destIndex === 3) {
                targetPos.current.set(-500, 200, -100); // Deep core room
                targetLookAt.current.set(-500, 200, -200);
            } else if (destIndex === 4) {
                targetPos.current.set(500, 150, -100); // Dynamic Thread Allocator Node
                targetLookAt.current.set(500, 100, -500);
            } else if (destIndex === 5) {
                targetPos.current.set(0, -100, 0); // Matrix Nexus (Underworld)
                targetLookAt.current.set(0, -100, -500);
            } else if (destIndex === 6) {
                targetPos.current.set(200, 300, 400); // Overview Deck
                targetLookAt.current.set(0, 0, 0);
            } else if (destIndex >= 7) {
                targetPos.current.set(0, 0, 800); // Data Ingestion Hub
                targetLookAt.current.set(0, 0, 0);
            }
        };

        window.addEventListener('fullpage-room-change', onRoomChange);
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('fullpage-room-change', onRoomChange);
        };
    }, [camera]);

    useFrame((state, delta) => {
        // Prevent huge delta spikes on tab switch or heavy load
        const dt = Math.min(delta, 0.1);
        
        // High-performance smooth transitions between rooms using improved lerp based on damped exponential
        // Lerping purely with a constant multiplier * delta can be jittery, we'll use a better smoothing function based on 1 - exp(-speed * dt)
        const lerpFactor = 1 - Math.exp(-4 * dt);
        camera.position.lerp(targetPos.current, lerpFactor);
        currentLookAt.current.lerp(targetLookAt.current, lerpFactor);
        camera.lookAt(currentLookAt.current);

        if (pointCloudRef.current) {
            // Subtle ambient holographic fluctuation using proper time delta
            pointCloudRef.current.rotation.y += dt * 0.05;
            const mat = pointCloudRef.current.material as THREE.PointsMaterial;
            mat.opacity = 0.7 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
        }
    });

    // Compilation Phase (Optimized)
    let massiveConcatenatedVerticesCount = 0;
    
    aggregatedParallelDataChunksMatrix.forEach(isolatedChunkMatrixData => {
        massiveConcatenatedVerticesCount += isolatedChunkMatrixData.verticesFloat32Array.length;
    });

    const monolithicVertexFloatBuffer = new Float32Array(massiveConcatenatedVerticesCount);
    const monolithicColorFloatBuffer = new Float32Array(massiveConcatenatedVerticesCount);

    let offsetTrackingIndexPointer = 0;
    for (const chunkMatrixInformation of aggregatedParallelDataChunksMatrix) {
        monolithicVertexFloatBuffer.set(chunkMatrixInformation.verticesFloat32Array, offsetTrackingIndexPointer);
        monolithicColorFloatBuffer.set(chunkMatrixInformation.colorsFloat32Array, offsetTrackingIndexPointer);
        offsetTrackingIndexPointer += chunkMatrixInformation.verticesFloat32Array.length;
    }

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
};
