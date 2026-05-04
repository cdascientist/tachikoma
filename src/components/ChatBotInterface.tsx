import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';

const CONFIG = {
    MOONSHOT_API_KEY: 'sk-WqE0jdy7Qw7W5EZW0Sz3PO5Q5yEfVE9o46OPm45sizTQu1j2',
    MOONSHOT_MODEL: 'moonshot-v1-8k', // using 8k model as standard fallback
    MOONSHOT_BASE_URL: 'https://api.moonshot.cn/v1',
    TTS_ENGINE: 'neural',
    TTS_VOICE: 'Joanna',
    TTS_LANGUAGE: 'en-US',
    TTS_MAX_CHARS: 3000,
    STT_LANGUAGE: 'en-US',
    AUTO_SEND_ON_RELEASE: true,
    STREAM_RESPONSE: true,
    SPEAK_ON_COMPLETE: true
};

const ParticleOrb: React.FC<{ isListening: boolean, isSpeaking: boolean }> = ({ isListening, isSpeaking }) => {
    const pointsRef = useRef<THREE.Points>(null);
    const materialRef = useRef<THREE.PointsMaterial>(null);

    const { positions, colors } = useMemo(() => {
        const count = 3000;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const radius = 2.5;

        for (let i = 0; i < count; i++) {
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = radius + (Math.random() - 0.5) * 0.5;

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);

            const mix = Math.random();
            const color = new THREE.Color();
            if (mix > 0.5) {
                color.setHex(0x00FFFF); 
            } else {
                color.setHex(0xFF00FF); 
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

            let scale = 1.0;
            if (isListening) scale = 1.0 + Math.sin(t * 10) * 0.1;
            if (isSpeaking) scale = 1.0 + Math.sin(t * 5) * 0.2;
            
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

export const ChatBotInterface: React.FC = React.memo(() => {
    const [messages, setMessages] = useState<{ role: string, content: string }[]>([]);
    const [apiKey, setApiKey] = useState(CONFIG.MOONSHOT_API_KEY);
    const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [inputText, setInputText] = useState("");
    const [statusText, setStatusText] = useState("Ready");
    const [streamingContent, setStreamingContent] = useState("");

    const currentAudioRef = useRef<any>(null);
    const recognitionRef = useRef<any>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const inputTextRef = useRef(inputText);
    const isRecordingRef = useRef(isRecording);

    useEffect(() => {
        inputTextRef.current = inputText;
    }, [inputText]);

    useEffect(() => {
        isRecordingRef.current = isRecording;
    }, [isRecording]);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages, streamingContent]);

    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.lang = CONFIG.STT_LANGUAGE;
            recognition.interimResults = true;
            recognition.continuous = false;

            recognition.onstart = () => {
                setIsRecording(true);
                setStatusText('Listening...');
            };

            recognition.onresult = (e: any) => {
                let transcript = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    transcript += e.results[i][0].transcript;
                }
                setInputText(transcript);
            };

            recognition.onerror = (e: any) => {
                console.error('STT error:', e.error);
                setIsRecording(false);
            };

            // Wrap finalizeRecording in a scope that captures the latest deps or use ref
            recognition.onend = () => {
                if (isRecordingRef.current) {
                    try { recognition.start(); } catch(e) {}
                } else {
                    const text = inputTextRef.current.trim();
                    if (text && CONFIG.AUTO_SEND_ON_RELEASE) {
                        handleSendMessage(text);
                    } else {
                        setStatusText('Ready');
                    }
                }
            };

            recognitionRef.current = recognition;
        }

        // Cleanup
        return () => {
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch(e) {}
            }
            stopSpeaking();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const cleanupSpeech = useCallback(() => {
        setIsSpeaking(false);
        currentAudioRef.current = null;
        setStatusText('Ready');
    }, []);

    const stopSpeaking = useCallback(() => {
        if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current.currentTime = 0;
        }
        cleanupSpeech();
    }, [cleanupSpeech]);

    const speakText = async (text: string) => {
        if (isSpeaking) stopSpeaking();
        if (text.length > CONFIG.TTS_MAX_CHARS) text = text.slice(0, CONFIG.TTS_MAX_CHARS);

        setIsSpeaking(true);
        setStatusText('Speaking...');
        
        try {
            const puter = (window as any).puter;
            if (!puter) throw new Error("Puter.js not loaded.");

            const audio = await puter.ai.txt2speech(text, {
                voice: CONFIG.TTS_VOICE,
                engine: CONFIG.TTS_ENGINE,
                language: CONFIG.TTS_LANGUAGE
            });

            currentAudioRef.current = audio;
            audio.addEventListener('ended', cleanupSpeech);
            audio.addEventListener('error', cleanupSpeech);

            const playPromise = audio.play();
            if (playPromise) playPromise.catch(() => cleanupSpeech());
        } catch (error) {
            console.error('TTS error:', error);
            cleanupSpeech();
        }
    };

    const getAIResponse = async (contextMessages: any[]) => {
        setStatusText('Thinking...');
        setIsStreaming(true);
        setStreamingContent("");

        try {
            const res = await fetch(`${CONFIG.MOONSHOT_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: CONFIG.MOONSHOT_MODEL,
                    messages: contextMessages,
                    stream: CONFIG.STREAM_RESPONSE,
                    temperature: 0.7
                })
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            if (!CONFIG.STREAM_RESPONSE) {
                const data = await res.json();
                return data.choices[0].message.content;
            }

            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            let fullText = '';

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (!line.trim() || line === 'data: [DONE]') continue;
                        try {
                            const data = JSON.parse(line.replace(/^data: /, ''));
                            const delta = data.choices?.[0]?.delta?.content;
                            if (delta) {
                                fullText += delta;
                                setStreamingContent(prev => prev + delta);
                            }
                        } catch (e) {}
                    }
                }
            }
            return fullText;
        } finally {
            setIsStreaming(false);
            setStreamingContent("");
            setStatusText('Ready');
        }
    };

    const handleSendMessage = async (text: string) => {
        if (!text.trim() || isProcessing) return;

        setIsProcessing(true);
        setInputText('');
        if (isSpeaking) stopSpeaking();

        const newMessages = [...messages, { role: 'user', content: text }];
        setMessages(newMessages);

        try {
            const responseText = await getAIResponse(newMessages);
            if (responseText) {
                setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
                if (CONFIG.SPEAK_ON_COMPLETE) {
                    await speakText(responseText);
                }
            }
        } catch (error: any) {
            setMessages(prev => [...prev, { role: 'assistant', content: `[Error]: ${error.message}` }]);
        } finally {
            setIsProcessing(false);
        }
    };

    const startRecording = () => {
        if (isProcessing || !recognitionRef.current) return;
        if (isSpeaking) stopSpeaking();
        try { recognitionRef.current.start(); } catch(e) {}
    };

    const stopRecording = () => {
        setIsRecording(false);
        try { recognitionRef.current.stop(); } catch(e) {}
    };

    // Keyboard escape listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isSpeaking) stopSpeaking();
                if (isRecording) stopRecording();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isSpeaking, isRecording, stopSpeaking]);

    const isBusy = isProcessing || isSpeaking;

    return (
        <div className="relative flex flex-col items-center justify-center h-full w-full max-w-3xl mx-auto pointer-events-auto p-4 pt-16">
            <div className="backdrop-blur-xl bg-black/40 border border-cyan-500/30 rounded-[3rem] p-6 md:p-8 w-full shadow-[0_0_50px_rgba(0,255,255,0.15)] flex flex-col items-center h-[80vh] max-h-[800px] relative">
                
                {/* API Key Configure Button */}
                <button 
                    onClick={() => setIsApiKeyVisible(!isApiKeyVisible)}
                    className="absolute top-4 right-6 text-xs font-mono text-cyan-400/60 hover:text-cyan-400 transition-colors flex items-center gap-1 z-10 bg-black/50 px-2 py-1 rounded-full border border-cyan-500/20 shadow-md backdrop-blur-md"
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    API KEY
                </button>

                {isApiKeyVisible && (
                    <div className="w-full bg-black/60 border border-cyan-500/40 rounded-xl p-4 mb-4 backdrop-blur-md shadow-[0_0_20px_rgba(0,255,255,0.1)] animate-in fade-in slide-in-from-top-2">
                        <p className="text-xs uppercase tracking-wider text-cyan-400 font-bold mb-2">Configure Moonshot API Key</p>
                        <input 
                            type="text" 
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="sk-..."
                            className="w-full bg-black/40 border border-cyan-500/30 rounded-lg py-2 px-3 text-cyan-50 placeholder-cyan-500/50 focus:outline-none focus:border-cyan-400 text-sm font-mono"
                        />
                        <p className="text-gray-400 text-[10px] mt-2">If you get a 401 Unauthorized error, your key might be invalid, expired, or have 0 credits. Generate a new one at <a href="https://platform.moonshot.cn" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">platform.moonshot.cn</a></p>
                    </div>
                )}

                {/* Chat Messages Area */}
                <div 
                    ref={chatContainerRef}
                    className="w-full flex-grow overflow-y-auto mb-6 flex flex-col gap-4 pr-2 custom-scrollbar"
                >
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                                msg.role === 'user' 
                                    ? 'bg-cyan-900/40 border border-cyan-500/50 text-cyan-50 rounded-br-none' 
                                    : 'bg-fuchsia-900/20 border border-fuchsia-500/30 text-fuchsia-50 rounded-bl-none'
                            }`}>
                                <p className="text-sm md:text-base font-mono whitespace-pre-wrap">{msg.content}</p>
                            </div>
                        </div>
                    ))}
                    {isStreaming && (
                        <div className="flex justify-start">
                            <div className="max-w-[80%] rounded-2xl px-5 py-3 bg-fuchsia-900/20 border border-fuchsia-500/30 text-fuchsia-50 rounded-bl-none">
                                <p className="text-sm md:text-base font-mono whitespace-pre-wrap">
                                    {streamingContent}
                                    <span className="animate-pulse text-fuchsia-400">▋</span>
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="w-full flex flex-col items-center gap-4">
                    <div className="h-[2rem] flex items-center justify-center w-full">
                        <p className={`text-sm md:text-base font-mono transition-opacity duration-300 text-center ${isRecording ? 'text-cyan-400 opacity-100 animate-pulse' : 'text-gray-400 opacity-70'}`}>
                            {statusText}
                        </p>
                    </div>

                    <div className="flex items-center gap-4 w-full">
                        {/* PTT Orb */}
                        <div 
                            className={`w-16 h-16 md:w-20 md:h-20 flex-shrink-0 cursor-pointer relative rounded-full overflow-hidden transition-transform duration-200 ${isRecording ? 'scale-90' : 'hover:scale-105'} ${isBusy ? 'opacity-50 pointer-events-none' : ''}`}
                            onMouseDown={(e) => { e.preventDefault(); startRecording(); }}
                            onMouseUp={(e) => { e.preventDefault(); stopRecording(); }}
                            onMouseLeave={(e) => { if (isRecording) stopRecording(); }}
                            onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                            onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
                            onContextMenu={(e) => e.preventDefault()}
                        >
                            <Canvas camera={{ position: [0, 0, 8], fov: 60 }} className="w-full h-full pointer-events-none">
                                <ambientLight intensity={1} />
                                <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
                                    <ParticleOrb isListening={isRecording} isSpeaking={isSpeaking} />
                                </Float>
                            </Canvas>
                            <div className={`absolute inset-0 rounded-full transition-shadow duration-300 pointer-events-none ${isRecording ? 'shadow-[inset_0_0_30px_rgba(0,255,255,0.8)] bg-red-500/20' : 'shadow-[inset_0_0_20px_rgba(255,0,255,0.4)]'}`}></div>
                        </div>

                        <div className="relative flex-grow">
                            <input 
                                type="text" 
                                placeholder={isRecording ? "Listening..." : "Type a message..."} 
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onFocus={() => { if (isSpeaking) stopSpeaking(); }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage(inputText);
                                    }
                                }}
                                disabled={isProcessing}
                                className="w-full bg-black/40 border border-cyan-500/30 rounded-2xl py-3 px-4 pr-12 text-cyan-50 placeholder-cyan-500/50 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_15px_rgba(0,255,255,0.3)] transition-all font-mono disabled:opacity-50"
                            />
                            <button 
                                onClick={() => handleSendMessage(inputText)}
                                disabled={isProcessing || !inputText.trim()}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-cyan-400 hover:text-white transition-colors disabled:opacity-30 disabled:hover:text-cyan-400"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

