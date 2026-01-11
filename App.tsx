
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";

// --- Types ---
interface EncounterData {
  enemyName: string;
  flavorText: string;
  attackDescription: string;
  stats: { ATK: number; DEF: number; HP: number };
}

type BattleState = 'START' | 'PLAYER_MENU' | 'FIGHT_TARGET' | 'ACTION_DIALOGUE' | 'ENEMY_TURN' | 'GAME_OVER' | 'VICTORY' | 'SPARED';

type AttackType = 'VOID_FALL' | 'ORBIT_CLOSE' | 'RANDOM_BARRAGE' | 'KNIFE_STRIKE';

interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  type: 'glitch' | 'spear' | 'bone' | 'knife';
  rotation: number;
  isReady?: boolean;
}

// --- Visual Components ---

const SoulSprite: React.FC<{ x: number; y: number; isHurt: boolean }> = ({ x, y, isHurt }) => (
  <div 
    className={`absolute pointer-events-none transition-transform duration-75 z-50 ${isHurt ? 'animate-shake scale-125' : ''}`}
    style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
  >
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" 
        fill={isHurt ? "#ffffff" : "#ff0000"} 
        stroke="white" 
        strokeWidth="1.5"
      />
    </svg>
  </div>
);

const AttackSprite: React.FC<{ type: string; size: number; isReady?: boolean }> = ({ type, size, isReady = true }) => {
  if (type === 'bone') {
    return (
      <svg width={size} height={size * 2} viewBox="0 0 20 40" fill="white">
        <rect x="7" y="5" width="6" height="30" />
        <circle cx="6" cy="5" r="4" />
        <circle cx="14" cy="5" r="4" />
        <circle cx="6" cy="35" r="4" />
        <circle cx="14" cy="35" r="4" />
      </svg>
    );
  }
  if (type === 'spear') {
    return (
      <svg width={size} height={size * 2.5} viewBox="0 0 20 50" fill="none">
        <path d="M10 0L20 15H13V50H7V15H0L10 0Z" fill="#00ffff" />
        <path d="M10 5L15 14H12V45H8V14H5L10 5Z" fill="white" opacity="0.5" />
      </svg>
    );
  }
  if (type === 'knife') {
    return (
      <svg width={size} height={size * 2} viewBox="0 0 24 48" fill="none">
        <path d="M12 0C12 0 18 10 18 20V40H6V20C6 10 12 0 12 0Z" fill={isReady ? "#ff0000" : "#ffffff"} stroke="white" strokeWidth="2" />
        <rect x="9" y="40" width="6" height="8" fill="#888" />
        <rect x="6" y="38" width="12" height="4" fill="#555" />
      </svg>
    );
  }
  return ( // glitch
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#ff0000">
      <path d="M12 2L15 9H22L16 14L18 21L12 17L6 21L8 14L2 9H9L12 2Z" />
      <rect x="4" y="4" width="4" height="4" fill="#00ffff" opacity="0.5" className="animate-pulse" />
      <rect x="16" y="16" width="4" height="4" fill="#ff00ff" opacity="0.5" className="animate-pulse" />
    </svg>
  );
};

