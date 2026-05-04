import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const FloatingSpheres: React.FC = React.memo(() => {
    const groupRef = useRef<THREE.Group>(null);
    
    // Generate random sphere positions and scale in the medium distance
    const spheres = useMemo(() => {
        const items = [];
        for (let i = 0; i < 12; i++) {
            // Medium distance: X: -300 to 300, Y: -100 to 200, Z: 200 to 400
            const x = (Math.random() - 0.5) * 800;
            const y = (Math.random() - 0.5) * 400 + 50;
            const z = Math.random() * 300 + 100;
            
            const speed = Math.random() * 0.02 + 0.005;
            const radius = (Math.random() * 4 + 2) * 5; // 5x larger
            const phaseX = Math.random() * Math.PI * 2;
            const phaseY = Math.random() * Math.PI * 2;
            
            // Cyberpunk colors: Cyan or Fuchsia
            const isCyan = Math.random() > 0.5;
            const color = isCyan 
                ? new THREE.Color(0x00ffff) 
                : new THREE.Color(0xff00ff);

            items.push({ x, y, z, speed, radius, phaseX, phaseY, color });
        }
        return items;
    }, []);

    useFrame(({ clock }) => {
        if (!groupRef.current) return;
        const time = clock.getElapsedTime();
        
        groupRef.current.children.forEach((child, index) => {
            const data = spheres[index];
            child.position.x = data.x + Math.sin(time * data.speed + data.phaseX) * 20;
            child.position.y = data.y + Math.cos(time * data.speed * 1.5 + data.phaseY) * 20;
            // slowly rotate spheres
            child.rotation.x += data.speed * 0.1;
            child.rotation.y += data.speed * 0.1;
        });
    });

    return (
        <group ref={groupRef}>
            {spheres.map((s, i) => (
                <mesh key={i} position={[s.x, s.y, s.z]}>
                    <sphereGeometry args={[s.radius, 16, 16]} />
                    <meshBasicMaterial 
                        color={s.color} 
                        transparent={true} 
                        opacity={0.15}
                        wireframe={true}
                        blending={THREE.AdditiveBlending}
                    />
                </mesh>
            ))}
        </group>
    );
});
