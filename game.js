/**
 * BADRIK: SOLANA CYBER RUNNER v3.0
 * Optimized for mobile - InstancedMesh, Object Pooling, Adaptive Quality
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ==================== DEVICE DETECTION ====================
const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
const isLowEnd = isMobile && (navigator.hardwareConcurrency <= 4 || navigator.deviceMemory <= 4);

// ==================== SOLANA COLORS ====================
const COLORS = {
    purple: 0x9945FF,
    green: 0x14F195,
    cyan: 0x00FFA3,
    black: 0x000000,
    white: 0xFFFFFF,
    pink: 0xFF6B9D,
};

// ==================== CONFIG ====================
const CONFIG = {
    // Performance
    PIXEL_RATIO: isMobile ? 1 : Math.min(window.devicePixelRatio, 2),
    ANTIALIAS: !isMobile,
    SHADOWS: false,
    BLOOM: !isLowEnd,
    
    // Lanes
    LANE_WIDTH: 2.5,
    LANES: [-2.5, 0, 2.5],
    
    // Speed
    INITIAL_SPEED: 20,
    MAX_SPEED: 60,
    SPEED_INCREASE: 0.5,
    
    // Physics
    JUMP_FORCE: 15,
    GRAVITY: -45,
    LANE_SWITCH_SPEED: 20,
    SLIDE_DURATION: 500,
    
    // Spawning - obstacles visible earlier
    OBSTACLE_DISTANCE: 25,
    SHARD_DISTANCE: 3,
    SPAWN_Z: -200,
    DESPAWN_Z: 15,
    
    // Grid
    GRID_SIZE: 200,
    GRID_DIVISIONS: 40,
    
    // Pools
    MAX_OBSTACLES: 30,
    MAX_SHARDS: 150,
    MAX_PARTICLES: 50,
    
    // Dog
    DOG_SCALE: 4,
    DOG_Y: 0,
    
    // Phases (color changes)
    PHASE_DISTANCE: 300,
};

// ==================== PHASES ====================
const PHASES = [
    { name: 'Green', color: COLORS.green, distance: 0 },
    { name: 'Purple', color: COLORS.purple, distance: 300 },
    { name: 'Cyan', color: COLORS.cyan, distance: 700 },
    { name: 'Pink', color: COLORS.pink, distance: 1200 },
];

// ==================== SOUND MANAGER ====================
class SoundManager {
    constructor() {
        this.sounds = {};
        this.music = null;
        this.enabled = true;
        this.loaded = false;
    }
    
    async load() {
        const files = {
            coin: 'coin-take.mp3',
            jump: 'jump.mp3',
            crash: 'Destruction/BrittleGlassIce1.mp3',
            slide: 'Drag/Grittyirregulargr5.mp3',
            button: 'Inventory/Menufriendlysounds10.mp3',
        };
        
        for (const [name, path] of Object.entries(files)) {
            try {
                this.sounds[name] = new Audio(path);
                this.sounds[name].volume = 0.5;
            } catch (e) {}
        }
        
        try {
            this.music = new Audio('game1.mp3');
            this.music.loop = true;
            this.music.volume = 0.3;
        } catch (e) {}
        
        this.loaded = true;
    }
    
    play(name) {
        if (!this.enabled || !this.sounds[name]) return;
        const s = this.sounds[name].cloneNode();
        s.volume = 0.5;
        s.play().catch(() => {});
    }
    
    startMusic() {
        if (this.music) this.music.play().catch(() => {});
    }
    
    stopMusic() {
        if (this.music) {
            this.music.pause();
            this.music.currentTime = 0;
        }
    }
}

// ==================== OBJECT POOL ====================
class ObjectPool {
    constructor(scene, createFn, maxSize) {
        this.scene = scene;
        this.createFn = createFn;
        this.pool = [];
        this.active = [];
        
        // Pre-create objects
        for (let i = 0; i < maxSize; i++) {
            const obj = createFn();
            obj.visible = false;
            scene.add(obj);
            this.pool.push(obj);
        }
    }
    
    get() {
        let obj = this.pool.pop();
        if (!obj) {
            obj = this.createFn();
            this.scene.add(obj);
        }
        obj.visible = true;
        this.active.push(obj);
        return obj;
    }
    
    release(obj) {
        obj.visible = false;
        const idx = this.active.indexOf(obj);
        if (idx > -1) this.active.splice(idx, 1);
        this.pool.push(obj);
    }
    
    releaseAll() {
        while (this.active.length > 0) {
            this.release(this.active[0]);
        }
    }
    
    getActive() {
        return this.active;
    }
}

// ==================== WALLET MANAGER ====================
class WalletManager {
    constructor() {
        this.connected = false;
        this.address = null;
    }
    
    async connect() {
        try {
            if (!window.solana?.isPhantom) {
                window.open('https://phantom.app/', '_blank');
                return false;
            }
            const resp = await window.solana.connect();
            this.address = resp.publicKey.toString();
            this.connected = true;
            return true;
        } catch (e) {
            return false;
        }
    }
    
    getShortAddress() {
        if (!this.address) return '';
        return this.address.slice(0, 4) + '...' + this.address.slice(-4);
    }
}

// ==================== MAIN GAME CLASS ====================
class Game {
    constructor() {
        this.sound = new SoundManager();
        this.wallet = new WalletManager();
        this.loader = new GLTFLoader();
        
        // State
        this.isPlaying = false;
        this.isGameOver = false;
        this.isInMenu = true;
        
        // Score
        this.score = 0;
        this.shards = 0;
        this.distance = 0;
        this.bestScore = parseInt(localStorage.getItem('badrik_best') || '0');
        
        // Player
        this.dog = null;
        this.mixer = null;
        this.animations = {};
        this.menuAnimations = {};
        this.currentLane = 1;
        this.targetX = 0;
        this.velocityY = 0;
        this.isJumping = false;
        this.isSliding = false;
        this.slideTimer = 0;
        
        // World
        this.speed = CONFIG.INITIAL_SPEED;
        this.currentPhase = 0;
        this.phaseColor = COLORS.green;
        
        // Three.js
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.composer = null;
        this.clock = new THREE.Clock();
        
        // Pools
        this.obstaclePool = null;
        this.shardPool = null;
        this.particlePool = null;
        
        // Tracking
        this.lastObstacleZ = -30;
        this.lastShardZ = -20;
        this.frameCount = 0;
        
        // Performance
        this.quality = isLowEnd ? 'low' : 'high';
        
        this.init();
    }
    
    async init() {
        await this.sound.load();
        this.initMenu();
        this.initUI();
    }
    
    // ==================== MENU ====================
    initMenu() {
        this.menuScene = new THREE.Scene();
        this.menuScene.background = new THREE.Color(COLORS.black);
        
        this.menuCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
        this.menuCamera.position.set(0, 0.5, 2);
        this.menuCamera.lookAt(0, 0.3, 0);
        
        const canvas = document.getElementById('menuCanvas');
        this.menuRenderer = new THREE.WebGLRenderer({ 
            canvas, 
            antialias: CONFIG.ANTIALIAS,
            powerPreference: 'high-performance'
        });
        this.menuRenderer.setSize(window.innerWidth, window.innerHeight);
        this.menuRenderer.setPixelRatio(CONFIG.PIXEL_RATIO);
        
        // Neon lighting for menu
        const light1 = new THREE.DirectionalLight(COLORS.green, 1);
        light1.position.set(2, 2, 2);
        this.menuScene.add(light1);
        
        const light2 = new THREE.DirectionalLight(COLORS.purple, 0.8);
        light2.position.set(-2, 1, 2);
        this.menuScene.add(light2);
        
        this.menuScene.add(new THREE.AmbientLight(0x404040, 0.5));
        
        // Load dog for menu
        this.loadMenuDog();
        this.animateMenu();
    }
    
    loadMenuDog() {
        this.loader.load('bulldog.glb', (gltf) => {
            this.menuDog = gltf.scene;
            this.menuDog.scale.set(1, 1, 1);
            this.menuDog.position.set(0, -0.3, 0);
            
            // Keep original brown/natural colors - don't override materials
            this.menuScene.add(this.menuDog);
            
            // Animations
            if (gltf.animations.length > 0) {
                this.menuAnimations = {};
                this.menuMixer = new THREE.AnimationMixer(this.menuDog);
                gltf.animations.forEach(clip => {
                    console.log('Menu animation found:', clip.name);
                    this.menuAnimations[clip.name.toLowerCase()] = this.menuMixer.clipAction(clip);
                });
                // Start with sit animation
                this.menuCurrentAnim = this.menuAnimations['sit'] || Object.values(this.menuAnimations)[0];
                if (this.menuCurrentAnim) this.menuCurrentAnim.play();
                
                // Scratch every 3 seconds
                this.lastScratchTime = Date.now();
                this.scratchInterval = 3000;
                this.scratchDuration = 2000;
                this.isScratching = false;
            }
        });
    }
    
    playMenuAnimation(name) {
        const anim = this.menuAnimations[name] || 
                     this.menuAnimations[Object.keys(this.menuAnimations).find(k => k.includes(name))];
        if (anim && this.menuCurrentAnim !== anim) {
            if (this.menuCurrentAnim) this.menuCurrentAnim.fadeOut(0.3);
            anim.reset().fadeIn(0.3).play();
            this.menuCurrentAnim = anim;
        }
    }
    
    animateMenu() {
        if (!this.isInMenu) return;
        requestAnimationFrame(() => this.animateMenu());
        
        const delta = this.clock.getDelta();
        if (this.menuMixer) this.menuMixer.update(delta);
        
        // Scratch logic: every 3 sec scratch for 2 sec, then back to sit
        const now = Date.now();
        if (!this.isScratching && now - this.lastScratchTime > this.scratchInterval) {
            this.playMenuAnimation('scratch');
            this.isScratching = true;
            this.scratchStartTime = now;
        }
        if (this.isScratching && now - this.scratchStartTime > this.scratchDuration) {
            this.playMenuAnimation('sit');
            this.isScratching = false;
            this.lastScratchTime = now;
        }
        
        // Gentle rotation
        if (this.menuDog) {
            this.menuDog.rotation.y = Math.sin(Date.now() * 0.001) * 0.2;
        }
        
        this.menuRenderer.render(this.menuScene, this.menuCamera);
    }
    
    // ==================== GAME SCENE ====================
    initGameScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(COLORS.black);
        
        // Cozy black fog - closer and denser
        this.scene.fog = new THREE.Fog(COLORS.black, 60, 180);
        
        const canvas = document.getElementById('gameCanvas');
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300);
        this.camera.position.set(0, 6, 12);
        this.camera.lookAt(0, 1, -20);
        
        this.renderer = new THREE.WebGLRenderer({ 
            canvas, 
            antialias: CONFIG.ANTIALIAS,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(CONFIG.PIXEL_RATIO);
        
        // Post-processing (Bloom)
        if (CONFIG.BLOOM) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
            
            const bloomPass = new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth, window.innerHeight),
                0.8,  // strength
                0.4,  // radius
                0.85  // threshold
            );
            this.composer.addPass(bloomPass);
        }
        
        // Lighting - minimal for performance
        const ambient = new THREE.AmbientLight(0x404040, 0.4);
        this.scene.add(ambient);
        
        const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
        mainLight.position.set(0, 20, 10);
        this.scene.add(mainLight);
        
        // Colored point lights for neon effect
        this.neonLight1 = new THREE.PointLight(this.phaseColor, 1, 50);
        this.neonLight1.position.set(0, 5, -30);
        this.scene.add(this.neonLight1);
    }
    
    // ==================== NEON GRID FLOOR ====================
    createNeonGrid() {
        // Grid using LineSegments - very efficient
        const gridSize = CONFIG.GRID_SIZE;
        const divisions = CONFIG.GRID_DIVISIONS;
        const step = gridSize / divisions;
        
        const vertices = [];
        const half = gridSize / 2;
        
        // Horizontal lines (going into distance)
        for (let i = -half; i <= half; i += step) {
            vertices.push(-half, 0, i);
            vertices.push(half, 0, i);
        }
        
        // Vertical lines
        for (let i = -half; i <= half; i += step) {
            vertices.push(i, 0, -half);
            vertices.push(i, 0, half);
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        
        this.gridMaterial = new THREE.LineBasicMaterial({
            color: this.phaseColor,
            transparent: true,
            opacity: 0.4,
        });
        
        this.grid = new THREE.LineSegments(geometry, this.gridMaterial);
        this.grid.position.y = -0.01;
        this.scene.add(this.grid);
        
        // Dark floor plane underneath
        const floorGeo = new THREE.PlaneGeometry(gridSize, gridSize);
        const floorMat = new THREE.MeshBasicMaterial({ 
            color: 0x050510,
            transparent: true,
            opacity: 0.95
        });
        this.floor = new THREE.Mesh(floorGeo, floorMat);
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.position.y = -0.02;
        this.scene.add(this.floor);
        
        // Side walls (neon strips)
        const wallGeo = new THREE.PlaneGeometry(0.1, gridSize);
        const wallMat = new THREE.MeshBasicMaterial({
            color: this.phaseColor,
            transparent: true,
            opacity: 0.6,
        });
        
        this.leftWall = new THREE.Mesh(wallGeo, wallMat.clone());
        this.leftWall.rotation.y = Math.PI / 2;
        this.leftWall.position.set(-8, 0.5, 0);
        this.scene.add(this.leftWall);
        
        this.rightWall = new THREE.Mesh(wallGeo, wallMat.clone());
        this.rightWall.rotation.y = -Math.PI / 2;
        this.rightWall.position.set(8, 0.5, 0);
        this.scene.add(this.rightWall);
    }
    
    // ==================== OBJECT POOLS ====================
    initPools() {
        // Obstacle pool - neon cubes
        this.obstaclePool = new ObjectPool(this.scene, () => {
            const geo = new THREE.BoxGeometry(2.5, 3, 2.5);
            const mat = new THREE.MeshBasicMaterial({
                color: this.phaseColor,
                transparent: true,
                opacity: 0.85,
            });
            const mesh = new THREE.Mesh(geo, mat);
            
            // Wireframe overlay for neon effect
            const wireGeo = new THREE.EdgesGeometry(geo);
            const wireMat = new THREE.LineBasicMaterial({ 
                color: 0xffffff,
                transparent: true,
                opacity: 0.9
            });
            const wire = new THREE.LineSegments(wireGeo, wireMat);
            mesh.add(wire);
            
            mesh.userData = { type: 'obstacle', baseY: 1.5, obstacleType: 'normal' };
            return mesh;
        }, CONFIG.MAX_OBSTACLES);
        
        // Shard pool - small glowing cubes
        this.shardPool = new ObjectPool(this.scene, () => {
            const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
            const mat = new THREE.MeshBasicMaterial({
                color: COLORS.cyan,
                transparent: true,
                opacity: 0.9,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.userData = { type: 'shard', baseY: 1.5 };
            return mesh;
        }, CONFIG.MAX_SHARDS);
        
        // Particle pool
        this.particlePool = new ObjectPool(this.scene, () => {
            const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
            const mat = new THREE.MeshBasicMaterial({
                color: COLORS.cyan,
                transparent: true,
                opacity: 1,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.userData = { vx: 0, vy: 0, vz: 0, life: 1 };
            return mesh;
        }, CONFIG.MAX_PARTICLES);
    }
    
    // ==================== PLAYER ====================
    loadPlayer() {
        this.loader.load('bulldog.glb', (gltf) => {
            this.dog = gltf.scene;
            this.dog.scale.set(CONFIG.DOG_SCALE, CONFIG.DOG_SCALE, CONFIG.DOG_SCALE);
            this.dog.position.set(0, CONFIG.DOG_Y, 0);
            this.dog.rotation.y = Math.PI;
            
            // Keep original brown colors - will add glow during boosts
            this.scene.add(this.dog);
            
            // Animations
            if (gltf.animations.length > 0) {
                this.mixer = new THREE.AnimationMixer(this.dog);
                gltf.animations.forEach(clip => {
                    const name = clip.name.toLowerCase();
                    this.animations[name] = this.mixer.clipAction(clip);
                });
                this.playAnimation('run');
            }
        });
    }
    
    playAnimation(name) {
        const keys = Object.keys(this.animations);
        const anim = this.animations[name] || 
                     this.animations[keys.find(k => k.includes(name))] ||
                     this.animations[keys[0]];
        
        if (anim && this.currentAnim !== anim) {
            if (this.currentAnim) this.currentAnim.fadeOut(0.2);
            anim.reset().fadeIn(0.2).play();
            this.currentAnim = anim;
        }
    }
    
    // ==================== INPUT ====================
    setupInput() {
        // Keyboard
        window.addEventListener('keydown', (e) => {
            if (!this.isPlaying || this.isGameOver) return;
            
            switch(e.key) {
                case 'ArrowLeft':
                case 'a':
                    this.moveLeft();
                    break;
                case 'ArrowRight':
                case 'd':
                    this.moveRight();
                    break;
                case 'ArrowUp':
                case 'w':
                case ' ':
                    this.jump();
                    break;
                case 'ArrowDown':
                case 's':
                    this.slide();
                    break;
            }
        });
        
        // Touch
        let touchStartX = 0;
        let touchStartY = 0;
        
        window.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });
        
        window.addEventListener('touchend', (e) => {
            if (!this.isPlaying || this.isGameOver) return;
            
            const dx = e.changedTouches[0].clientX - touchStartX;
            const dy = e.changedTouches[0].clientY - touchStartY;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            
            if (Math.max(absDx, absDy) < 30) return; // Too small
            
            if (absDx > absDy) {
                // Horizontal swipe
                if (dx > 0) this.moveRight();
                else this.moveLeft();
            } else {
                // Vertical swipe
                if (dy < 0) this.jump();
                else this.slide();
            }
        }, { passive: true });
    }
    
    moveLeft() {
        if (this.currentLane > 0) {
            this.currentLane--;
            this.targetX = CONFIG.LANES[this.currentLane];
        }
    }
    
    moveRight() {
        if (this.currentLane < 2) {
            this.currentLane++;
            this.targetX = CONFIG.LANES[this.currentLane];
        }
    }
    
    jump() {
        if (!this.isJumping && !this.isSliding) {
            this.isJumping = true;
            this.velocityY = CONFIG.JUMP_FORCE;
            // Keep running animation during jump
            this.sound.play('jump');
        }
    }
    
    slide() {
        if (!this.isJumping && !this.isSliding) {
            this.isSliding = true;
            this.slideTimer = CONFIG.SLIDE_DURATION;
            // Play lay animation instead of squashing
            this.playAnimation('lay');
            this.sound.play('slide');
        }
    }
    
    // ==================== SPAWNING ====================
    spawnObstacle() {
        const patterns = ['single', 'single', 'double', 'low', 'tall', 'corridor'];
        const pattern = patterns[Math.floor(Math.random() * patterns.length)];
        
        const z = this.lastObstacleZ - CONFIG.OBSTACLE_DISTANCE;
        
        switch(pattern) {
            case 'single':
                this.createObstacle(Math.floor(Math.random() * 3), z, 'normal');
                break;
                
            case 'double':
                // Block 2 lanes
                const open = Math.floor(Math.random() * 3);
                for (let i = 0; i < 3; i++) {
                    if (i !== open) this.createObstacle(i, z, 'normal');
                }
                break;
                
            case 'low':
                // Low barrier - need to slide
                this.createObstacle(Math.floor(Math.random() * 3), z, 'low');
                break;
                
            case 'tall':
                // Tall obstacle - must dodge
                this.createObstacle(Math.floor(Math.random() * 3), z, 'tall');
                break;
                
            case 'corridor':
                // Walls on sides
                this.createObstacle(0, z, 'tall');
                this.createObstacle(2, z, 'tall');
                break;
        }
        
        this.lastObstacleZ = z;
    }
    
    createObstacle(lane, z, type) {
        const obs = this.obstaclePool.get();
        const x = CONFIG.LANES[lane];
        
        // Adjust geometry based on type
        let scaleY = 1;
        let yPos = 1.5;
        
        switch(type) {
            case 'low':
                scaleY = 0.5;
                yPos = 2.5; // Floating
                obs.material.color.setHex(COLORS.green);
                break;
            case 'tall':
                scaleY = 2.5;
                yPos = 3.75;
                obs.material.color.setHex(COLORS.purple);
                break;
            default:
                obs.material.color.setHex(this.phaseColor);
        }
        
        obs.scale.set(1, scaleY, 1);
        obs.position.set(x, yPos, z);
        obs.userData.baseY = yPos;
        obs.userData.obstacleType = type;
    }
    
    spawnShardLine() {
        // Different patterns
        const patterns = ['straight', 'arc', 'zigzag', 'jump'];
        const pattern = patterns[Math.floor(Math.random() * patterns.length)];
        
        const startLane = Math.floor(Math.random() * 3);
        const count = 8 + Math.floor(Math.random() * 8);
        
        for (let i = 0; i < count; i++) {
            let lane = startLane;
            let yOffset = 0;
            
            switch(pattern) {
                case 'arc':
                    yOffset = Math.sin(i / count * Math.PI) * 4;
                    break;
                case 'zigzag':
                    lane = (startLane + Math.floor(i / 4)) % 3;
                    break;
                case 'jump':
                    if (i > count / 2) yOffset = 3; // Signal to jump
                    break;
            }
            
            const z = this.lastShardZ - i * CONFIG.SHARD_DISTANCE;
            this.createShard(CONFIG.LANES[lane], 1.5 + yOffset, z);
        }
        
        this.lastShardZ -= count * CONFIG.SHARD_DISTANCE + 10;
    }
    
    createShard(x, y, z) {
        const shard = this.shardPool.get();
        shard.position.set(x, y, z);
        shard.userData.baseY = y;
        shard.rotation.set(Math.random(), Math.random(), Math.random());
    }
    
    // ==================== UPDATE ====================
    update(delta) {
        if (!this.isPlaying || this.isGameOver || !this.dog) return;
        
        this.frameCount++;
        
        // Speed & distance
        this.speed = Math.min(this.speed + CONFIG.SPEED_INCREASE * delta, CONFIG.MAX_SPEED);
        this.distance += this.speed * delta;
        this.score = Math.floor(this.distance);
        
        // Phase check (every 10 frames)
        if (this.frameCount % 10 === 0) {
            this.updatePhase();
        }
        
        // Lane movement
        const dx = this.targetX - this.dog.position.x;
        if (Math.abs(dx) > 0.1) {
            this.dog.position.x += Math.sign(dx) * CONFIG.LANE_SWITCH_SPEED * delta;
        } else {
            this.dog.position.x = this.targetX;
        }
        
        // Jump physics
        if (this.isJumping) {
            this.velocityY += CONFIG.GRAVITY * delta;
            this.dog.position.y += this.velocityY * delta;
            
            if (this.dog.position.y <= CONFIG.DOG_Y) {
                this.dog.position.y = CONFIG.DOG_Y;
                this.isJumping = false;
                this.velocityY = 0;
                if (!this.isSliding) this.playAnimation('run');
            }
        }
        
        // Slide timer
        if (this.isSliding) {
            this.slideTimer -= delta * 1000;
            if (this.slideTimer <= 0) {
                this.isSliding = false;
                this.playAnimation('run');
            }
        }
        
        // Move obstacles
        const obstacles = this.obstaclePool.getActive();
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obs = obstacles[i];
            obs.position.z += this.speed * delta;
            
            if (obs.position.z > CONFIG.DESPAWN_Z) {
                this.obstaclePool.release(obs);
            }
        }
        
        // Move shards
        const shards = this.shardPool.getActive();
        for (let i = shards.length - 1; i >= 0; i--) {
            const shard = shards[i];
            shard.position.z += this.speed * delta;
            
            // Spin
            shard.rotation.x += delta * 3;
            shard.rotation.y += delta * 5;
            
            if (shard.position.z > CONFIG.DESPAWN_Z) {
                this.shardPool.release(shard);
            }
        }
        
        // Update particles (every 2 frames)
        if (this.frameCount % 2 === 0) {
            this.updateParticles(delta * 2);
        }
        
        // Spawn new objects
        const lastObsZ = obstacles.length > 0 
            ? Math.min(...obstacles.map(o => o.position.z)) 
            : 0;
        if (lastObsZ > CONFIG.SPAWN_Z + 50) {
            this.spawnObstacle();
        }
        
        const lastShardZ = shards.length > 0 
            ? Math.min(...shards.map(s => s.position.z)) 
            : 0;
        if (lastShardZ > CONFIG.SPAWN_Z + 30) {
            this.spawnShardLine();
        }
        
        // Collisions
        this.checkCollisions();
        
        // Update HUD
        this.updateHUD();
        
        // Move grid for motion effect
        this.grid.position.z = (this.distance * 0.5) % 5;
    }
    
    updatePhase() {
        for (let i = PHASES.length - 1; i >= 0; i--) {
            if (this.distance >= PHASES[i].distance) {
                if (this.currentPhase !== i) {
                    this.currentPhase = i;
                    this.phaseColor = PHASES[i].color;
                    this.applyPhaseColor();
                }
                break;
            }
        }
    }
    
    applyPhaseColor() {
        // Update grid
        this.gridMaterial.color.setHex(this.phaseColor);
        this.leftWall.material.color.setHex(this.phaseColor);
        this.rightWall.material.color.setHex(this.phaseColor);
        
        // Update neon light
        this.neonLight1.color.setHex(this.phaseColor);
        
        // Update dog emissive
        if (this.dog) {
            this.dog.traverse(child => {
                if (child.isMesh && child.material.emissive) {
                    child.material.emissive.setHex(this.phaseColor);
                }
            });
        }
    }
    
    updateParticles(delta) {
        const particles = this.particlePool.getActive();
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            const d = p.userData;
            
            p.position.x += d.vx * delta;
            p.position.y += d.vy * delta;
            p.position.z += d.vz * delta;
            
            d.vy -= 20 * delta;
            d.life -= delta * 2;
            p.material.opacity = Math.max(0, d.life);
            
            if (d.life <= 0) {
                this.particlePool.release(p);
            }
        }
    }
    
    spawnCollectParticles(pos) {
        for (let i = 0; i < 6; i++) {
            const p = this.particlePool.get();
            p.position.copy(pos);
            p.material.color.setHex(COLORS.cyan);
            p.material.opacity = 1;
            p.userData.vx = (Math.random() - 0.5) * 10;
            p.userData.vy = Math.random() * 8 + 2;
            p.userData.vz = (Math.random() - 0.5) * 10;
            p.userData.life = 1;
        }
    }
    
    // ==================== COLLISIONS ====================
    checkCollisions() {
        if (!this.dog) return;
        
        const px = this.dog.position.x;
        const py = this.dog.position.y;
        const pz = this.dog.position.z;
        const playerHeight = this.isSliding ? 1.5 : 4;
        
        // Check obstacles
        const obstacles = this.obstaclePool.getActive();
        for (const obs of obstacles) {
            const oz = obs.position.z;
            if (Math.abs(oz - pz) > 3) continue;
            
            const ox = obs.position.x;
            if (Math.abs(ox - px) > 2) continue;
            
            const type = obs.userData.obstacleType;
            const oy = obs.userData.baseY;
            
            // Low obstacle - must slide
            if (type === 'low') {
                if (!this.isSliding) {
                    this.gameOver();
                    return;
                }
                continue;
            }
            
            // Tall obstacle - must dodge
            if (type === 'tall') {
                this.gameOver();
                return;
            }
            
            // Normal - can jump over
            if (py < oy - 1) {
                this.gameOver();
                return;
            }
        }
        
        // Check shards
        const shards = this.shardPool.getActive();
        for (let i = shards.length - 1; i >= 0; i--) {
            const shard = shards[i];
            const sx = shard.position.x;
            const sy = shard.position.y;
            const sz = shard.position.z;
            
            if (Math.abs(sx - px) < 1.5 && 
                Math.abs(sz - pz) < 1.5 && 
                Math.abs(sy - py - 2) < 2) {
                
                this.spawnCollectParticles(shard.position.clone());
                this.shardPool.release(shard);
                this.shards++;
                this.sound.play('coin');
            }
        }
    }
    
    // ==================== GAME FLOW ====================
    startGame() {
        this.isInMenu = false;
        this.isPlaying = true;
        this.isGameOver = false;
        
        document.getElementById('menu').style.display = 'none';
        document.getElementById('gameContainer').style.display = 'block';
        
        // Reset state
        this.score = 0;
        this.shards = 0;
        this.distance = 0;
        this.speed = CONFIG.INITIAL_SPEED;
        this.currentLane = 1;
        this.targetX = 0;
        this.velocityY = 0;
        this.isJumping = false;
        this.isSliding = false;
        this.currentPhase = 0;
        this.phaseColor = COLORS.green;
        this.lastObstacleZ = -30;
        this.lastShardZ = -20;
        
        // Init scene
        this.initGameScene();
        this.createNeonGrid();
        this.initPools();
        this.loadPlayer();
        this.setupInput();
        
        // Initial spawns
        for (let i = 0; i < 3; i++) {
            this.spawnShardLine();
        }
        this.spawnObstacle();
        
        this.sound.startMusic();
        this.animate();
    }
    
    restartGame() {
        // Clear pools
        this.obstaclePool.releaseAll();
        this.shardPool.releaseAll();
        this.particlePool.releaseAll();
        
        // Reset state
        this.score = 0;
        this.shards = 0;
        this.distance = 0;
        this.speed = CONFIG.INITIAL_SPEED;
        this.currentLane = 1;
        this.targetX = 0;
        this.velocityY = 0;
        this.isJumping = false;
        this.isSliding = false;
        this.isGameOver = false;
        this.isPlaying = true;
        this.currentPhase = 0;
        this.phaseColor = COLORS.green;
        this.lastObstacleZ = -30;
        this.lastShardZ = -20;
        
        // Reset dog
        if (this.dog) {
            this.dog.position.set(0, CONFIG.DOG_Y, 0);
            this.dog.scale.set(CONFIG.DOG_SCALE, CONFIG.DOG_SCALE, CONFIG.DOG_SCALE);
        }
        
        this.applyPhaseColor();
        
        // New spawns
        for (let i = 0; i < 3; i++) {
            this.spawnShardLine();
        }
        this.spawnObstacle();
        
        document.getElementById('gameOver').style.display = 'none';
        this.playAnimation('run');
        this.sound.startMusic();
    }
    
    gameOver() {
        this.isPlaying = false;
        this.isGameOver = true;
        this.sound.stopMusic();
        
        setTimeout(() => this.sound.play('crash'), 50);
        
        // Save best
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('badrik_best', this.bestScore);
        }
        
        // Show UI
        document.getElementById('gameOver').style.display = 'flex';
        document.getElementById('finalScore').textContent = this.score.toLocaleString();
        document.getElementById('finalShards').textContent = this.shards.toLocaleString();
        document.getElementById('finalDistance').textContent = Math.floor(this.distance) + 'm';
        document.getElementById('bestScore').textContent = this.bestScore.toLocaleString();
    }
    
    backToMenu() {
        this.isPlaying = false;
        this.isInMenu = true;
        this.sound.stopMusic();
        
        document.getElementById('gameContainer').style.display = 'none';
        document.getElementById('gameOver').style.display = 'none';
        document.getElementById('menu').style.display = 'flex';
        
        this.animateMenu();
    }
    
    // ==================== UI ====================
    initUI() {
        document.getElementById('playBtn').addEventListener('click', () => {
            this.sound.play('button');
            this.startGame();
        });
        
        document.getElementById('playAgain').addEventListener('click', () => {
            this.sound.play('button');
            this.restartGame();
        });
        
        document.getElementById('backToMenu').addEventListener('click', () => {
            this.sound.play('button');
            this.backToMenu();
        });
        
        document.getElementById('connectWallet').addEventListener('click', async () => {
            this.sound.play('button');
            const ok = await this.wallet.connect();
            if (ok) {
                document.getElementById('connectWallet').style.display = 'none';
                document.getElementById('walletInfo').style.display = 'flex';
                document.querySelector('.wallet-address').textContent = this.wallet.getShortAddress();
            }
        });
        
        // Resize
        window.addEventListener('resize', () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            
            if (this.menuCamera) {
                this.menuCamera.aspect = w / h;
                this.menuCamera.updateProjectionMatrix();
            }
            if (this.menuRenderer) {
                this.menuRenderer.setSize(w, h);
            }
            if (this.camera) {
                this.camera.aspect = w / h;
                this.camera.updateProjectionMatrix();
            }
            if (this.renderer) {
                this.renderer.setSize(w, h);
            }
            if (this.composer) {
                this.composer.setSize(w, h);
            }
        });
    }
    
    updateHUD() {
        document.getElementById('score').textContent = this.score.toLocaleString();
        document.getElementById('shards').textContent = this.shards;
        document.getElementById('distance').textContent = Math.floor(this.distance) + 'm';
    }
    
    // ==================== RENDER LOOP ====================
    animate() {
        if (!this.isPlaying && !this.isGameOver) return;
        
        requestAnimationFrame(() => this.animate());
        
        const delta = Math.min(this.clock.getDelta(), 0.05); // Cap delta
        
        if (this.mixer) this.mixer.update(delta);
        
        this.update(delta);
        
        // Render
        if (CONFIG.BLOOM && this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }
}

// ==================== START ====================
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
