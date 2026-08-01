import React, { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import axios from 'axios';

// ---------- TWINKLING STAR ----------
const TwinklingStar = ({ position, hue, hashId, onStarClick, isNew, birthTime, createdAt }) => {
  const meshRef = useRef();
  const materialRef = useRef();
  const glowRef = useRef();
  const [isHovered, setIsHovered] = useState(false);
  const startY = position[1];

  useEffect(() => {
    let frameId;
    const animate = () => {
      if (meshRef.current) {
        const time = Date.now() / 1000;
        
        const twinkleScale = isNew ? 0.6 : 0.3;
        const twinkle = Math.sin(time * 1.5 + position[0]) * twinkleScale + 0.7;
        meshRef.current.scale.setScalar(twinkle);
        
        const elapsed = (Date.now() - (birthTime || Date.now())) / 1000;
        const fallAmount = Math.min(elapsed * 0.0008, 1.5);
        meshRef.current.position.y = startY - fallAmount;
        
        const opacity = 1 - (fallAmount / 1.5);
        materialRef.current.opacity = Math.max(opacity, 0.3);
        materialRef.current.transparent = true;
        
        const glowIntensity = isNew ? 0.8 + Math.sin(time * 2.5) * 0.2 : 0.3 + twinkle * 0.2;
        materialRef.current.emissiveIntensity = glowIntensity;
        
        if (glowRef.current && isNew) {
          const pulse = Math.sin(time * 2) * 0.15 + 0.85;
          glowRef.current.scale.setScalar(pulse);
          glowRef.current.material.opacity = 0.2 + Math.sin(time * 2) * 0.1;
        }
        
        if (isHovered) {
          materialRef.current.emissiveIntensity = 1.2;
        }
      }
      frameId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(frameId);
  }, [position, isNew, isHovered, birthTime, startY]);

  const color = new THREE.Color().setHSL(hue, 0.9, 0.6);
  const glowColor = new THREE.Color().setHSL(hue, 1.0, 0.8);

  return (
    <group>
      <mesh 
        ref={meshRef} 
        position={position} 
        onClick={() => onStarClick(hashId)}
        onPointerEnter={() => {
          setIsHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerLeave={() => {
          setIsHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        <sphereGeometry args={[isNew ? 0.28 : 0.15, 8, 8]} />
        <meshStandardMaterial 
          ref={materialRef}
          color={color} 
          emissive={color}
          emissiveIntensity={isNew ? 0.8 : 0.4}
          roughness={0.15}
          metalness={0.1}
          transparent={true}
        />
      </mesh>
      
      {(isNew || isHovered) && (
        <mesh ref={glowRef} position={position}>
          <ringGeometry args={[isNew ? 0.35 : 0.25, isNew ? 0.55 : 0.4, 32]} />
          <meshBasicMaterial 
            color={glowColor} 
            transparent 
            opacity={isNew ? 0.3 : 0.15}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
};

// ---------- SHOOTING STAR ----------
const ShootingStar = ({ startX, startY, startZ, onComplete }) => {
  const meshRef = useRef();
  const trailRef = useRef();
  
  useEffect(() => {
    let frameId;
    let progress = 0;
    const speed = 0.015;
    const endX = startX - 20;
    const endY = startY - 8;
    const endZ = startZ + 15;
    
    const animate = () => {
      progress += speed;
      if (progress >= 1) {
        onComplete();
        return;
      }
      
      if (meshRef.current) {
        const x = startX + (endX - startX) * progress;
        const y = startY + (endY - startY) * progress;
        const z = startZ + (endZ - startZ) * progress;
        meshRef.current.position.set(x, y, z);
        meshRef.current.material.opacity = 1 - progress;
        
        if (trailRef.current) {
          trailRef.current.position.set(x - 1.5, y - 0.5, z);
          trailRef.current.material.opacity = 0.3 * (1 - progress);
        }
      }
      
      frameId = requestAnimationFrame(animate);
    };
    animate();
    
    return () => cancelAnimationFrame(frameId);
  }, [startX, startY, startZ, onComplete]);
  
  return (
    <group>
      <mesh ref={meshRef} position={[startX, startY, startZ]}>
        <sphereGeometry args={[0.06, 6, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={1} />
      </mesh>
      <mesh ref={trailRef} position={[startX - 1.5, startY - 0.5, startZ]}>
        <sphereGeometry args={[0.12, 6, 6]} />
        <meshBasicMaterial color="#a29bfe" transparent opacity={0.3} />
      </mesh>
    </group>
  );
};

// ---------- MAIN APP ----------
function App() {
  const [stars, setStars] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [userMessage, setUserMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [shootingStars, setShootingStars] = useState([]);
  const [zoomTarget, setZoomTarget] = useState(null);
  const [viewMode, setViewMode] = useState('3d');
  const wsRef = useRef(null);
  const controlsRef = useRef();

  // ---------- 1. WEBSOCKET ----------
  useEffect(() => {
    wsRef.current = new WebSocket('ws://localhost:4000');
    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'NEW_STAR') {
        setStars(prev => [...prev, {
          pos_x: data.data.x,
          pos_y: data.data.y,
          pos_z: data.data.z,
          color_hue: data.data.hue,
          hash_id: 'new_' + Date.now(),
          message: "A new light in the void...",
          birthTime: Date.now(),
          created_at: new Date().toISOString()
        }]);
      }
    };
    return () => wsRef.current.close();
  }, []);

  // ---------- 2. FETCH STARS ----------
  useEffect(() => {
    axios.get('/api/https://lost-stars-backend.onrender.com/sky')
      .then(res => {
        const starsWithData = res.data.stars.map(star => ({
          ...star,
          birthTime: Date.now(),
          created_at: star.created_at || new Date().toISOString()
        }));
        setStars(starsWithData);
        setLoading(false);
      })
      .catch(err => {
        console.error("Sky is cloudy:", err);
        setLoading(false);
      });
  }, []);

  // ---------- 3. RANDOM SHOOTING STARS ----------
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() < 0.25) {
        spawnShootingStar();
      }
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // ---------- 4. SPAWN SHOOTING STAR ----------
  const spawnShootingStar = () => {
    const startX = (Math.random() - 0.5) * 40;
    const startY = (Math.random() - 0.5) * 25 + 5;
    const startZ = -15 - Math.random() * 10;
    
    const id = Date.now() + Math.random();
    setShootingStars(prev => [...prev, { 
      id, 
      startX, 
      startY, 
      startZ 
    }]);
    
    setTimeout(() => {
      setShootingStars(prev => prev.filter(s => s.id !== id));
    }, 3000);
  };

  // ---------- 5. ZOOM EFFECT ----------
  useEffect(() => {
    if (controlsRef.current && zoomTarget) {
      controlsRef.current.target.set(zoomTarget[0], zoomTarget[1], zoomTarget[2]);
      controlsRef.current.update();
    }
  }, [zoomTarget]);

  // ---------- 6. FORMAT DATE ----------
  const formatDate = (dateString) => {
    if (!dateString) return "Just now";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Just now";
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // ---------- 7. HANDLE STAR CLICK ----------
  const handleStarClick = async (hashId) => {
    const star = stars.find(s => s.hash_id === hashId);
    if (star) {
      setZoomTarget([star.pos_x, star.pos_y, star.pos_z]);
      setTimeout(() => {
        setZoomTarget(null);
      }, 3000);
    }
    
    const existingStar = stars.find(s => s.hash_id === hashId);
    if (existingStar && existingStar.message) {
      setSelectedMessage({
        message: existingStar.message,
        time: formatDate(existingStar.created_at)
      });
      return;
    }
    
    if (hashId.startsWith('new_')) {
      setSelectedMessage({ 
        message: "A new light in the void...",
        time: "Just now"
      });
      return;
    }
    
    try {
      const res = await axios.get(`https://lost-stars-backend.onrender.com/api/star/${hashId}`);
      if (res.data && res.data.message) {
        setSelectedMessage({
          message: res.data.message,
          time: formatDate(res.data.created_at)
        });
      } else {
        setSelectedMessage({ message: "This star is silent..." });
      }
    } catch (err) {
      console.error("Error fetching star:", err);
      setSelectedMessage({ message: "This star has faded away..." });
    }
  };

  // ---------- 8. SEND STAR ----------
  const sendStar = async () => {
    if (!userMessage.trim()) return;
    
    try {
      const response = await axios.post('https://lost-stars-backend.onrender.com/api/stars', {
        message: userMessage,
        emotion: 'miss'
      });
      
      const realHashId = response.data.hash_id;
      const starData = await axios.get(`https://lost-stars-backend.onrender.com/api/star/${realHashId}`);
      
      setStars(prev => [...prev, {
        pos_x: starData.data.pos_x || (Math.random() - 0.5) * 10,
        pos_y: starData.data.pos_y || (Math.random() - 0.5) * 10,
        pos_z: starData.data.pos_z || (Math.random() - 0.5) * 10,
        color_hue: starData.data.color_hue || 0.55,
        hash_id: realHashId,
        message: starData.data.message,
        created_at: starData.data.created_at || new Date().toISOString(),
        birthTime: Date.now()
      }]);
      
      spawnShootingStar();
      setUserMessage('');
      alert('Your star is now in the sky!');
    } catch (err) {
      console.error("Error posting star:", err);
      alert('❌ ' + (err.response?.data?.error || 'Space debris blocked your message.'));
    }
  };

  if (loading) {
    return (
      <div style={{ 
        width: '100vw', height: '100vh', 
        background: 'radial-gradient(ellipse at center, #0a0a1a 0%, #050510 50%, #020208 100%)',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: 'white',
        fontFamily: '"Georgia", serif',
        letterSpacing: 2
      }}>
        <h2 style={{ fontWeight: 300, opacity: 0.6 }}>✦ Loading the cosmos...</h2>
      </div>
    );
  }

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      background: 'radial-gradient(ellipse at center, #0a0a1a 0%, #050510 50%, #020208 100%)', 
      position: 'relative',
      overflow: 'hidden'
    }}>
      
      {/* ---------- Genshin Style Title ---------- */}
      <div style={{
        position: 'absolute',
        top: 30,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        textAlign: 'center',
        pointerEvents: 'none'
      }}>
        <h1 style={{
          color: 'rgba(255,255,255,0.08)',
          fontSize: 12,
          letterSpacing: 8,
          fontWeight: 300,
          fontFamily: '"Georgia", serif',
          textTransform: 'uppercase',
          margin: 0
        }}>
          ✦ Lost Stars ✦
        </h1>
        <p style={{
          color: 'rgba(255,255,255,0.04)',
          fontSize: 9,
          letterSpacing: 4,
          fontWeight: 300,
          fontFamily: '"Georgia", serif',
          marginTop: 4
        }}>
          {stars.length} stars in the void
        </p>
      </div>

      {/* ---------- DRAG HINT ---------- */}
      <div style={{
        position: 'absolute',
        bottom: '50%',
        right: 30,
        zIndex: 5,
        transform: 'translateY(50%)',
        textAlign: 'right',
        pointerEvents: 'none',
        opacity: 0.15
      }}>
        <p style={{
          color: 'white',
          fontSize: 10,
          letterSpacing: 2,
          fontWeight: 300,
          fontFamily: '"Georgia", serif',
          writingMode: 'vertical-rl',
          textOrientation: 'mixed'
        }}>
          ⋆｡°✩ drag to explore the cosmos ✩°｡⋆
        </p>
      </div>

      {/* ---------- UI: BOTTOM LEFT ---------- */}
      <div style={{ 
        position: 'absolute', 
        bottom: 40, 
        left: 40, 
        zIndex: 10, 
        fontFamily: '"Georgia", serif',
        maxWidth: 380,
        width: '90%'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.04)',
          borderRadius: 16,
          padding: '20px 24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.03)'
        }}>
          
          <p style={{ 
            opacity: 0.2, 
            fontSize: 9, 
            letterSpacing: 3, 
            textTransform: 'uppercase',
            marginBottom: 12,
            fontWeight: 300,
            color: '#fff'
          }}>
            What words never left your lips?
          </p>
          
          <div style={{ 
            display: 'flex', 
            gap: 10, 
            flexDirection: 'column',
            alignItems: 'stretch'
          }}>
            <input 
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
              placeholder="Write your unsent message..."
              style={{ 
                padding: '12px 18px', 
                background: 'rgba(255,255,255,0.03)', 
                border: '1px solid rgba(255,255,255,0.06)', 
                borderRadius: 40, 
                color: 'white',
                outline: 'none',
                fontSize: 13,
                fontWeight: 300,
                fontFamily: '"Georgia", serif',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)',
                letterSpacing: 0.3
              }}
              onFocus={(e) => e.target.style.borderColor = 'rgba(162,155,254,0.3)'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.06)'}
              onKeyPress={(e) => e.key === 'Enter' && sendStar()}
            />
            
            <button 
              onClick={sendStar} 
              style={{ 
                width: '100%',
                padding: '12px 24px', 
                borderRadius: 40, 
                background: 'linear-gradient(135deg, rgba(162,155,254,0.15), rgba(108,92,231,0.15))',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(162,155,254,0.15)',
                color: 'rgba(255,255,255,0.7)', 
                fontWeight: 300,
                fontSize: 12,
                fontFamily: '"Georgia", serif',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                letterSpacing: 1
              }}
              onMouseEnter={(e) => {
                e.target.style.background = 'linear-gradient(135deg, rgba(162,155,254,0.25), rgba(108,92,231,0.25))';
                e.target.style.borderColor = 'rgba(162,155,254,0.3)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'linear-gradient(135deg, rgba(162,155,254,0.15), rgba(108,92,231,0.15))';
                e.target.style.borderColor = 'rgba(162,155,254,0.15)';
              }}
            >
              Send to the Stars
            </button>

            {/* Star Map Toggle */}
            <button 
              onClick={() => setViewMode(viewMode === '3d' ? '2d' : '3d')}
              style={{
                padding: '8px 16px',
                borderRadius: 40,
                border: '1px solid rgba(255,255,255,0.04)',
                background: 'rgba(255,255,255,0.02)',
                color: 'rgba(255,255,255,0.3)',
                fontSize: 10,
                letterSpacing: 2,
                fontFamily: '"Georgia", serif',
                cursor: 'pointer',
                backdropFilter: 'blur(10px)',
                transition: 'all 0.3s ease',
                marginTop: 4
              }}
              onMouseEnter={(e) => {
                e.target.style.background = 'rgba(255,255,255,0.04)';
                e.target.style.color = 'rgba(255,255,255,0.5)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'rgba(255,255,255,0.02)';
                e.target.style.color = 'rgba(255,255,255,0.3)';
              }}
            >
              {viewMode === '3d' ? '✦ View Star Map' : '✦ View Sky'}
            </button>
          </div>
        </div>
      </div>

      {/* ---------- MESSAGE POPUP ---------- */}
      {selectedMessage && (
        <div style={{ 
          position: 'fixed',
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)', 
          background: 'rgba(10,10,30,0.85)', 
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          padding: '40px 48px', 
          borderRadius: 20, 
          border: '1px solid rgba(255,255,255,0.04)', 
          color: 'white', 
          zIndex: 20, 
          maxWidth: 440, 
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 40px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.03)',
          animation: 'fadeIn 0.5s ease'
        }}>
          <div style={{
            width: 36,
            height: 36,
            margin: '0 auto 20px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(162,155,254,0.1), rgba(108,92,231,0.05))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(255,255,255,0.03)'
          }}>
            <span style={{ fontSize: 16, opacity: 0.3 }}>✦</span>
          </div>
          
          <p style={{ 
            fontSize: 20, 
            fontStyle: 'italic', 
            margin: 0,
            lineHeight: 1.6,
            fontWeight: 300,
            letterSpacing: 0.3,
            fontFamily: '"Georgia", serif',
            color: 'rgba(255,255,255,0.9)'
          }}>
            "{selectedMessage.message}"
          </p>
          
          {selectedMessage.time && (
            <p style={{ 
              opacity: 0.2, 
              fontSize: 10, 
              marginTop: 18,
              letterSpacing: 2,
              fontWeight: 300,
              fontFamily: '"Georgia", serif'
            }}>
              {selectedMessage.time}
            </p>
          )}
          
          <button 
            onClick={() => setSelectedMessage(null)} 
            style={{ 
              marginTop: 24, 
              background: 'rgba(255,255,255,0.02)', 
              border: '1px solid rgba(255,255,255,0.04)', 
              color: 'rgba(255,255,255,0.4)', 
              padding: '6px 24px', 
              borderRadius: 20,
              fontSize: 10,
              letterSpacing: 2,
              fontFamily: '"Georgia", serif',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(255,255,255,0.04)';
              e.target.style.color = 'rgba(255,255,255,0.6)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'rgba(255,255,255,0.02)';
              e.target.style.color = 'rgba(255,255,255,0.4)';
            }}
          >
            Close
          </button>
        </div>
      )}
      
      {/* ---------- BACKGROUND MUSIC ---------- */}
<div style={{
  position: 'fixed',
  bottom: 20,
  right: 20,
  zIndex: 100,
  opacity: 0.4,
  transition: 'opacity 0.4s ease',
  background: 'rgba(10,10,30,0.3)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderRadius: 16,
  padding: '14px 18px',
  border: '1px solid rgba(255,255,255,0.04)',
  maxWidth: '250px'
}}
onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
onMouseLeave={(e) => e.currentTarget.style.opacity = 0.4}
>
  <p style={{
    color: 'rgba(255,255,255,0.15)',
    fontSize: 8,
    letterSpacing: 3,
    textTransform: 'uppercase',
    margin: '0 0 10px 0',
    fontFamily: '"Georgia", serif'
  }}>
    ✦ Lost Stars Radio ✦
  </p>
  
  {/* SONG 1: Reflections - The Neighbourhood */}
  <div style={{ marginBottom: 10 }}>
    <p style={{
      color: 'rgba(255,255,255,0.1)',
      fontSize: 9,
      margin: '0 0 4px 0',
      fontFamily: '"Georgia", serif',
      fontStyle: 'italic'
    }}>
      Reflections — The Neighbourhood
    </p>
    <audio controls style={{ width: '100%', height: '28px', opacity: 0.7 }}>
      <source src="/audio/reflections.mp3" type="audio/mpeg" />
    </audio>
  </div>
  
  {/* SONG 2: M. - Anil Emre Daldal */}
  <div>
    <p style={{
      color: 'rgba(255,255,255,0.1)',
      fontSize: 9,
      margin: '0 0 4px 0',
      fontFamily: '"Georgia", serif',
      fontStyle: 'italic'
    }}>
      M. — Anil Emre Daldal
    </p>
    <audio controls style={{ width: '100%', height: '28px', opacity: 0.7 }}>
      <source src="/audio/m-song.mp3" type="audio/mpeg" />
    </audio>
  </div>
</div>
      {/* ---------- 3D / 2D VIEW ---------- */}
      {viewMode === '3d' ? (
        <Canvas camera={{ position: [0, 2, 10], fov: 60 }}>
          <ambientLight intensity={0.2} />
          <pointLight position={[10, 10, 10]} />
          
          {stars.map((star, i) => (
            <TwinklingStar 
              key={i}
              position={[star.pos_x, star.pos_y, star.pos_z]}
              hue={star.color_hue || 0.55}
              hashId={star.hash_id}
              onStarClick={handleStarClick}
              isNew={i === stars.length - 1}
              birthTime={star.birthTime || Date.now()}
              createdAt={star.created_at}
            />
          ))}
          
          <Stars radius={50} depth={50} count={3000} factor={4} saturation={0} fade speed={0.2} />
          
          {shootingStars.map((star) => (
            <ShootingStar 
              key={star.id}
              startX={star.startX}
              startY={star.startY}
              startZ={star.startZ}
              onComplete={() => {
                setShootingStars(prev => prev.filter(s => s.id !== star.id));
              }}
            />
          ))}
          
          <OrbitControls 
            ref={controlsRef}
            enableZoom={true}
            enablePan={true}
            autoRotate={!zoomTarget}
            autoRotateSpeed={0.15}
            minDistance={3}
            maxDistance={20}
            dampingFactor={0.05}
          />
        </Canvas>
      ) : (
        // 2D MAP VIEW
        <div style={{
          width: '100vw',
          height: '100vh',
          background: 'radial-gradient(ellipse at center, #0a0a1a 0%, #050510 50%, #020208 100%)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <h3 style={{
            position: 'absolute',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.06)',
            fontSize: 10,
            letterSpacing: 6,
            fontWeight: 300,
            fontFamily: '"Georgia", serif',
            textTransform: 'uppercase'
          }}>
            ✦ Star Map ✦
          </h3>
          
          {stars.map((star, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${((star.pos_x + 12) / 24) * 100}%`,
                top: `${((star.pos_z + 12) / 24) * 100}%`,
                width: i === stars.length - 1 ? '12px' : '6px',
                height: i === stars.length - 1 ? '12px' : '6px',
                borderRadius: '50%',
                background: `hsl(${star.color_hue * 360}, 70%, 60%)`,
                boxShadow: i === stars.length - 1 
                  ? '0 0 30px rgba(162,155,254,0.3)' 
                  : '0 0 8px rgba(255,255,255,0.05)',
                cursor: 'pointer',
                transition: 'all 0.4s ease',
                border: i === stars.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none'
              }}
              onClick={() => handleStarClick(star.hash_id)}
              onMouseEnter={(e) => {
                e.target.style.transform = 'scale(2.5)';
                e.target.style.boxShadow = '0 0 30px rgba(162,155,254,0.3)';
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'scale(1)';
                e.target.style.boxShadow = i === stars.length - 1 
                  ? '0 0 30px rgba(162,155,254,0.3)' 
                  : '0 0 8px rgba(255,255,255,0.05)';
              }}
            />
          ))}
          
          <p style={{
            position: 'absolute',
            bottom: 30,
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.04)',
            fontSize: 9,
            letterSpacing: 3,
            fontWeight: 300,
            fontFamily: '"Georgia", serif'
          }}>
            {stars.length} stars in the constellation
          </p>
        </div>
      )}
    </div>
  );
}

export default App;