import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';

const ParticleOrb: React.FC<{ isListening: boolean }> = ({ isListening }) => {
    const pointsRef = useRef<THREE.Points>(null);
    const materialRef = useRef<THREE.PointsMaterial>(null);

    // Create an orb out of particles
    const { positions, colors } = useMemo(() => {
        const count = 3000;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const radius = 2.5;

        for (let i = 0; i < count; i++) {
            // spherical distribution
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(2 * Math.random() - 1);
            
            // Add some noise to the radius
            const r = radius + (Math.random() - 0.5) * 0.5;

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);

            // Tech cyan/fuchsia colors
            const mix = Math.random();
            const color = new THREE.Color();
            if (mix > 0.5) {
                color.setHex(0x00FFFF); // Cyan
            } else {
                color.setHex(0xFF00FF); // Fuchsia
            }
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        return { positions, colors };
    }, []);

    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        if (pointsRef.current) {
            pointsRef.current.rotation.y = t * 0.5;
            pointsRef.current.rotation.x = t * 0.2;

            // Pulse effect when listening
            const scale = isListening ? 1.0 + Math.sin(t * 10) * 0.1 : 1.0;
            pointsRef.current.scale.set(scale, scale, scale);
        }
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial
                ref={materialRef}
                size={0.1}
                vertexColors={true}
                transparent={true}
                opacity={0.8}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                sizeAttenuation={true}
            />
        </points>
    );
};

export const ChatBotInterface: React.FC = () => {
    const [isListening, setIsListening] = useState(false);

    return (
        <div className="relative flex flex-col items-center justify-center h-full w-full max-w-2xl mx-auto pointer-events-auto p-4">
            <div className="backdrop-blur-xl bg-black/40 border border-cyan-500/30 rounded-[3rem] p-6 md:p-10 w-full shadow-[0_0_50px_rgba(0,255,255,0.15)] flex flex-col items-center">
                
                <div className="w-48 h-48 md:w-64 md:h-64 cursor-pointer relative" onClick={() => setIsListening(!isListening)}>
                    <Canvas camera={{ position: [0, 0, 8], fov: 60 }} className="w-full h-full pointer-events-none">
                        <ambientLight intensity={1} />
                        <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
                            <ParticleOrb isListening={isListening} />
                        </Float>
                    </Canvas>
                    {/* Inner glow effect */}
                    <div className={`absolute inset-0 rounded-full transition-shadow duration-300 pointer-events-none mx-auto auto-m ${isListening ? 'shadow-[inset_0_0_50px_rgba(0,255,255,0.5)]' : 'shadow-[inset_0_0_20px_rgba(255,0,255,0.2)]'}`}></div>
                </div>

                <div className="mt-8 w-full">
                    <div className="min-h-[2rem] flex items-center justify-center mb-4">
                        <p className={`text-sm md:text-base font-mono transition-opacity duration-300 text-center ${isListening ? 'text-cyan-400 opacity-100 animate-pulse' : 'text-gray-400 opacity-70'}`}>
                            {isListening ? "Listening... Speak now." : "Press the orb to initialize voice communication, or type below."}
                        </p>
                    </div>
                    
                    <div className="relative w-full">
                        <input 
                            type="text" 
                            placeholder="Type a message..." 
                            className="w-full bg-black/40 border border-cyan-500/30 rounded-2xl py-3 px-4 pr-12 text-cyan-50 placeholder-cyan-500/50 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_15px_rgba(0,255,255,0.3)] transition-all font-mono"
                        />
                        <button className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-cyan-400 hover:text-white transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