const BulletHell: React.FC<{ onHit: () => void; onEnd: () => void; attackType: AttackType }> = ({ onHit, onEnd, attackType }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [soulPos, setSoulPos] = useState({ x: 50, y: 50 });
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const startTime = useRef(Date.now());
  const lastSpawnTime = useRef(0);

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    let x = ((clientX - rect.left) / rect.width) * 100;
    let y = ((clientY - rect.top) / rect.height) * 100;
    setSoulPos({ x: Math.max(5, Math.min(95, x)), y: Math.max(5, Math.min(95, y)) });
  };

  useEffect(() => {
    const duration = attackType === 'VOID_FALL' ? 6000 : 
                    attackType === 'ORBIT_CLOSE' ? 9000 : 
                    attackType === 'KNIFE_STRIKE' ? 10000 : 7500;
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime.current;
      if (elapsed >= duration) {
        onEnd();
        return;
      }

      setBullets(prev => {
        let next = [...prev];
        const spawnDelay = attackType === 'KNIFE_STRIKE' ? 1500 : 150;
        
        if (elapsed - lastSpawnTime.current > spawnDelay) {
          lastSpawnTime.current = elapsed;
          
          if (attackType === 'VOID_FALL') {
             next.push({ id: Math.random(), x: Math.random() * 100, y: -10, vx: 0, vy: 1.8 + Math.random(), size: 12, type: 'bone', rotation: 0 });
          } else if (attackType === 'ORBIT_CLOSE') {
             const angle = Math.random() * Math.PI * 2;
             next.push({ id: Math.random(), x: 50 + Math.cos(angle) * 70, y: 50 + Math.sin(angle) * 70, vx: -Math.cos(angle) * 1.1, vy: -Math.sin(angle) * 1.1, size: 20, type: 'glitch', rotation: angle });
          } else if (attackType === 'KNIFE_STRIKE') {
             const side = Math.floor(Math.random() * 4);
             const count = 6;
             const spacing = 15;
             const startOffset = (100 - (count * spacing)) / 2;
             
             let groupVx = 0, groupVy = 0, rot = 0;
             if (side === 0) { groupVx = 4; rot = 90; } // Left to Right
             else if (side === 1) { groupVx = -4; rot = 270; } // Right to Left
             else if (side === 2) { groupVy = 4; rot = 180; } // Top to Bottom
             else { groupVy = -4; rot = 0; } // Bottom to Top

             for (let i = 0; i < count; i++) {
               let bx = 0, by = 0;
               if (side < 2) { bx = side === 0 ? -10 : 110; by = startOffset + i * spacing; }
               else { bx = startOffset + i * spacing; by = side === 2 ? -10 : 110; }

               next.push({
                 id: Math.random(),
                 x: bx, y: by,
                 vx: groupVx, vy: groupVy,
                 size: 22, type: 'knife',
                 rotation: rot,
                 isReady: false
               });
             }
          } else {
             const side = Math.floor(Math.random() * 4);
             let x = 0, y = 0, vx = 0, vy = 0;
             if (side === 0) { x = -10; y = Math.random() * 100; vx = 2.5; }
             else if (side === 1) { x = 110; y = Math.random() * 100; vx = -2.5; }
             else if (side === 2) { x = Math.random() * 100; y = -10; vy = 2.5; }
             else { x = Math.random() * 100; y = 110; vy = -2.5; }
             next.push({ id: Math.random(), x, y, vx, vy, size: 18, type: 'spear', rotation: (Math.atan2(vy, vx) * 180 / Math.PI) + 90 });
          }
        }

        return next.map(b => {
          let nx = b.x;
          let ny = b.y;
          let nReady = b.isReady;

          if (b.type === 'knife' && !b.isReady) {
            // Telegraphing delay for knives
            if (elapsed - lastSpawnTime.current > 800) nReady = true;
          }

          if (b.type !== 'knife' || nReady) {
            nx += b.vx;
            ny += b.vy;
          }

          return { 
            ...b, 
            x: nx, 
            y: ny, 
            isReady: nReady,
            rotation: b.type === 'bone' ? b.rotation + 4 : b.rotation 
          };
        }).filter(b => {
            const dx = b.x - soulPos.x;
            const dy = b.y - soulPos.y;
            if (Math.sqrt(dx*dx + dy*dy) < 5) {
              onHit();
              return false;
            }
            return b.x > -40 && b.x < 140 && b.y > -40 && b.y < 140;
          });
      });
    }, 16);

    return () => clearInterval(interval);
  }, [soulPos, onHit, onEnd, attackType]);

  return (
    <div 
      ref={boxRef}
      onMouseMove={handleMove}
      onTouchMove={handleMove}
      className="relative w-full h-full bg-black cursor-none overflow-hidden touch-none"
    >
      <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 0)', backgroundSize: '40px 40px' }} />

      <SoulSprite x={soulPos.x} y={soulPos.y} isHurt={false} />

      {bullets.map(b => (
        <div 
          key={b.id}
          className={`absolute flex items-center justify-center pointer-events-none transition-opacity duration-300 ${b.type === 'knife' && !b.isReady ? 'opacity-40 scale-90' : 'opacity-100'}`}
          style={{ 
            left: `${b.x}%`, 
            top: `${b.y}%`, 
            transform: `translate(-50%, -50%) rotate(${b.rotation}deg)`,
            filter: b.type === 'knife' && b.isReady ? 'drop-shadow(0 0 8px red)' : 'none'
          }}
        >
          <AttackSprite type={b.type} size={b.size} isReady={b.isReady} />
        </div>
      ))}
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [inputImage, setInputImage] = useState<string | null>(null);
  const [encounter, setEncounter] = useState<EncounterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  
  const [battleState, setBattleState] = useState<BattleState>('START');
  const [playerHp, setPlayerHp] = useState(92);
  const [enemyHp, setEnemyHp] = useState(100);
  const [isEnemyHurt, setIsEnemyHurt] = useState(false);
  const [isPlayerHurt, setIsPlayerHurt] = useState(false);
  const [lastDamage, setLastDamage] = useState<number | null>(null);
  const [dialogue, setDialogue] = useState("");
  const [currentAttackType, setCurrentAttackType] = useState<AttackType>('RANDOM_BARRAGE');

  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY || '' }), []);

  const processImage = async (base64Data: string) => {
    setLoading(true);
    setLoadingStatus("RECOGNIZING FOE...");
    try {
      const imagePart = { inlineData: { data: base64Data.split(',')[1], mimeType: 'image/png' } };
      
      const textResult = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [imagePart, { text: `Examine this photo. Create an Undertale battle encounter JSON. 
          Return ONLY JSON: { "enemyName": string, "flavorText": string, "attackDescription": string, "stats": { "ATK": number, "DEF": number, "HP": 100 } }. 
          Make the dialogue relate specifically to the person/object in the photo.` }]
        },
        config: { responseMimeType: 'application/json' }
      });

      const data = JSON.parse(textResult.text || '{}');
      setInputImage(base64Data);
      setEncounter(data);
      setEnemyHp(data.stats.HP || 100);
      setBattleState('PLAYER_MENU');
    } catch (e) {
      alert("Encounter interrupted by the void.");
      reset();
    } finally {
      setLoading(false);
    }
  };

  const executeAttack = (power: number) => {
    const damage = Math.floor((power / 100) * 35);
    setLastDamage(damage);
    setEnemyHp(prev => Math.max(0, prev - damage));
    setIsEnemyHurt(true);
    if (enemyHp - damage <= 0) {
      setTimeout(() => setBattleState('VICTORY'), 800);
    } else {
      setDialogue(`* You struck ${encounter?.enemyName} for ${damage} damage!`);
      setBattleState('ACTION_DIALOGUE');
      setTimeout(() => setIsEnemyHurt(false), 800);
    }
  };

  const startEnemyTurn = () => {
    const attacks: AttackType[] = ['VOID_FALL', 'ORBIT_CLOSE', 'RANDOM_BARRAGE', 'KNIFE_STRIKE'];
    setCurrentAttackType(attacks[Math.floor(Math.random() * attacks.length)]);
    setBattleState('ENEMY_TURN');
  };

  const handlePlayerHit = () => {
    if (isPlayerHurt) return;
    setPlayerHp(prev => {
      const next = Math.max(0, prev - 12);
      if (next <= 0) setBattleState('GAME_OVER');
      return next;
    });
    setIsPlayerHurt(true);
    setTimeout(() => setIsPlayerHurt(false), 400);
  };

  const reset = () => {
    setInputImage(null);
    setEncounter(null);
    setBattleState('START');
    setPlayerHp(92);
    setLastDamage(null);
  };

  return (
    <div className={`min-h-screen p-4 flex flex-col items-center justify-center transition-all duration-300 ${isPlayerHurt ? 'bg-red-900' : 'bg-black'}`}>
      <header className="py-4 text-center w-full z-10">
        <h1 className="text-xl md:text-3xl text-white mb-2 tracking-tighter uppercase">Undertale Encounter</h1>
      </header>

      {battleState === 'START' && !loading && (
        <div className="flex flex-col items-center gap-10">
          <div 
            onClick={() => document.getElementById('file-input')?.click()}
            className="retro-border w-64 h-64 flex items-center justify-center cursor-pointer bg-neutral-900 hover:bg-neutral-800 transition-all group"
          >
            <div className="text-center group-hover:scale-110 transition-transform">
              <div className="text-6xl mb-6">❤️</div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest">UPLOAD IMAGE</p>
            </div>
          </div>
          <input id="file-input" type="file" className="hidden" accept="image/*" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (ev) => processImage(ev.target?.result as string);
              reader.readAsDataURL(file);
            }
          }} />
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center gap-6 animate-pulse">
           <div className="w-56 h-56 border-4 border-white bg-black flex items-center justify-center">
             <span className="text-[10px] text-center p-4 uppercase tracking-[0.3em]">{loadingStatus}</span>
           </div>
        </div>
      )}

      {inputImage && encounter && !loading && (
        <div className="w-full max-w-2xl flex flex-col items-center gap-4 mb-12">
          
          <div className="relative w-full flex flex-col items-center min-h-[250px] justify-center">
            <h2 className="text-white text-lg mb-6 uppercase tracking-[0.2em]">{encounter.enemyName}</h2>
            
            <div className={`relative ${isEnemyHurt ? 'animate-shake' : 'animate-float'}`}>
              {battleState !== 'VICTORY' && battleState !== 'SPARED' && (
                <div className="relative">
                   <img 
                    src={inputImage} 
                    className="w-48 h-48 md:w-60 md:h-60 object-cover pixelated border-4 border-white shadow-[0_0_30px_rgba(255,255,255,0.2)] grayscale-[1] contrast-[220%] brightness-[1.1]" 
                    alt="Enemy" 
                  />
                  <div className="absolute inset-0 border-2 border-black/50 pointer-events-none" />
                </div>
              )}
              {isEnemyHurt && lastDamage !== null && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 text-red-500 text-4xl font-black animate-float-up z-20" style={{ textShadow: '4px 4px black' }}>
                  {lastDamage}
                </div>
              )}
            </div>

            <div className="w-48 h-4 bg-gray-900 mt-8 border-4 border-white relative">
              <div 
                className="h-full bg-green-500 transition-all duration-700 shadow-[0_0_10px_#22c55e]" 
                style={{ width: `${(enemyHp / (encounter.stats.HP || 100)) * 100}%` }} 
              />
            </div>
          </div>

          <div className="retro-border w-full h-44 md:h-56 bg-black overflow-hidden relative">
            {battleState === 'PLAYER_MENU' && (
              <div className="p-8 h-full text-white text-xs md:text-xl leading-relaxed">
                * {encounter.flavorText}
                <span className="inline-block w-2 h-4 bg-white ml-2 animate-pulse" />
              </div>
            )}
            {battleState === 'ACTION_DIALOGUE' && (
              <div className="p-8 h-full text-white text-xs md:text-xl leading-relaxed">
                * {dialogue}
                <button onClick={startEnemyTurn} className="block mt-6 text-[10px] text-yellow-400 hover:scale-105 transition-transform">[ CONTINUE ]</button>
              </div>
            )}
            {battleState === 'FIGHT_TARGET' && (
              <div onClick={() => executeAttack(60 + Math.random() * 40)} className="w-full h-full flex items-center justify-center cursor-crosshair group">
                 <div className="w-4/5 h-16 border-4 border-white relative bg-white/5 flex items-center justify-center overflow-hidden">
                    <div className="absolute left-0 w-2 h-full bg-cyan-400 animate-slide-across" />
                    <div className="text-xs uppercase text-white/30 tracking-[0.5em]">STRIKE</div>
                 </div>
              </div>
            )}
            {battleState === 'ENEMY_TURN' && (
              <BulletHell onHit={handlePlayerHit} onEnd={() => setBattleState('PLAYER_MENU')} attackType={currentAttackType} />
            )}
            {battleState === 'GAME_OVER' && (
              <div className="h-full flex flex-col items-center justify-center text-red-600 bg-red-950/20">
                <div className="text-4xl mb-4">💔</div>
                <div className="text-sm mb-6 uppercase tracking-widest">STAY DETERMINED...</div>
                <button onClick={reset} className="text-[10px] border-2 border-red-600 px-6 py-2 uppercase hover:bg-red-600 hover:text-white transition-all">[ RESTART ]</button>
              </div>
            )}
            {battleState === 'VICTORY' && (
              <div className="h-full flex flex-col items-center justify-center text-yellow-400 animate-in fade-in">
                <div className="text-xl mb-4 tracking-widest">VICTORY</div>
                <button onClick={reset} className="text-[10px] border border-yellow-400 p-2 uppercase hover:bg-yellow-400 hover:text-black transition-all">[ RETURN ]</button>
              </div>
            )}
          </div>

          <div className="w-full mt-4">
            <div className="flex items-center justify-between text-[10px] mb-6">
              <div className="flex items-center gap-6">
                <span className="text-white tracking-widest">YOU  LV 19</span>
                <div className="flex items-center gap-2">
                  <span className="text-yellow-400 font-bold">HP</span>
                  <div className="w-32 md:w-56 h-5 bg-red-600 border-2 border-black">
                    <div className="h-full bg-yellow-400 transition-all duration-300" style={{ width: `${(playerHp / 92) * 100}%` }} />
                  </div>
                  <span className="text-white font-mono">{playerHp} / 92</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              {[
                { l: 'FIGHT', a: () => setBattleState('FIGHT_TARGET') },
                { l: 'ACT', a: () => { setDialogue(`* ${encounter.enemyName}: ${encounter.attackDescription}`); setBattleState('ACTION_DIALOGUE'); } },
                { l: 'ITEM', a: () => { setPlayerHp(92); setDialogue("* You used an Item. HP Restored!"); setBattleState('ACTION_DIALOGUE'); } },
                { l: 'MERCY', a: () => { if(enemyHp < 30) setBattleState('VICTORY'); else { setDialogue(`* They aren't ready to stop.`); setBattleState('ACTION_DIALOGUE'); } } }
              ].map((b) => (
                <button 
                  key={b.l}
                  disabled={battleState !== 'PLAYER_MENU'}
                  onClick={b.a}
                  className={`retro-border py-4 text-[10px] transition-all relative overflow-hidden group ${battleState === 'PLAYER_MENU' ? 'text-orange-500 hover:text-yellow-400 active:scale-95' : 'text-gray-800 border-gray-900 opacity-40'}`}
                >
                  <span className="relative z-10">[{b.l}]</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <footer className="w-full py-4 text-center opacity-40 hover:opacity-100 transition-opacity">
        <p className="text-[8px] uppercase tracking-widest text-white/60">
          Created by Adam Neverender, 2026
        </p>
      </footer>
    </div>
  );
}
