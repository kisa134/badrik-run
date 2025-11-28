/**
 * BADRIK RUN - Subway Surfer Style Runner v1.8
 * Fixed Curved World, New Sounds, Better Visuals
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==================== GAME CONFIG ====================
const CONFIG = {
    LANE_WIDTH: 2.5,
    LANES: [-2.5, 0, 2.5],
    
    INITIAL_SPEED: 22,
    MAX_SPEED: 45,
    SPEED_INCREASE: 0.3,
    
    JUMP_FORCE: 14,
    GRAVITY: -40,
    LANE_SWITCH_SPEED: 18,
    
    // More obstacles and coins!
    OBSTACLE_SPAWN_DISTANCE: 35,
    MIN_OBSTACLE_GAP: 18,
    
    COIN_SPAWN_DISTANCE: 25,
    COIN_VALUE: 10,
    
    GROUND_LENGTH: 100,
    GROUND_SEGMENTS: 8,
    
    SLIDE_DURATION: 600,
    DOG_SCALE: 5,
    
    SCRATCH_INTERVAL: 4000,
    SCRATCH_DURATION: 2000,
    
    // Curved world - bends DOWN like Subway Surfers
    CURVE_STRENGTH: 0.0004,
    
    // Spawn distances
    SPAWN_START_Z: -180,
    DECORATION_SPAWN_Z: -250,
    
    // Fog
    FOG_NEAR: 50,
    FOG_FAR: 250,
    
    // Two-level system (run on top of obstacles)
    GROUND_LEVEL: 0,
    TOP_LEVEL: 4,  // Height of obstacle tops
    
    // Biomes
    BIOME_LENGTH: 1000,
};

// ==================== BIOMES ====================
const BIOMES = {
    park: {
        name: "Sunny Park",
        skyColor: 0x87CEEB,
        fogColor: 0x87CEEB,
        groundColor: 0x4a7c32,
        wallColor: 0x228B22,
        decorColor1: 0x228B22, // Trees
        decorColor2: 0x8B4513, // Benches
        ambientColor: 0xffffcc,
        startDistance: 0,
    },
    city: {
        name: "Crypto City",
        skyColor: 0x1a1a2e,
        fogColor: 0x1a1a2e,
        groundColor: 0x333344,
        wallColor: 0x14F195,
        decorColor1: 0x444466, // Buildings
        decorColor2: 0x9945FF, // Billboards
        ambientColor: 0x9945FF,
        startDistance: 1000,
    },
    moon: {
        name: "To The Moon",
        skyColor: 0x0a0a15,
        fogColor: 0x0a0a15,
        groundColor: 0x2a2a3a,
        wallColor: 0xffaa00,
        decorColor1: 0x555566, // Craters
        decorColor2: 0xff6600, // Rockets
        ambientColor: 0xffcc00,
        startDistance: 2000,
    }
};

// ==================== SOUND MANAGER ====================
class SoundManager {
    constructor() {
        this.sounds = {};
        this.menuMusic = null;
        this.gameMusic = [];
        this.currentGameMusic = null;
        this.enabled = true;
        this.musicPlaying = false;
    }
    
    async load() {
        // Sound effects
        const soundFiles = {
            coin: 'coin-take.mp3',
            crash: 'Destruction/BrittleGlassIce1.mp3',
            jump: 'jump.mp3',
            slide: 'Drag/Grittyirregulargr5.mp3',
            button: 'Inventory/Menufriendlysounds10.mp3',
        };
        
        for (const [name, path] of Object.entries(soundFiles)) {
            try {
                const audio = new Audio(path);
                audio.volume = 0.5;
                this.sounds[name] = audio;
            } catch (e) {
                console.warn(`Failed to load sound: ${path}`);
            }
        }
        
        // Menu music
        try {
            this.menuMusic = new Audio('menu.mp3');
            this.menuMusic.loop = true;
            this.menuMusic.volume = 0.25;
        } catch (e) {}
        
        // Game music (2 tracks, random)
        try {
            this.gameMusic = [
                new Audio('game1.mp3'),
                new Audio('game2.mp3')
            ];
            this.gameMusic.forEach(m => {
                m.loop = true;
                m.volume = 0.3;
            });
        } catch (e) {}
    }
    
    play(name) {
        if (!this.enabled || !this.sounds[name]) return;
        try {
            const sound = this.sounds[name].cloneNode();
            sound.volume = name === 'coin' ? 0.5 : 0.6;
            sound.play().catch(() => {});
        } catch (e) {}
    }
    
    startMenuMusic() {
        this.stopAllMusic();
        if (this.menuMusic) {
            this.menuMusic.play().catch(() => {});
            this.musicPlaying = true;
        }
    }
    
    startGameMusic() {
        this.stopAllMusic();
        if (this.gameMusic.length > 0) {
            // Pick random game track
            const idx = Math.floor(Math.random() * this.gameMusic.length);
            this.currentGameMusic = this.gameMusic[idx];
            this.currentGameMusic.play().catch(() => {});
            this.musicPlaying = true;
        }
    }
    
    stopAllMusic() {
        if (this.menuMusic) {
            this.menuMusic.pause();
            this.menuMusic.currentTime = 0;
        }
        if (this.currentGameMusic) {
            this.currentGameMusic.pause();
            this.currentGameMusic.currentTime = 0;
        }
        this.musicPlaying = false;
    }
}


// ==================== WALLET MANAGER ====================
class WalletManager {
    constructor() {
        this.connected = false;
        this.address = null;
        this.provider = null;
    }
    
    async connect() {
        try {
            if (!window.solana || !window.solana.isPhantom) {
                window.open('https://phantom.app/', '_blank');
                return false;
            }
            this.provider = window.solana;
            const response = await this.provider.connect();
            this.address = response.publicKey.toString();
            this.connected = true;
            return true;
        } catch (error) {
            console.error('Wallet connection failed:', error);
            return false;
        }
    }
    
    getShortAddress() {
        if (!this.address) return '';
        return this.address.slice(0, 4) + '...' + this.address.slice(-4);
    }
}

// ==================== BACKEND API ====================
const API_URL = 'https://badrik-api.onrender.com';

class GameAPI {
    static async submitScore(wallet, score, coins, distance) {
        try {
            const response = await fetch(`${API_URL}/api/score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet, score, coins, distance })
            });
            return await response.json();
        } catch (error) {
            console.error('Failed to submit score:', error);
            return null;
        }
    }
    
    static async getLeaderboard(limit = 10) {
        try {
            const response = await fetch(`${API_URL}/api/leaderboard?limit=${limit}`);
            return await response.json();
        } catch (error) {
            return [];
        }
    }
}


// ==================== MAIN GAME CLASS ====================
class BadrikRunner {
    constructor() {
        this.wallet = new WalletManager();
        this.sound = new SoundManager();
        this.textureLoader = new THREE.TextureLoader();
        this.loader = new GLTFLoader();
        
        // State
        this.isPlaying = false;
        this.isGameOver = false;
        this.selectedSkin = 'white';
        this.isInMenu = true;
        
        // Score
        this.score = 0;
        this.coins = 0;
        this.distance = 0;
        this.bestScore = parseInt(localStorage.getItem('badrik_best') || '0');
        
        // Three.js
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();
        
        // Menu
        this.menuScene = null;
        this.menuCamera = null;
        this.menuRenderer = null;
        this.menuDog = null;
        this.menuMixer = null;
        this.menuAnimations = {};
        this.menuAnimState = 'sit'; // 'sit' or 'scratch'
        this.lastScratchTime = 0;
        this.scratchStartTime = 0;
        
        // Player
        this.dog = null;
        this.mixer = null;
        this.animations = {};
        this.currentAnimName = '';
        this.currentLane = 1;
        this.targetX = 0;
        this.velocityY = 0;
        this.isJumping = false;
        this.isSliding = false;
        this.slideTimer = 0;
        
        // World
        this.speed = CONFIG.INITIAL_SPEED;
        this.grounds = [];
        this.obstacles = [];
        this.coinObjects = [];
        this.decorations = [];
        this.lastObstacleZ = -30;
        this.lastCoinZ = -20;
        this.lastDecorationZ = -20;
        
        // Biomes
        this.currentBiome = 'park';
        this.biomeObjects = [];
        
        // 3D Models
        this.boneModel = null;
        
        // Particles
        this.particles = [];
        this.dustParticles = null;
        
        // Textures
        this.textures = {};
        this.textureMap = {
            'white': 'frenchbulldog.texture.white.001.png',
            'fawn': 'frenchbulldog.texture.fawn.001.png',
            'blackpied': 'frenchbulldog.texture.blackpied.001.png'
        };
        
        // Input
        this.touchStartX = 0;
        this.touchStartY = 0;
        
        this.init();
    }
    
    async init() {
        await this.sound.load();
        
        for (const [key, path] of Object.entries(this.textureMap)) {
            const tex = this.textureLoader.load(path);
            tex.flipY = false;
            tex.colorSpace = THREE.SRGBColorSpace;
            this.textures[key] = tex;
        }
        
        // Load bone model
        this.loader.load('Cartoon_dog_bone_gol_1128113819_texture.glb', (gltf) => {
            this.boneModel = gltf.scene;
            console.log('🦴 Bone model loaded!');
        });
        
        this.initMenuScene();
        this.initUI();
        this.sound.startMenuMusic(); // Start menu music
        this.animateMenu();
    }


    // ==================== MENU SCENE ====================
    initMenuScene() {
        this.menuScene = new THREE.Scene();
        this.menuScene.background = new THREE.Color(0x0a0a1a);
        
        // Camera positioned for sitting dog
        this.menuCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
        this.menuCamera.position.set(0, 0.5, 1.8);
        this.menuCamera.lookAt(0, 0.25, 0);
        
        const canvas = document.getElementById('menuCanvas');
        this.menuRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.menuRenderer.setSize(window.innerWidth, window.innerHeight);
        this.menuRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // Strong lighting
        const keyLight = new THREE.DirectionalLight(0xffffff, 2);
        keyLight.position.set(2, 3, 3);
        this.menuScene.add(keyLight);
        
        const fillLight = new THREE.DirectionalLight(0xffc864, 1);
        fillLight.position.set(-2, 2, 2);
        this.menuScene.add(fillLight);
        
        const backLight = new THREE.DirectionalLight(0x14F195, 0.8);
        backLight.position.set(0, 2, -2);
        this.menuScene.add(backLight);
        
        this.menuScene.add(new THREE.AmbientLight(0xffffff, 0.5));
        
        // Floor
        const floorGeo = new THREE.PlaneGeometry(5, 5);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.01;
        this.menuScene.add(floor);
        
        this.loadMenuDog();
        window.addEventListener('resize', () => this.onResize());
    }
    
    loadMenuDog() {
        this.loader.load('bulldog.glb', (gltf) => {
            this.menuDog = gltf.scene;
            this.menuDog.scale.set(1, 1, 1);
            this.menuDog.position.set(0, 0, 0);
            this.menuDog.rotation.y = 0;
            
            this.applyTexture(this.menuDog, 'white');
            this.menuScene.add(this.menuDog);
            
            // Setup animations
            if (gltf.animations.length > 0) {
                this.menuMixer = new THREE.AnimationMixer(this.menuDog);
                
                gltf.animations.forEach(clip => {
                    const action = this.menuMixer.clipAction(clip);
                    action.clampWhenFinished = true;
                    this.menuAnimations[clip.name] = action;
                });
                
                // Start sitting
                this.playMenuAnimation('sit', true);
                this.menuAnimState = 'sit';
                this.lastScratchTime = Date.now();
                
                console.log('Menu animations:', Object.keys(this.menuAnimations));
            }
        });
    }
    
    playMenuAnimation(name, loop = true) {
        const animName = Object.keys(this.menuAnimations).find(n => 
            n.toLowerCase().includes(name.toLowerCase())
        );
        if (!animName) return;
        
        // Fade out all
        Object.values(this.menuAnimations).forEach(a => a.fadeOut(0.3));
        
        const action = this.menuAnimations[animName];
        action.reset();
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
        action.fadeIn(0.3);
        action.play();
    }
    
    applyTexture(model, skinName) {
        const texture = this.textures[skinName];
        if (!texture) return;
        
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                // Always create fresh opaque material with texture
                child.material = new THREE.MeshStandardMaterial({
                    map: texture,
                    roughness: 0.6,
                    metalness: 0.1,
                    transparent: false,
                    opacity: 1.0
                });
            }
        });
    }


    // ==================== UI ====================
    initUI() {
        // Wallet
        document.getElementById('connectWallet').addEventListener('click', async () => {
            this.sound.play('button');
            const success = await this.wallet.connect();
            if (success) {
                document.getElementById('connectWallet').style.display = 'none';
                const walletInfo = document.getElementById('walletInfo');
                walletInfo.style.display = 'flex';
                walletInfo.querySelector('.wallet-address').textContent = this.wallet.getShortAddress();
            }
        });
        
        // Skins
        document.querySelectorAll('.skin-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.sound.play('button');
                document.querySelectorAll('.skin-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedSkin = btn.dataset.skin;
                if (this.menuDog) this.applyTexture(this.menuDog, this.selectedSkin);
            });
        });
        
        // Start
        document.getElementById('startGame').addEventListener('click', () => {
            this.sound.play('button');
            this.startGame();
        });
        
        // Game over buttons
        document.getElementById('playAgain').addEventListener('click', () => {
            this.sound.play('button');
            this.restartGame();
        });
        document.getElementById('backToMenu').addEventListener('click', () => {
            this.sound.play('button');
            this.backToMenu();
        });
        document.getElementById('shareTwitter').addEventListener('click', () => this.shareOnTwitter());
        
        // Modals
        document.getElementById('showLeaderboard').addEventListener('click', (e) => {
            e.preventDefault();
            this.showLeaderboard();
        });
        document.getElementById('showReferral').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('referralModal').style.display = 'flex';
        });
        
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
            });
        });
        
        document.getElementById('copyReferral').addEventListener('click', () => {
            const input = document.getElementById('referralLink');
            input.select();
            document.execCommand('copy');
            document.getElementById('copyReferral').textContent = 'Copied!';
            setTimeout(() => document.getElementById('copyReferral').textContent = 'Copy', 2000);
        });
    }
    
    async showLeaderboard() {
        document.getElementById('leaderboardModal').style.display = 'flex';
        document.getElementById('leaderboardList').innerHTML = '<div class="loading">Loading...</div>';
        
        const mockData = [
            { wallet: '7xK9...3mPq', score: 158000 },
            { wallet: '3nB2...9xLw', score: 142500 },
            { wallet: '9pM1...2kJr', score: 138200 },
        ];
        
        let html = '';
        mockData.forEach((entry, i) => {
            html += `
                <div class="leaderboard-item ${i < 3 ? 'top-3' : ''}">
                    <span class="leaderboard-rank">${i + 1}</span>
                    <span class="leaderboard-address">${entry.wallet}</span>
                    <span class="leaderboard-score">${entry.score.toLocaleString()}</span>
                </div>
            `;
        });
        document.getElementById('leaderboardList').innerHTML = html;
    }
    
    shareOnTwitter() {
        const text = `🐕 I scored ${this.score.toLocaleString()} in BADRIK RUN!\n\nPlay & earn $BADRIK: ${window.location.href}\n\n#BADRIK #Solana`;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
    }


    // ==================== GAME START ====================
    startGame() {
        this.isInMenu = false;
        this.isPlaying = true;
        this.isGameOver = false;
        
        document.getElementById('menu').style.display = 'none';
        document.getElementById('gameContainer').style.display = 'block';
        document.getElementById('gameOver').style.display = 'none';
        
        this.score = 0;
        this.coins = 0;
        this.distance = 0;
        this.speed = CONFIG.INITIAL_SPEED;
        this.currentLane = 1;
        this.targetX = CONFIG.LANES[1];
        this.velocityY = 0;
        this.isJumping = false;
        this.isSliding = false;
        this.lastObstacleZ = CONFIG.SPAWN_START_Z;
        this.lastCoinZ = CONFIG.SPAWN_START_Z;
        this.obstacles = [];
        this.coinObjects = [];
        
        this.initGameScene();
        this.createWorld();
        this.loadPlayer();
        this.setupInput();
        this.spawnInitialObjects();
        this.updateHUD();
        this.sound.startGameMusic(); // Start game music!
        this.animate();
    }
    
    spawnInitialObjects() {
        for (let i = 0; i < 3; i++) {
            this.spawnCoinRow();
        }
        this.spawnObstacle();
    }
    
    restartGame() {
        this.obstacles.forEach(o => this.scene.remove(o));
        this.coinObjects.forEach(c => this.scene.remove(c));
        this.decorations.forEach(d => this.scene.remove(d));
        this.obstacles = [];
        this.coinObjects = [];
        this.decorations = [];
        
        if (this.dog) {
            this.dog.position.set(CONFIG.LANES[1], 0, 0);
            this.dog.scale.set(CONFIG.DOG_SCALE, CONFIG.DOG_SCALE, CONFIG.DOG_SCALE);
        }
        
        this.score = 0;
        this.coins = 0;
        this.distance = 0;
        this.speed = CONFIG.INITIAL_SPEED;
        this.currentLane = 1;
        this.targetX = CONFIG.LANES[1];
        this.velocityY = 0;
        this.isJumping = false;
        this.isSliding = false;
        this.isGameOver = false;
        this.isPlaying = true;
        this.lastObstacleZ = CONFIG.SPAWN_START_Z;
        this.lastCoinZ = CONFIG.SPAWN_START_Z;
        this.lastDecorationZ = CONFIG.DECORATION_SPAWN_Z;
        
        // Reset biome to park
        this.currentBiome = 'park';
        this.transitionToBiome('park');
        
        // Respawn decorations
        this.spawnDecorations();
        
        document.getElementById('gameOver').style.display = 'none';
        this.playAnimation('run');
        this.spawnInitialObjects();
        this.updateHUD();
        this.sound.startGameMusic();
    }
    
    backToMenu() {
        this.isPlaying = false;
        this.isInMenu = true;
        this.sound.stopAllMusic();
        this.sound.startMenuMusic(); // Start menu music
        
        document.getElementById('gameContainer').style.display = 'none';
        document.getElementById('gameOver').style.display = 'none';
        document.getElementById('menu').style.display = 'block';
        
        // Reset menu animation state
        this.menuAnimState = 'sit';
        this.lastScratchTime = Date.now();
        this.playMenuAnimation('sit', true);
        
        this.animateMenu();
    }


    // ==================== GAME SCENE ====================
    initGameScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue for park
        this.scene.fog = new THREE.Fog(0x87CEEB, CONFIG.FOG_NEAR, CONFIG.FOG_FAR);
        
        const canvas = document.getElementById('gameCanvas');
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
        // Camera behind and above dog
        this.camera.position.set(0, 8, 18);
        this.camera.lookAt(0, 2, -20);
        
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        
        // Lighting
        const sun = new THREE.DirectionalLight(0xffffff, 1.5);
        sun.position.set(20, 50, 20);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.far = 150;
        sun.shadow.camera.left = -50;
        sun.shadow.camera.right = 50;
        sun.shadow.camera.top = 50;
        sun.shadow.camera.bottom = -50;
        this.scene.add(sun);
        
        this.scene.add(new THREE.AmbientLight(0xffc864, 0.4));
        this.scene.add(new THREE.HemisphereLight(0x14F195, 0x1a0a2e, 0.3));
        
        // Store lights for biome changes
        this.sunLight = this.scene.children.find(c => c.type === 'DirectionalLight');
    }
    
    createWorld() {
        const biome = BIOMES[this.currentBiome];
        
        // Load textures
        const roadTexture = this.textureLoader.load('road.png');
        roadTexture.wrapS = THREE.RepeatWrapping;
        roadTexture.wrapT = THREE.RepeatWrapping;
        roadTexture.repeat.set(1, 8);
        
        const grassTexture = this.textureLoader.load('grass (1).png');
        grassTexture.wrapS = THREE.RepeatWrapping;
        grassTexture.wrapT = THREE.RepeatWrapping;
        grassTexture.repeat.set(3, 8);
        
        // Create curved road geometry - curves DOWN only (like Subway Surfers)
        const roadGeo = new THREE.PlaneGeometry(10, CONFIG.GROUND_LENGTH, 1, 50);
        
        // Bend the road DOWN at distance (NOT left/right!)
        const pos = roadGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const z = pos.getZ(i);
            if (z < 0) {
                // Curve DOWN based on distance squared
                const curveY = z * z * CONFIG.CURVE_STRENGTH;
                pos.setY(i, curveY);
            }
        }
        roadGeo.computeVertexNormals();
        
        const roadMat = new THREE.MeshStandardMaterial({ 
            map: roadTexture,
            roughness: 0.8 
        });
        
        // Create grass geometry (sides) - same DOWN curve
        const grassGeo = new THREE.PlaneGeometry(15, CONFIG.GROUND_LENGTH, 1, 50);
        const grassPos = grassGeo.attributes.position;
        for (let i = 0; i < grassPos.count; i++) {
            const z = grassPos.getZ(i);
            if (z < 0) {
                const curveY = z * z * CONFIG.CURVE_STRENGTH;
                grassPos.setY(i, curveY);
            }
        }
        grassGeo.computeVertexNormals();
        
        const grassMat = new THREE.MeshStandardMaterial({ 
            map: grassTexture,
            roughness: 0.7 
        });
        
        for (let i = 0; i < CONFIG.GROUND_SEGMENTS; i++) {
            const zPos = -i * CONFIG.GROUND_LENGTH + CONFIG.GROUND_LENGTH / 2;
            
            // Road (center)
            const road = new THREE.Mesh(roadGeo.clone(), roadMat.clone());
            road.rotation.x = -Math.PI / 2;
            road.position.set(0, 0.01, zPos);
            road.receiveShadow = true;
            road.userData.type = 'ground';
            this.scene.add(road);
            this.grounds.push(road);
            this.biomeObjects.push(road);
            
            // Grass left
            const grassL = new THREE.Mesh(grassGeo.clone(), grassMat.clone());
            grassL.rotation.x = -Math.PI / 2;
            grassL.position.set(-12.5, 0, zPos);
            grassL.receiveShadow = true;
            this.scene.add(grassL);
            
            // Grass right
            const grassR = new THREE.Mesh(grassGeo.clone(), grassMat.clone());
            grassR.rotation.x = -Math.PI / 2;
            grassR.position.set(13, 0, -i * CONFIG.GROUND_LENGTH + CONFIG.GROUND_LENGTH / 2);
            grassR.rotation.x = -Math.PI / 2;
            grassR.position.set(12.5, 0, zPos);
            grassR.receiveShadow = true;
            this.scene.add(grassR);
        }
        
        // Lane lines
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
        [-CONFIG.LANE_WIDTH, CONFIG.LANE_WIDTH].forEach(x => {
            const lineGeo = new THREE.PlaneGeometry(0.15, CONFIG.GROUND_LENGTH * CONFIG.GROUND_SEGMENTS);
            const line = new THREE.Mesh(lineGeo, lineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(x, 0.03, -CONFIG.GROUND_LENGTH * 2);
            this.scene.add(line);
        });
        
        // Side walls with biome color
        const wallMat = new THREE.MeshStandardMaterial({ 
            color: biome.wallColor, 
            emissive: biome.wallColor, 
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.5
        });
        
        this.walls = [];
        [-12, 12].forEach(x => {
            const wallGeo = new THREE.BoxGeometry(0.5, 6, CONFIG.GROUND_LENGTH * CONFIG.GROUND_SEGMENTS);
            const wall = new THREE.Mesh(wallGeo, wallMat.clone());
            wall.position.set(x, 3, -CONFIG.GROUND_LENGTH * 2);
            wall.userData.type = 'wall';
            this.scene.add(wall);
            this.walls.push(wall);
            this.biomeObjects.push(wall);
        });
        
        // Spawn initial decorations
        this.spawnDecorations();
    }
    
    // ==================== BIOME SYSTEM ====================
    getBiomeForDistance(dist) {
        if (dist >= BIOMES.moon.startDistance) return 'moon';
        if (dist >= BIOMES.city.startDistance) return 'city';
        return 'park';
    }
    
    updateBiome() {
        const newBiome = this.getBiomeForDistance(this.distance);
        if (newBiome !== this.currentBiome) {
            this.currentBiome = newBiome;
            this.transitionToBiome(newBiome);
        }
    }
    
    transitionToBiome(biomeName) {
        const biome = BIOMES[biomeName];
        
        // Update sky/fog
        this.scene.background = new THREE.Color(biome.skyColor);
        this.scene.fog.color = new THREE.Color(biome.fogColor);
        
        // Update ground colors
        this.grounds.forEach(ground => {
            ground.material.color.setHex(biome.groundColor);
        });
        
        // Update wall colors
        this.walls.forEach(wall => {
            wall.material.color.setHex(biome.wallColor);
            wall.material.emissive.setHex(biome.wallColor);
        });
        
        console.log(`🌍 Entered: ${biome.name}`);
    }
    
    // ==================== DECORATIONS ====================
    spawnDecorations() {
        const biome = BIOMES[this.currentBiome];
        
        // Spawn decorations on both sides - FURTHER away
        for (let i = 0; i < 15; i++) {
            this.spawnDecoration(-10 - Math.random() * 4, -i * 25 - Math.random() * 15 - 50);
            this.spawnDecoration(10 + Math.random() * 4, -i * 25 - Math.random() * 15 - 50);
        }
        this.lastDecorationZ = CONFIG.DECORATION_SPAWN_Z;
    }
    
    spawnDecoration(x, z) {
        const biome = BIOMES[this.currentBiome];
        const isLeft = x < 0;
        
        let geometry, material, yPos, scaleY;
        
        // Different decorations per biome
        if (this.currentBiome === 'park') {
            // Trees and benches
            if (Math.random() > 0.3) {
                // Tree (cylinder + sphere)
                geometry = new THREE.CylinderGeometry(0.3, 0.5, 4, 8);
                material = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
                yPos = 2;
                scaleY = 1 + Math.random() * 0.5;
                
                const tree = new THREE.Mesh(geometry, material);
                tree.position.set(x, yPos, z);
                tree.scale.y = scaleY;
                tree.userData = { type: 'decoration', baseX: x, baseY: yPos };
                this.scene.add(tree);
                this.decorations.push(tree);
                
                // Tree top
                const topGeo = new THREE.SphereGeometry(2, 8, 6);
                const topMat = new THREE.MeshStandardMaterial({ color: biome.decorColor1 });
                const top = new THREE.Mesh(topGeo, topMat);
                const topY = 5 + scaleY;
                top.position.set(x, topY, z);
                top.userData = { type: 'decoration', baseX: x, baseY: topY };
                this.scene.add(top);
                this.decorations.push(top);
            } else {
                // Bench
                geometry = new THREE.BoxGeometry(2, 0.5, 1);
                material = new THREE.MeshStandardMaterial({ color: biome.decorColor2 });
                yPos = 0.5;
            }
        } else if (this.currentBiome === 'city') {
            // Buildings
            const height = 5 + Math.random() * 15;
            geometry = new THREE.BoxGeometry(3 + Math.random() * 2, height, 3 + Math.random() * 2);
            material = new THREE.MeshStandardMaterial({ 
                color: biome.decorColor1,
                emissive: Math.random() > 0.5 ? biome.decorColor2 : 0x000000,
                emissiveIntensity: 0.2
            });
            yPos = height / 2;
        } else {
            // Moon - craters and rockets
            if (Math.random() > 0.2) {
                // Crater
                geometry = new THREE.CylinderGeometry(2, 3, 0.5, 12);
                material = new THREE.MeshStandardMaterial({ color: biome.decorColor1 });
                yPos = 0.1;
            } else {
                // Rocket
                geometry = new THREE.ConeGeometry(1, 6, 8);
                material = new THREE.MeshStandardMaterial({ 
                    color: 0xcccccc,
                    emissive: biome.decorColor2,
                    emissiveIntensity: 0.5
                });
                yPos = 3;
            }
        }
        
        if (geometry) {
            const deco = new THREE.Mesh(geometry, material);
            deco.position.set(x, yPos, z);
            deco.castShadow = true;
            deco.userData = { type: 'decoration', baseX: x, baseY: yPos };
            this.scene.add(deco);
            this.decorations.push(deco);
        }
    }
    
    // ==================== CURVED WORLD ====================
    applyCurvedWorld(obj) {
        if (!obj || obj.position.z > 10) return;
        
        const z = -obj.position.z;
        if (z > 0) {
            // Curve down based on distance
            const curve = z * z * CONFIG.CURVE_STRENGTH;
            obj.position.y = (obj.userData.baseY || obj.position.y) - curve;
        }
    }


    // ==================== PLAYER ====================
    loadPlayer() {
        this.loader.load('bulldog.glb', (gltf) => {
            this.dog = gltf.scene;
            // 5x bigger dog!
            this.dog.scale.set(CONFIG.DOG_SCALE, CONFIG.DOG_SCALE, CONFIG.DOG_SCALE);
            this.dog.position.set(CONFIG.LANES[1], 0, 0);
            this.dog.rotation.y = Math.PI; // Face forward
            
            this.applyTexture(this.dog, this.selectedSkin);
            this.scene.add(this.dog);
            
            if (gltf.animations.length > 0) {
                this.mixer = new THREE.AnimationMixer(this.dog);
                gltf.animations.forEach(clip => {
                    this.animations[clip.name] = this.mixer.clipAction(clip);
                });
                this.playAnimation('run');
            }
        });
    }
    
    playAnimation(name, crossfade = 0.2) {
        const animName = Object.keys(this.animations).find(n => 
            n.toLowerCase().includes(name.toLowerCase())
        );
        if (!animName || this.currentAnimName === animName) return;
        
        Object.values(this.animations).forEach(a => a.fadeOut(crossfade));
        this.animations[animName].reset().fadeIn(crossfade).play();
        this.currentAnimName = animName;
    }
    
    // ==================== INPUT ====================
    setupInput() {
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        
        const canvas = this.renderer.domElement;
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
        }, { passive: false });
        
        canvas.addEventListener('touchend', (e) => {
            if (!this.isPlaying || this.isGameOver) return;
            
            const dx = e.changedTouches[0].clientX - this.touchStartX;
            const dy = e.changedTouches[0].clientY - this.touchStartY;
            const minSwipe = 30;
            
            if (Math.abs(dx) > Math.abs(dy)) {
                if (dx > minSwipe) this.moveRight();
                else if (dx < -minSwipe) this.moveLeft();
            } else {
                if (dy < -minSwipe) this.jump();
                else if (dy > minSwipe) this.slide();
            }
        }, { passive: false });
    }
    
    onKeyDown(e) {
        if (!this.isPlaying || this.isGameOver) return;
        
        switch(e.key) {
            case 'ArrowLeft': case 'a': case 'A': this.moveLeft(); break;
            case 'ArrowRight': case 'd': case 'D': this.moveRight(); break;
            case 'ArrowUp': case 'w': case 'W': case ' ': this.jump(); break;
            case 'ArrowDown': case 's': case 'S': this.slide(); break;
        }
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
            this.sound.play('jump');
        }
    }
    
    slide() {
        if (!this.isSliding && !this.isJumping && this.dog) {
            this.isSliding = true;
            this.slideTimer = CONFIG.SLIDE_DURATION;
            // Squash the dog down (scale Y to 40%)
            this.dog.scale.set(CONFIG.DOG_SCALE, CONFIG.DOG_SCALE * 0.4, CONFIG.DOG_SCALE);
            this.playAnimation('lay');
            this.sound.play('slide');
        }
    }


    // ==================== OBSTACLES ====================
    spawnObstacle() {
        const lane = Math.floor(Math.random() * 3);
        const x = CONFIG.LANES[lane];
        
        // 4 types: normal, tall, low, platform (can run on top)
        const types = ['normal', 'normal', 'tall', 'low', 'platform'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        let geometry, material, yPos;
        
        switch(type) {
            case 'normal':
                geometry = new THREE.BoxGeometry(3, 4, 3);
                material = new THREE.MeshStandardMaterial({
                    color: 0xff4444,
                    emissive: 0xff0000,
                    emissiveIntensity: 0.3
                });
                yPos = 2;
                break;
                
            case 'tall':
                geometry = new THREE.BoxGeometry(2.5, 10, 2.5);
                material = new THREE.MeshStandardMaterial({
                    color: 0xff6600,
                    emissive: 0xff3300,
                    emissiveIntensity: 0.3
                });
                yPos = 5;
                break;
                
            case 'low':
                geometry = new THREE.BoxGeometry(4, 2.5, 4);
                material = new THREE.MeshStandardMaterial({
                    color: 0x00ff88,
                    emissive: 0x00aa44,
                    emissiveIntensity: 0.4
                });
                yPos = 4;
                break;
                
            case 'platform':
                // Long platform - can run on top!
                geometry = new THREE.BoxGeometry(3, 4, 15);
                material = new THREE.MeshStandardMaterial({
                    color: 0x8844ff,
                    emissive: 0x4422aa,
                    emissiveIntensity: 0.4
                });
                yPos = 2;
                break;
        }
        
        const obstacle = new THREE.Mesh(geometry, material);
        const spawnZ = this.lastObstacleZ - CONFIG.OBSTACLE_SPAWN_DISTANCE;
        obstacle.position.set(x, yPos, spawnZ);
        obstacle.castShadow = true;
        obstacle.receiveShadow = true;
        obstacle.userData = { type: 'obstacle', obstacleType: type, baseX: x, baseY: yPos };
        
        this.scene.add(obstacle);
        this.obstacles.push(obstacle);
        this.lastObstacleZ = spawnZ;
    }
    
    // ==================== COINS (BONES) ====================
    spawnCoinRow() {
        const lane = Math.floor(Math.random() * 3);
        const x = CONFIG.LANES[lane];
        const count = 4 + Math.floor(Math.random() * 5); // More bones!
        
        // Sometimes spawn on top level (above obstacles)
        const onTop = Math.random() > 0.7;
        const baseY = onTop ? CONFIG.TOP_LEVEL + 2 : 2;
        
        for (let i = 0; i < count; i++) {
            let coin;
            const zPos = this.lastCoinZ - CONFIG.COIN_SPAWN_DISTANCE - i * 3;
            const yPos = baseY + Math.sin(i * 0.5) * 0.5; // Wavy pattern
            
            if (this.boneModel) {
                // Use 3D bone model - smaller and glowing
                coin = this.boneModel.clone();
                coin.scale.set(1.2, 1.2, 1.2); // Smaller
                coin.position.set(x, yPos, zPos);
                // Different rotation - diagonal spin
                coin.rotation.set(Math.PI / 4, 0, 0);
                
                // Add glow effect
                coin.traverse(child => {
                    if (child.isMesh) {
                        child.material = new THREE.MeshStandardMaterial({
                            color: 0xffd700,
                            emissive: 0xffaa00,
                            emissiveIntensity: 0.8,
                            metalness: 0.9,
                            roughness: 0.2
                        });
                    }
                });
            } else {
                // Fallback - glowing torus
                const coinGeo = new THREE.TorusGeometry(0.5, 0.15, 12, 24);
                const coinMat = new THREE.MeshStandardMaterial({
                    color: 0xffd700,
                    emissive: 0xffaa00,
                    emissiveIntensity: 0.9,
                    metalness: 0.9,
                    roughness: 0.1
                });
                coin = new THREE.Mesh(coinGeo, coinMat);
                coin.position.set(x, yPos, zPos);
            }
            
            coin.userData = { type: 'coin', baseX: x, baseY: yPos };
            this.scene.add(coin);
            this.coinObjects.push(coin);
        }
        
        this.lastCoinZ = this.lastCoinZ - CONFIG.COIN_SPAWN_DISTANCE - count * 3;
    }
    
    // Spawn particle effect when collecting bone
    spawnCollectParticles(position) {
        const particleCount = 8;
        for (let i = 0; i < particleCount; i++) {
            const geo = new THREE.SphereGeometry(0.15, 6, 6);
            const mat = new THREE.MeshBasicMaterial({
                color: 0xffd700,
                transparent: true,
                opacity: 1
            });
            const particle = new THREE.Mesh(geo, mat);
            particle.position.copy(position);
            
            // Random velocity
            particle.userData = {
                vx: (Math.random() - 0.5) * 8,
                vy: Math.random() * 6 + 2,
                vz: (Math.random() - 0.5) * 8,
                life: 1.0
            };
            
            this.scene.add(particle);
            this.particles.push(particle);
        }
    }
    
    // Update particles
    updateParticles(delta) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            const d = p.userData;
            
            // Move
            p.position.x += d.vx * delta;
            p.position.y += d.vy * delta;
            p.position.z += d.vz * delta;
            
            // Gravity
            d.vy -= 15 * delta;
            
            // Fade
            d.life -= delta * 2;
            p.material.opacity = d.life;
            
            // Remove dead particles
            if (d.life <= 0) {
                this.scene.remove(p);
                this.particles.splice(i, 1);
            }
        }
    }


    // ==================== COLLISION ====================
    checkCollisions() {
        if (!this.dog) return;
        
        const playerX = this.dog.position.x;
        const playerY = this.dog.position.y;
        const playerZ = this.dog.position.z;
        
        // Adjusted hitbox for bigger dog
        const playerHeight = this.isSliding ? 2 : 5;
        
        // Check obstacles
        for (const obstacle of this.obstacles) {
            const ox = obstacle.position.x;
            const oy = obstacle.position.y;
            const oz = obstacle.position.z;
            const oType = obstacle.userData.obstacleType;
            const oHeight = oType === 'tall' ? 10 : 4;
            const oLength = oType === 'platform' ? 15 : 3;
            
            // Distance check
            if (Math.abs(oz - playerZ) > oLength / 2 + 2) continue;
            if (Math.abs(ox - playerX) > 3) continue;
            
            // In same lane
            if (Math.abs(ox - playerX) < 2.5) {
                // Z overlap
                const zOverlap = oz > playerZ - oLength / 2 - 1 && oz < playerZ + oLength / 2 + 1;
                
                if (zOverlap) {
                    // Platform - can run on top!
                    if (oType === 'platform' || oType === 'normal') {
                        const topY = oy + oHeight / 2;
                        // If player is above, land on top
                        if (playerY >= topY - 0.5 && this.velocityY <= 0) {
                            this.dog.position.y = topY;
                            this.velocityY = 0;
                            this.isJumping = false;
                            if (!this.isSliding) this.playAnimation('run');
                            continue;
                        }
                        // If player hits side, game over
                        if (playerY < topY - 1) {
                            this.gameOver();
                            return;
                        }
                        continue;
                    }
                    
                    // Low obstacle - can slide under
                    if (oType === 'low') {
                        if (!this.isSliding) {
                            this.gameOver();
                            return;
                        }
                        continue;
                    }
                    
                    // Tall obstacle - must dodge
                    if (oType === 'tall') {
                        this.gameOver();
                        return;
                    }
                }
            }
        }
        
        // Check coins
        for (let i = this.coinObjects.length - 1; i >= 0; i--) {
            const coin = this.coinObjects[i];
            const cx = coin.position.x;
            const cy = coin.position.y;
            const cz = coin.position.z;
            
            const distX = Math.abs(cx - playerX);
            const distY = Math.abs(cy - playerY - 2); // Center of dog
            const distZ = Math.abs(cz - playerZ);
            
            if (distX < 2 && distZ < 2 && distY < 3) {
                // Spawn particles at coin position
                this.spawnCollectParticles(coin.position.clone());
                
                this.scene.remove(coin);
                this.coinObjects.splice(i, 1);
                this.coins++;
                this.score += CONFIG.COIN_VALUE;
                this.sound.play('coin');
            }
        }
    }
    
    // ==================== GAME OVER ====================
    gameOver() {
        this.isPlaying = false;
        this.isGameOver = true;
        this.sound.stopAllMusic();
        
        // Play crash with slight delay so it's audible
        setTimeout(() => this.sound.play('crash'), 50);
        
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('badrik_best', this.bestScore.toString());
        }
        
        document.getElementById('gameOver').style.display = 'flex';
        document.getElementById('finalScore').textContent = this.score.toLocaleString();
        document.getElementById('finalCoins').textContent = this.coins.toLocaleString();
        document.getElementById('finalDistance').textContent = Math.floor(this.distance) + 'm';
        document.getElementById('bestScore').textContent = this.bestScore.toLocaleString();
        
        if (this.wallet.connected) {
            GameAPI.submitScore(this.wallet.address, this.score, this.coins, Math.floor(this.distance));
        }
    }


    // ==================== UPDATE ====================
    update(delta) {
        if (!this.isPlaying || this.isGameOver || !this.dog) return;
        
        // Speed
        this.speed = Math.min(this.speed + CONFIG.SPEED_INCREASE * delta, CONFIG.MAX_SPEED);
        this.distance += this.speed * delta;
        
        // Check biome change
        this.updateBiome();
        
        // Lane switching
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
            
            if (this.dog.position.y <= 0) {
                this.dog.position.y = 0;
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
                this.dog.scale.set(CONFIG.DOG_SCALE, CONFIG.DOG_SCALE, CONFIG.DOG_SCALE);
                this.playAnimation('run');
            }
        }
        
        // Move obstacles with curved world (LEFT/RIGHT + down)
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            obstacle.position.z += this.speed * delta;
            
            // Apply curved world effect - DOWN only (sync with road)
            const z = -obstacle.position.z;
            if (z > 0) {
                // Curve DOWN to match road curvature
                const curveY = z * z * CONFIG.CURVE_STRENGTH;
                obstacle.position.y = obstacle.userData.baseY - curveY;
            }
            
            if (obstacle.position.z > 20) {
                this.scene.remove(obstacle);
                this.obstacles.splice(i, 1);
            }
        }
        
        // Move coins with curved world + spin animation
        for (let i = this.coinObjects.length - 1; i >= 0; i--) {
            const coin = this.coinObjects[i];
            coin.position.z += this.speed * delta;
            
            // Spin on Y axis (like a coin spinning)
            coin.rotation.y += delta * 5;
            // Slight wobble
            coin.rotation.x = Math.PI / 4 + Math.sin(Date.now() * 0.005 + i) * 0.1;
            
            // Apply curved world effect - DOWN only
            const z = -coin.position.z;
            if (z > 0) {
                const curveY = z * z * CONFIG.CURVE_STRENGTH;
                coin.position.y = coin.userData.baseY - curveY;
            }
            
            if (coin.position.z > 20) {
                this.scene.remove(coin);
                this.coinObjects.splice(i, 1);
            }
        }
        
        // Update particles
        this.updateParticles(delta);
        
        // Move decorations with curved world
        for (let i = this.decorations.length - 1; i >= 0; i--) {
            const deco = this.decorations[i];
            deco.position.z += this.speed * delta;
            
            // Apply curved world effect - DOWN only
            const z = -deco.position.z;
            if (z > 0) {
                const curveY = z * z * CONFIG.CURVE_STRENGTH;
                deco.position.y = deco.userData.baseY - curveY;
            }
            
            if (deco.position.z > 30) {
                this.scene.remove(deco);
                this.decorations.splice(i, 1);
            }
        }
        
        // Spawn new decorations
        const lastDecoZ = this.decorations.length > 0 ?
            Math.min(...this.decorations.map(d => d.position.z)) : 0;
        if (lastDecoZ > CONFIG.DECORATION_SPAWN_Z + 50) {
            this.spawnDecoration(-10 - Math.random() * 4, lastDecoZ - 25 - Math.random() * 15);
            this.spawnDecoration(10 + Math.random() * 4, lastDecoZ - 30 - Math.random() * 15);
        }
        
        // Spawn new obstacles
        const lastObsZ = this.obstacles.length > 0 ? 
            Math.min(...this.obstacles.map(o => o.position.z)) : 0;
        if (lastObsZ > -CONFIG.OBSTACLE_SPAWN_DISTANCE + 30) {
            this.spawnObstacle();
        }
        
        // Spawn new coins
        const lastCoinZ = this.coinObjects.length > 0 ?
            Math.min(...this.coinObjects.map(c => c.position.z)) : 0;
        if (lastCoinZ > -CONFIG.COIN_SPAWN_DISTANCE + 20) {
            this.spawnCoinRow();
        }
        
        // Collisions
        this.checkCollisions();
        
        // Update score
        this.score = Math.floor(this.distance) + this.coins * CONFIG.COIN_VALUE;
        
        // Update HUD
        this.updateHUD();
        
        // Update mixer
        if (this.mixer) this.mixer.update(delta);
    }
    
    updateHUD() {
        document.getElementById('score').textContent = this.score.toLocaleString();
        document.getElementById('coins').textContent = this.coins;
        document.getElementById('distance').textContent = Math.floor(this.distance);
    }


    // ==================== ANIMATION LOOPS ====================
    animateMenu() {
        if (!this.isInMenu) return;
        requestAnimationFrame(() => this.animateMenu());
        
        const delta = this.clock.getDelta();
        const now = Date.now();
        
        if (this.menuMixer) {
            this.menuMixer.update(delta);
        }
        
        // State machine for menu animations
        if (this.menuAnimState === 'sit') {
            // Check if it's time to scratch
            if (now - this.lastScratchTime > CONFIG.SCRATCH_INTERVAL) {
                this.menuAnimState = 'scratch';
                this.scratchStartTime = now;
                this.playMenuAnimation('itch', false); // Play once
            }
        } else if (this.menuAnimState === 'scratch') {
            // Check if scratch animation is done
            if (now - this.scratchStartTime > CONFIG.SCRATCH_DURATION) {
                this.menuAnimState = 'sit';
                this.lastScratchTime = now;
                this.playMenuAnimation('sit', true); // Loop sit
            }
        }
        
        // Gentle rotation
        if (this.menuDog) {
            this.menuDog.rotation.y = Math.sin(now * 0.0008) * 0.15;
        }
        
        this.menuRenderer.render(this.menuScene, this.menuCamera);
    }
    
    animate() {
        if (this.isInMenu) return;
        requestAnimationFrame(() => this.animate());
        
        const delta = Math.min(this.clock.getDelta(), 0.1);
        this.update(delta);
        
        // Camera follow - adjusted for bigger dog
        if (this.dog && this.camera) {
            this.camera.position.x = this.dog.position.x * 0.5;
            this.camera.position.y = 10 + this.dog.position.y * 0.5;
            this.camera.lookAt(this.dog.position.x * 0.3, 2, -20);
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        if (this.isInMenu && this.menuCamera && this.menuRenderer) {
            this.menuCamera.aspect = width / height;
            this.menuCamera.updateProjectionMatrix();
            this.menuRenderer.setSize(width, height);
        }
        
        if (this.camera && this.renderer) {
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        }
    }
}

// ==================== START ====================
window.addEventListener('DOMContentLoaded', () => new BadrikRunner());
