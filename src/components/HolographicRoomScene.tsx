import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { AutomatedMemoryCleaner } from '../lib/AutomatedMemoryCleaner';

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
            const destIndex = e.detail;
            if (destIndex === 0) {
                targetPos.current.set(0, 50, 600);
                targetLookAt.current.set(0, 50, 0);
            } else if (destIndex === 1) {
                targetPos.current.set(0, 50, 200);   // Move inside video cluster
                targetLookAt.current.set(0, 50, -500); 
            } else if (destIndex === 2) {
                targetPos.current.set(-500, 200, -100); // Deep core room
                targetLookAt.current.set(-500, 200, -200);
            }
        };

        window.addEventListener('fullpage-room-change', onRoomChange);
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('fullpage-room-change', onRoomChange);
        };
    }, [camera]);

    useFrame((state, delta) => {
        // High-performance smooth transitions between rooms
        camera.position.lerp(targetPos.current, Math.min(delta * 4, 1));
        currentLookAt.current.lerp(targetLookAt.current, Math.min(delta * 4, 1));
        camera.lookAt(currentLookAt.current);

        if (pointCloudRef.current) {
            // Subtle ambient holographic fluctuation
            pointCloudRef.current.rotation.y += delta * 0.02;
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
    );
};
