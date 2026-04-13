import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Settings2, Play, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, PillButton } from "@/components/ui/core";
import { api } from "@/lib/api";

export default function SandboxPage() {
  const [googleKey, setGoogleKey] = useState("");
  const [model, setModel] = useState("models/gemini-2.5-flash-native-audio-latest");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful voice assistant.");
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const playbackTimeRef = useRef(0);

  useEffect(() => {
    // Load config on mount
    api.get("/api/wizard/load-config")
      .then(res => {
        if (res.data?.google_key) setGoogleKey(res.data.google_key);
      })
      .catch(() => console.warn("Failed to load google_key."));
  }, []);

  const connect = async () => {
    if (!googleKey) {
      toast.error("Google API Key is missing. Please save it in the Setup Wizard.");
      return;
    }

    setIsConnecting(true);
    try {
      // 1. Setup Audio Context
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      playbackTimeRef.current = audioCtx.currentTime;

      // 2. Setup Mic
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      streamRef.current = stream;

      // 3. Connect WebSocket
      // Connect to the backend proxy to bypass potential browser/network restrictions
      const cleanKey = googleKey.trim();
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wssUrl = `${protocol}//${host}/api/sandbox-ws?key=${cleanKey}`;
      const ws = new WebSocket(wssUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send internal setup
        const setupMsg = {
          setup: {
            model: model,
            generationConfig: {
              responseModalities: ["AUDIO"]
            },
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            }
          }
        };
        ws.send(JSON.stringify(setupMsg));
      };

      const handleMessage = (raw) => {
        try {
          let data;
          if (typeof raw === 'string') {
            data = JSON.parse(raw);
          } else {
            // Binary from Google — decode as UTF-8 text then parse
            const text = new TextDecoder('utf-8').decode(raw);
            data = JSON.parse(text);
          }
          
          // Debug: log all incoming messages
          console.log("[Gemini Live] msg:", JSON.stringify(data).slice(0, 200));

          // setupComplete can arrive as top-level key or nested
          const isSetupComplete = !!(
            data.setupComplete ||
            data.setup_complete ||
            data.serverContent?.setupComplete
          );
          
          if (isSetupComplete) {
            console.log("[Gemini Live] setupComplete received — starting mic");
            setIsConnected(true);
            setIsConnecting(false);
            toast.success("Connected to Gemini Live!");
            startRecording(audioCtxRef.current, streamRef.current, wsRef.current);
          }

          if (data.serverContent?.modelTurn?.parts) {
            for (const part of data.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                playAudioChunk(part.inlineData.data);
              }
            }
          }
        } catch (err) {
          console.error("Message parse error", err, raw);
        }
      };

      ws.onmessage = (event) => {
        if (event.data instanceof Blob) {
          event.data.arrayBuffer().then(buf => handleMessage(new Uint8Array(buf)));
        } else {
          handleMessage(event.data);
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket Error: ", err);
      };

      ws.onclose = (e) => {
        console.log(`[Gemini Live] closed code=${e.code} reason=${e.reason}`);
        if (isConnected) {
          toast.info(`Disconnected from Gemini Live. Code: ${e.code}`);
        } else {
          toast.error(`Connection failed: Code ${e.code}. Reason: ${e.reason || "None"}`);
        }
        disconnect();
      };

    } catch (err) {
      console.error(err);
      toast.error("Failed to connect: " + err.message);
      disconnect();
    }
  };

  const startRecording = (audioCtx, stream, ws) => {
    const source = audioCtx.createMediaStreamSource(stream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (isMuted) return; // Note: isMuted is checked from state, but this closure captured old state. We'll fix this below.

      const channelData = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
         pcm16[i] = Math.max(-1, Math.min(1, channelData[i])) * 32767;
      }
      
      const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
      ws.send(JSON.stringify({
        realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: base64 }] }
      }));
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);
    
    // Save refs for cleanup
    processorRef.current = { source, processor };
  };

  const playAudioChunk = (base64) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    // Decode base64 
    const binary = atob(base64);
    const uint8 = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      uint8[i] = binary.charCodeAt(i);
    }
    
    const int16 = new Int16Array(uint8.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
       float32[i] = int16[i] / 32768.0;
    }
    
    // Gemini Live audio is 24kHz
    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);
    
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    if (playbackTimeRef.current < ctx.currentTime) {
       playbackTimeRef.current = ctx.currentTime;
    }
    source.start(playbackTimeRef.current);
    playbackTimeRef.current += audioBuffer.duration;
  };

  const disconnect = () => {
    setIsConnecting(false);
    setIsConnected(false);
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.source.disconnect();
      processorRef.current.processor.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  };

  // Mute toggle needs to rely on a ref because the audio processor closure captures the initial state
  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);
  
  // Since we use the ref in the inner function, we need to bind it properly:
  useEffect(() => {
    if (processorRef.current) {
       processorRef.current.processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        if (isMutedRef.current) return;
  
        const channelData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(channelData.length);
        for (let i = 0; i < channelData.length; i++) {
           pcm16[i] = Math.max(-1, Math.min(1, channelData[i])) * 32767;
        }
        
        const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
        wsRef.current.send(JSON.stringify({
          realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: base64 }] }
        }));
      };
    }
  }, [isConnected]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-clash-display text-4xl font-bold uppercase">Gemini Live Sandbox</h1>
        <p className="mt-2 text-[#666666]">
          Тестовое окружение для Gemini Live. Настройте параметры и начните разговор в реальном времени.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6 rounded-[28px]">
          <div className="mb-4 flex items-center gap-2 text-[#838282]">
            <Settings2 size={16} />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em]">Config</h2>
          </div>
          
          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#838282]">Model</span>
              <select 
                value={model} 
                onChange={e => setModel(e.target.value)}
                disabled={isConnected || isConnecting}
                className="w-full border border-[#111111]/10 bg-white px-4 py-3 text-sm outline-none rounded-2xl"
              >
                <option value="models/gemini-2.5-flash-native-audio-latest">gemini-2.5-flash-native-audio</option>
                <option value="models/gemini-2.0-flash-exp">gemini-2.0-flash-exp (legacy)</option>
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#838282]">System Prompt</span>
              <textarea 
                value={systemPrompt} 
                onChange={e => setSystemPrompt(e.target.value)}
                disabled={isConnected || isConnecting}
                rows={4}
                className="w-full border border-[#111111]/10 bg-white px-4 py-3 text-sm outline-none rounded-2xl resiz-none"
              />
            </label>
          </div>
        </Card>

        <Card className="flex flex-col items-center justify-center p-6 rounded-[28px] text-center">
          <div className="mb-8">
            <div className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full transition-all ${isConnected ? 'bg-emerald-500/10 text-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.3)]' : 'bg-[#111111]/5 text-[#838282]'}`}>
              {isConnecting ? (
                <Loader2 size={40} className="animate-spin" />
              ) : isConnected ? (
                isMuted ? <MicOff size={40} /> : <Mic size={40} />
              ) : (
                <Square size={40} />
              )}
            </div>
            <p className="mt-4 font-bold uppercase tracking-[0.2em] text-sm text-[#838282]">
              {isConnecting ? "Connecting..." : isConnected ? (isMuted ? "Muted" : "Listening...") : "Ready to connect"}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            {!isConnected && !isConnecting ? (
              <PillButton onClick={connect} className="flex items-center gap-2">
                <Play size={16} /> <span>Connect</span>
              </PillButton>
            ) : (
              <>
                <PillButton 
                  onClick={() => setIsMuted(!isMuted)} 
                  variant={isMuted ? "solid" : "default"}
                  className="flex items-center gap-2"
                >
                  {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                  <span>{isMuted ? "Unmute" : "Mute"}</span>
                </PillButton>
                
                <PillButton 
                  onClick={disconnect}
                  className="flex items-center gap-2 !border-red-500 !text-red-500 hover:!bg-red-500 hover:!text-white"
                >
                  <Square size={16} /> <span>Disconnect</span>
                </PillButton>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
