/**
 * BADRIK RUN - Subway Surfer Style Runner v1.3
 * Fixed: menu animation loop, dog size, better sounds
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==================== GAME CONFIG ====================
const CONFIG = {
    LANE_WIDTH: 2.5,
    LANES: [-2.5, 0, 2.5],
    
    INITIAL_SPEED: 22,  // Faster start!
    MAX_SPEED: 45,      // Higher max speed
    SPEED_INCREASE: 0.3,
    
    JUMP_FORCE: 14,
    GRAVITY: -40,
    LANE_SWITCH_SPEED: 18,
    
    OBSTACLE_SPAWN_DISTANCE: 50,
    MIN_OBSTACLE_GAP: 25,
    
    COIN_SPAWN_DISTANCE: 30,
    COIN_VALUE: 10,
    
    GROUND_LENGTH: 200,
    GROUND_SEGMENTS: 4,
    
    SLIDE_DURATION: 600,
    
    // Dog size in game (5x bigger)
    DOG_SCALE: 5,
    
    // Menu animation timing
    SCRATCH_INTERVAL: 4000, // 4 seconds between scratches
    SCRATCH_DURATION: 2000, // scratch animation lasts 2 sec
};

// ==================== SOUND MANAGER ====================
class SoundManager {
    constructor() {
        this.sounds = {};
        this.music = null;
        this.enabled = true;
        this.musicPlaying = false;
    }
    
    async load() {
        // New sound selections
        const soundFiles = {
            coin: 'Pick Up/Gentlehighpitched17.mp3',        // Bright coin pickup
            crash: 'Destruction/BrittleGlassIce1.mp3',      // Impact crash
            jump: 'Drop/BouncyRubberBall7.mp3',             // Bouncy jump
            slide: 'Drag/Grittyirregulargr5.mp3',           // Slide swoosh
            button: 'Inventory/Menufriendlysounds10.mp3',   // UI click
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
        
        // Load background music
        try {
            this.music = new Audio('NeonCityGroove_FULL_SONG_MusicGPT.mp3');
            this.music.loop = true;
            this.music.volume = 0.3;
        } catch (e) {
            console.warn('Failed to load music');
        }
    }
    
    play(name) {
        if (!this.enabled || !this.sounds[name]) return;
        try {
            const sound = this.sounds[name].cloneNode();
            sound.volume = name === 'coin' ? 0.4 : 0.5;
            sound.play().catch(() => {});
        } catch (e) {}
    }
    
    startMusic() {
        if (this.music && !this.musicPlaying) {
            this.music.play().catch(() => {});
            this.musicPlaying = true;
        }
    }
    
    stopMusic() {
        if (this.music) {
            this.music.pause();
            this.music.currentTime = 0;
            this.musicPlaying = false;
        }
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
        this.lastObstacleZ = -30;
        this.lastCoinZ = -20;
        
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
        
        this.initMenuScene();
        this.initUI();
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
                child.material = new THREE.MeshStandardMaterial({
                    map: texture,
                    roughness: 0.7,
                    metalness: 0.1
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
        this.lastObstacleZ = -30;
        this.lastCoinZ = -20;
        this.obstacles = [];
        this.coinObjects = [];
        
        this.initGameScene();
        this.createWorld();
        this.loadPlayer();
        this.setupInput();
        this.spawnInitialObjects();
        this.updateHUD();
        this.sound.startMusic(); // Start background music!
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
        this.obstacles = [];
        this.coinObjects = [];
        
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
        this.lastObstacleZ = -30;
        this.lastCoinZ = -20;
        
        document.getElementById('gameOver').style.display = 'none';
        this.playAnimation('run');
        this.spawnInitialObjects();
        this.updateHUD();
        this.sound.startMusic(); // Restart music on play again
    }
    
    backToMenu() {
        this.isPlaying = false;
        this.isInMenu = true;
        this.sound.stopMusic(); // Stop music when going to menu
        
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
        this.scene.background = new THREE.Color(0x1a0a2e);
        this.scene.fog = new THREE.Fog(0x1a0a2e, 50, 150);
        
        const canvas = document.getElementById('gameCanvas');
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
        // Camera higher and further back for bigger dog
        this.camera.position.set(0, 12, 25);
        this.camera.lookAt(0, 2, -10);
        
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
    }
    
    createWorld() {
        // Wider ground for bigger dog
        const groundGeo = new THREE.PlaneGeometry(40, CONFIG.GROUND_LENGTH);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3e, roughness: 0.8 });
        
        for (let i = 0; i < CONFIG.GROUND_SEGMENTS; i++) {
            const ground = new THREE.Mesh(groundGeo, groundMat);
            ground.rotation.x = -Math.PI / 2;
            ground.position.z = -i * CONFIG.GROUND_LENGTH + CONFIG.GROUND_LENGTH / 2;
            ground.receiveShadow = true;
            this.scene.add(ground);
            this.grounds.push(ground);
        }
        
        // Lane lines - wider apart
        const lineMat = new THREE.MeshBasicMaterial({ color: 0x444466 });
        [-CONFIG.LANE_WIDTH, CONFIG.LANE_WIDTH].forEach(x => {
            const lineGeo = new THREE.PlaneGeometry(0.2, CONFIG.GROUND_LENGTH * CONFIG.GROUND_SEGMENTS);
            const line = new THREE.Mesh(lineGeo, lineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(x, 0.02, -CONFIG.GROUND_LENGTH);
            this.scene.add(line);
        });
        
        // Side walls - further out
        const wallMat = new THREE.MeshStandardMaterial({ 
            color: 0x14F195, 
            emissive: 0x14F195, 
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.4
        });
        [-15, 15].forEach(x => {
            const wallGeo = new THREE.BoxGeometry(0.5, 8, CONFIG.GROUND_LENGTH * CONFIG.GROUND_SEGMENTS);
            const wall = new THREE.Mesh(wallGeo, wallMat);
            wall.position.set(x, 4, -CONFIG.GROUND_LENGTH);
            this.scene.add(wall);
        });
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
        
        // 3 types: normal, tall, low (for sliding)
        const types = ['normal', 'normal', 'tall', 'low'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        let geometry, material, yPos;
        
        // Obstacles scaled up for bigger dog
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
                // LOW obstacle - MUST slide under!
                geometry = new THREE.BoxGeometry(4, 2.5, 4);
                material = new THREE.MeshStandardMaterial({
                    color: 0x00ff88,
                    emissive: 0x00aa44,
                    emissiveIntensity: 0.4
                });
                yPos = 4; // Floating - player slides under
                break;
        }
        
        const obstacle = new THREE.Mesh(geometry, material);
        obstacle.position.set(x, yPos, this.lastObstacleZ - CONFIG.OBSTACLE_SPAWN_DISTANCE);
        obstacle.castShadow = true;
        obstacle.receiveShadow = true;
        obstacle.userData = { type: 'obstacle', obstacleType: type };
        
        this.scene.add(obstacle);
        this.obstacles.push(obstacle);
        this.lastObstacleZ = obstacle.position.z;
    }
    
    // ==================== COINS ====================
    spawnCoinRow() {
        const lane = Math.floor(Math.random() * 3);
        const x = CONFIG.LANES[lane];
        const count = 3 + Math.floor(Math.random() * 4);
        
        for (let i = 0; i < count; i++) {
            // Bigger coins for bigger dog
            const coinGeo = new THREE.TorusGeometry(0.8, 0.25, 12, 24);
            const coinMat = new THREE.MeshStandardMaterial({
                color: 0xffd700,
                emissive: 0xffaa00,
                emissiveIntensity: 0.6,
                metalness: 0.9,
                roughness: 0.1
            });
            
            const coin = new THREE.Mesh(coinGeo, coinMat);
            coin.position.set(x, 2.5, this.lastCoinZ - CONFIG.COIN_SPAWN_DISTANCE - i * 4);
            // Standing vertical, facing player
            coin.rotation.y = Math.PI / 2;
            coin.userData = { type: 'coin' };
            
            this.scene.add(coin);
            this.coinObjects.push(coin);
        }
        
        this.lastCoinZ = this.lastCoinZ - CONFIG.COIN_SPAWN_DISTANCE - count * 4;
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
            
            // Distance check
            if (Math.abs(oz - playerZ) > 4) continue;
            if (Math.abs(ox - playerX) > 3) continue;
            
            // In same lane
            if (Math.abs(ox - playerX) < 2.5) {
                // Z overlap
                if (oz > playerZ - 2 && oz < playerZ + 2) {
                    
                    // Low obstacle - can slide under
                    if (oType === 'low') {
                        if (!this.isSliding) {
                            this.gameOver();
                            return;
                        }
                        continue; // Safe if sliding
                    }
                    
                    // Tall obstacle - must dodge
                    if (oType === 'tall') {
                        this.gameOver();
                        return;
                    }
                    
                    // Normal obstacle - can jump over
                    if (playerY < 3) {
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
            const cz = coin.position.z;
            
            const distX = Math.abs(cx - playerX);
            const distZ = Math.abs(cz - playerZ);
            
            if (distX < 2 && distZ < 2) {
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
        this.sound.stopMusic(); // Stop music first
        
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
        
        // Move obstacles
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            obstacle.position.z += this.speed * delta;
            
            if (obstacle.position.z > 20) {
                this.scene.remove(obstacle);
                this.obstacles.splice(i, 1);
            }
        }
        
        // Move coins
        for (let i = this.coinObjects.length - 1; i >= 0; i--) {
            const coin = this.coinObjects[i];
            coin.position.z += this.speed * delta;
            coin.rotation.z += delta * 4;
            
            if (coin.position.z > 20) {
                this.scene.remove(coin);
                this.coinObjects.splice(i, 1);
            }
        }
        
        // Spawn new obstacles
        const lastObsZ = this.obstacles.length > 0 ? 
            Math.min(...this.obstacles.map(o => o.position.z)) : 0;
        if (lastObsZ > -CONFIG.OBSTACLE_SPAWN_DISTANCE + 20) {
            this.spawnObstacle();
        }
        
        // Spawn new coins
        const lastCoinZ = this.coinObjects.length > 0 ?
            Math.min(...this.coinObjects.map(c => c.position.z)) : 0;
        if (lastCoinZ > -CONFIG.COIN_SPAWN_DISTANCE + 10) {
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
