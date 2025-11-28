/**
 * BADRIK RUN - Subway Surfer Style Runner v1.1
 * With sounds, proper animations, slide mechanic
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==================== GAME CONFIG ====================
const CONFIG = {
    LANE_WIDTH: 2.5,
    LANES: [-2.5, 0, 2.5],
    
    INITIAL_SPEED: 15,
    MAX_SPEED: 35,
    SPEED_INCREASE: 0.3,
    
    JUMP_FORCE: 12,
    GRAVITY: -35,
    LANE_SWITCH_SPEED: 15,
    
    OBSTACLE_SPAWN_DISTANCE: 60,
    MIN_OBSTACLE_GAP: 20,
    
    COIN_SPAWN_DISTANCE: 40,
    COIN_VALUE: 10,
    
    DISTANCE_MULTIPLIER: 1,
    
    GROUND_LENGTH: 200,
    GROUND_SEGMENTS: 4,
    
    SLIDE_DURATION: 600,
};

// ==================== SOUND MANAGER ====================
class SoundManager {
    constructor() {
        this.sounds = {};
        this.enabled = true;
        this.loaded = false;
    }
    
    async load() {
        const soundFiles = {
            coin: 'Pick Up/Etherealchimewith13.mp3',
            crash: 'Destruction/Destructionsoundsw5.mp3',
            jump: 'Drop/BouncyRubberBall6.mp3',
            slide: 'Drag/Acontinuoussoundr1.mp3',
            button: 'Inventory/ItemMoveSelectSoft5.mp3',
        };
        
        for (const [name, path] of Object.entries(soundFiles)) {
            try {
                const audio = new Audio(path);
                audio.volume = name === 'coin' ? 0.3 : 0.5;
                this.sounds[name] = audio;
            } catch (e) {
                console.warn(`Failed to load sound: ${path}`);
            }
        }
        this.loaded = true;
    }
    
    play(name) {
        if (!this.enabled || !this.sounds[name]) return;
        const sound = this.sounds[name].cloneNode();
        sound.play().catch(() => {});
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
    
    async signMessage(message) {
        if (!this.connected) return null;
        try {
            const encodedMessage = new TextEncoder().encode(message);
            const signature = await this.provider.signMessage(encodedMessage, 'utf8');
            return signature;
        } catch (error) {
            console.error('Sign failed:', error);
            return null;
        }
    }
}

// ==================== BACKEND API ====================
const API_URL = 'https://badrik-api.onrender.com'; // Will be deployed

class GameAPI {
    static async submitScore(wallet, score, coins, distance, signature) {
        try {
            const response = await fetch(`${API_URL}/api/score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet, score, coins, distance, signature })
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
            console.error('Failed to fetch leaderboard:', error);
            return [];
        }
    }
    
    static async getPlayerRank(wallet) {
        try {
            const response = await fetch(`${API_URL}/api/rank/${wallet}`);
            return await response.json();
        } catch (error) {
            return { rank: null, bestScore: 0 };
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
        this.normalScale = new THREE.Vector3(1, 1, 1);
        this.slideScale = new THREE.Vector3(1, 0.5, 1);
        
        // World
        this.speed = CONFIG.INITIAL_SPEED;
        this.grounds = [];
        this.obstacles = [];
        this.coinObjects = [];
        this.lastObstacleZ = 0;
        this.lastCoinZ = 0;
        
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
        
        // Referral
        this.referralCode = new URLSearchParams(window.location.search).get('ref');
        
        this.init();
    }
    
    async init() {
        // Load sounds
        await this.sound.load();
        
        // Preload textures
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


    // ==================== MENU ====================
    initMenuScene() {
        this.menuScene = new THREE.Scene();
        this.menuScene.background = new THREE.Color(0x0a0a1a);
        
        this.menuCamera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
        this.menuCamera.position.set(0, 0.3, 1.2);
        this.menuCamera.lookAt(0, 0.15, 0);
        
        const canvas = document.getElementById('menuCanvas');
        this.menuRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.menuRenderer.setSize(window.innerWidth, window.innerHeight);
        this.menuRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // Lighting
        const keyLight = new THREE.DirectionalLight(0xffc864, 1.5);
        keyLight.position.set(2, 3, 3);
        this.menuScene.add(keyLight);
        
        this.menuScene.add(new THREE.DirectionalLight(0x9945FF, 0.5)).position.set(-2, 1, 2);
        this.menuScene.add(new THREE.DirectionalLight(0x14F195, 0.5)).position.set(0, 2, -2);
        this.menuScene.add(new THREE.AmbientLight(0xffffff, 0.3));
        
        this.loadMenuDog();
        window.addEventListener('resize', () => this.onResize());
    }
    
    loadMenuDog() {
        this.loader.load('bulldog.glb', (gltf) => {
            this.menuDog = gltf.scene;
            this.menuDog.scale.set(1, 1, 1);
            this.applyTexture(this.menuDog, 'white');
            this.menuScene.add(this.menuDog);
            
            if (gltf.animations.length > 0) {
                this.menuMixer = new THREE.AnimationMixer(this.menuDog);
                const idleClip = gltf.animations.find(c => c.name.includes('idle'));
                if (idleClip) this.menuMixer.clipAction(idleClip).play();
            }
        });
    }
    
    applyTexture(model, skinName) {
        const texture = this.textures[skinName];
        if (!texture) return;
        
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.material = new THREE.MeshStandardMaterial({
                    map: texture, roughness: 0.7, metalness: 0.1
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
                this.updateReferralLink();
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
        
        // Game over
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
            this.sound.play('button');
            this.showLeaderboard();
        });
        document.getElementById('showReferral').addEventListener('click', (e) => {
            e.preventDefault();
            this.sound.play('button');
            this.showReferralModal();
        });
        
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                this.sound.play('button');
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
    
    updateReferralLink() {
        if (this.wallet.address) {
            const link = `${window.location.origin}${window.location.pathname}?ref=${this.wallet.address.slice(0, 8)}`;
            document.getElementById('referralLink').value = link;
        }
    }


    async showLeaderboard() {
        document.getElementById('leaderboardModal').style.display = 'flex';
        document.getElementById('leaderboardList').innerHTML = '<div class="loading">Loading...</div>';
        
        const data = await GameAPI.getLeaderboard(10);
        
        if (data.length === 0) {
            document.getElementById('leaderboardList').innerHTML = '<div class="loading">No scores yet. Be the first!</div>';
            return;
        }
        
        let html = '';
        data.forEach((entry, i) => {
            const isTop3 = i < 3 ? 'top-3' : '';
            const shortAddr = entry.wallet.slice(0, 4) + '...' + entry.wallet.slice(-4);
            html += `
                <div class="leaderboard-item ${isTop3}">
                    <span class="leaderboard-rank">${i + 1}</span>
                    <span class="leaderboard-address">${shortAddr}</span>
                    <span class="leaderboard-score">${entry.score.toLocaleString()}</span>
                </div>
            `;
        });
        document.getElementById('leaderboardList').innerHTML = html;
        
        // Your rank
        if (this.wallet.connected) {
            const rankData = await GameAPI.getPlayerRank(this.wallet.address);
            document.getElementById('yourRank').textContent = rankData.rank ? `#${rankData.rank}` : '#—';
            document.getElementById('yourBestScore').textContent = rankData.bestScore?.toLocaleString() || '0';
        }
    }
    
    showReferralModal() {
        document.getElementById('referralModal').style.display = 'flex';
        this.updateReferralLink();
    }
    
    shareOnTwitter() {
        const text = `🐕 I scored ${this.score.toLocaleString()} points in BADRIK RUN!\n\nPlay & earn $BADRIK tokens:\n${window.location.href}\n\n#BADRIK #Solana #Web3Gaming`;
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
        
        // Reset
        this.score = 0;
        this.coins = 0;
        this.distance = 0;
        this.speed = CONFIG.INITIAL_SPEED;
        this.currentLane = 1;
        this.targetX = CONFIG.LANES[1];
        this.velocityY = 0;
        this.isJumping = false;
        this.isSliding = false;
        this.lastObstacleZ = -50;
        this.lastCoinZ = -30;
        
        this.initGameScene();
        this.createWorld();
        this.loadPlayer();
        this.setupInput();
        this.updateHUD();
        this.animate();
    }
    
    restartGame() {
        this.obstacles.forEach(o => this.scene.remove(o));
        this.coinObjects.forEach(c => this.scene.remove(c));
        this.obstacles = [];
        this.coinObjects = [];
        
        if (this.dog) {
            this.dog.position.set(0, 0, 0);
            this.dog.scale.copy(this.normalScale);
            this.currentLane = 1;
            this.targetX = CONFIG.LANES[1];
        }
        
        this.score = 0;
        this.coins = 0;
        this.distance = 0;
        this.speed = CONFIG.INITIAL_SPEED;
        this.velocityY = 0;
        this.isJumping = false;
        this.isSliding = false;
        this.isGameOver = false;
        this.isPlaying = true;
        this.lastObstacleZ = -50;
        this.lastCoinZ = -30;
        
        document.getElementById('gameOver').style.display = 'none';
        this.playAnimation('run');
        this.updateHUD();
    }
    
    backToMenu() {
        this.isPlaying = false;
        this.isInMenu = true;
        
        document.getElementById('gameContainer').style.display = 'none';
        document.getElementById('gameOver').style.display = 'none';
        document.getElementById('menu').style.display = 'block';
        
        this.animateMenu();
    }


    // ==================== GAME SCENE ====================
    initGameScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a0a2e);
        this.scene.fog = new THREE.Fog(0x1a0a2e, 40, 120);
        
        const canvas = document.getElementById('gameCanvas');
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
        this.camera.position.set(0, 4, 8);
        this.camera.lookAt(0, 0.5, -10);
        
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        
        // Lighting
        const sun = new THREE.DirectionalLight(0xffc864, 1);
        sun.position.set(10, 20, 10);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        this.scene.add(sun);
        
        this.scene.add(new THREE.AmbientLight(0x9945FF, 0.3));
        this.scene.add(new THREE.HemisphereLight(0x14F195, 0x1a0a2e, 0.4));
    }
    
    createWorld() {
        // Ground
        const groundGeo = new THREE.PlaneGeometry(15, CONFIG.GROUND_LENGTH);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9 });
        
        for (let i = 0; i < CONFIG.GROUND_SEGMENTS; i++) {
            const ground = new THREE.Mesh(groundGeo, groundMat);
            ground.rotation.x = -Math.PI / 2;
            ground.position.z = -i * CONFIG.GROUND_LENGTH + CONFIG.GROUND_LENGTH / 2;
            ground.receiveShadow = true;
            this.scene.add(ground);
            this.grounds.push(ground);
        }
        
        // Lane lines
        const lineGeo = new THREE.PlaneGeometry(0.1, CONFIG.GROUND_LENGTH * CONFIG.GROUND_SEGMENTS);
        const lineMat = new THREE.MeshBasicMaterial({ color: 0x333355 });
        [-CONFIG.LANE_WIDTH, CONFIG.LANE_WIDTH].forEach(x => {
            const line = new THREE.Mesh(lineGeo, lineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(x, 0.01, -CONFIG.GROUND_LENGTH);
            this.scene.add(line);
        });
        
        // Side walls
        const wallGeo = new THREE.BoxGeometry(1, 3, CONFIG.GROUND_LENGTH * CONFIG.GROUND_SEGMENTS);
        const wallMat = new THREE.MeshStandardMaterial({ 
            color: 0x14F195, emissive: 0x14F195, emissiveIntensity: 0.2, transparent: true, opacity: 0.3
        });
        [-8, 8].forEach(x => {
            const wall = new THREE.Mesh(wallGeo, wallMat);
            wall.position.set(x, 1.5, -CONFIG.GROUND_LENGTH);
            this.scene.add(wall);
        });
    }


    // ==================== PLAYER ====================
    loadPlayer() {
        this.loader.load('bulldog.glb', (gltf) => {
            this.dog = gltf.scene;
            this.dog.scale.set(1, 1, 1);
            this.dog.position.set(CONFIG.LANES[1], 0, 0);
            this.dog.rotation.y = Math.PI;
            
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
        
        const action = this.animations[animName];
        action.reset().fadeIn(crossfade).play();
        this.currentAnimName = animName;
    }
    
    // ==================== INPUT ====================
    setupInput() {
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        
        const canvas = this.renderer.domElement;
        canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
        canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
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
    
    onTouchStart(e) {
        e.preventDefault();
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
    }
    
    onTouchEnd(e) {
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
        if (!this.isSliding && !this.isJumping) {
            this.isSliding = true;
            this.slideTimer = CONFIG.SLIDE_DURATION;
            this.dog.scale.copy(this.slideScale);
            this.playAnimation('layingdown');
            this.sound.play('slide');
        }
    }


    // ==================== OBSTACLES & COINS ====================
    spawnObstacle() {
        const lane = Math.floor(Math.random() * 3);
        const x = CONFIG.LANES[lane];
        
        const types = ['box', 'tall', 'low'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        let geometry, height;
        switch(type) {
            case 'box': geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5); height = 0.75; break;
            case 'tall': geometry = new THREE.BoxGeometry(1, 3, 1); height = 1.5; break;
            case 'low': geometry = new THREE.BoxGeometry(2, 0.8, 2); height = 0.4; break;
        }
        
        const material = new THREE.MeshStandardMaterial({
            color: 0xff4444, emissive: 0xff0000, emissiveIntensity: 0.2
        });
        
        const obstacle = new THREE.Mesh(geometry, material);
        obstacle.position.set(x, height, this.lastObstacleZ - CONFIG.OBSTACLE_SPAWN_DISTANCE);
        obstacle.castShadow = true;
        obstacle.userData = { type: 'obstacle', obstacleType: type };
        
        this.scene.add(obstacle);
        this.obstacles.push(obstacle);
        this.lastObstacleZ = obstacle.position.z;
    }
    
    spawnCoinRow() {
        const lane = Math.floor(Math.random() * 3);
        const x = CONFIG.LANES[lane];
        const count = 3 + Math.floor(Math.random() * 5);
        
        for (let i = 0; i < count; i++) {
            const coinGeo = new THREE.TorusGeometry(0.3, 0.1, 8, 16);
            const coinMat = new THREE.MeshStandardMaterial({
                color: 0xffc864, emissive: 0xffa500, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.2
            });
            
            const coin = new THREE.Mesh(coinGeo, coinMat);
            coin.position.set(x, 1, this.lastCoinZ - CONFIG.COIN_SPAWN_DISTANCE - i * 3);
            coin.rotation.x = Math.PI / 2;
            coin.userData = { type: 'coin' };
            
            this.scene.add(coin);
            this.coinObjects.push(coin);
        }
        
        this.lastCoinZ -= CONFIG.COIN_SPAWN_DISTANCE + count * 3;
    }


    // ==================== COLLISION ====================
    checkCollisions() {
        if (!this.dog) return;
        
        const playerBox = new THREE.Box3().setFromObject(this.dog);
        playerBox.expandByScalar(-0.3);
        
        // Obstacles
        for (const obstacle of this.obstacles) {
            const obstacleBox = new THREE.Box3().setFromObject(obstacle);
            
            // Skip low obstacles if sliding
            if (this.isSliding && obstacle.userData.obstacleType === 'low') continue;
            // Skip tall obstacles if jumping high enough
            if (this.isJumping && this.dog.position.y > 1.5 && obstacle.userData.obstacleType === 'tall') continue;
            
            if (playerBox.intersectsBox(obstacleBox)) {
                this.gameOver();
                return;
            }
        }
        
        // Coins
        for (let i = this.coinObjects.length - 1; i >= 0; i--) {
            const coin = this.coinObjects[i];
            const coinBox = new THREE.Box3().setFromObject(coin);
            
            if (playerBox.intersectsBox(coinBox)) {
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
        this.sound.play('crash');
        
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('badrik_best', this.bestScore.toString());
        }
        
        document.getElementById('gameOver').style.display = 'flex';
        document.getElementById('finalScore').textContent = this.score.toLocaleString();
        document.getElementById('finalCoins').textContent = this.coins.toLocaleString();
        document.getElementById('finalDistance').textContent = Math.floor(this.distance) + 'm';
        document.getElementById('bestScore').textContent = this.bestScore.toLocaleString();
        
        this.submitScore();
    }
    
    async submitScore() {
        if (!this.wallet.connected) return;
        
        const message = `BADRIK RUN Score: ${this.score} | ${Date.now()}`;
        const signature = await this.wallet.signMessage(message);
        
        if (signature) {
            await GameAPI.submitScore(
                this.wallet.address,
                this.score,
                this.coins,
                Math.floor(this.distance),
                Array.from(signature.signature)
            );
        }
    }


    // ==================== UPDATE ====================
    update(delta) {
        if (!this.isPlaying || this.isGameOver || !this.dog) return;
        
        // Speed
        this.speed = Math.min(this.speed + CONFIG.SPEED_INCREASE * delta, CONFIG.MAX_SPEED);
        this.distance += this.speed * delta;
        this.score = Math.floor(this.distance * CONFIG.DISTANCE_MULTIPLIER) + this.coins * CONFIG.COIN_VALUE;
        
        // Lane switch
        const dx = this.targetX - this.dog.position.x;
        if (Math.abs(dx) > 0.05) {
            this.dog.position.x += Math.sign(dx) * CONFIG.LANE_SWITCH_SPEED * delta;
        } else {
            this.dog.position.x = this.targetX;
        }
        
        // Jump
        if (this.isJumping) {
            this.velocityY += CONFIG.GRAVITY * delta;
            this.dog.position.y += this.velocityY * delta;
            
            if (this.dog.position.y <= 0) {
                this.dog.position.y = 0;
                this.isJumping = false;
                this.velocityY = 0;
                this.playAnimation('run');
            }
        }
        
        // Slide timer
        if (this.isSliding) {
            this.slideTimer -= delta * 1000;
            if (this.slideTimer <= 0) {
                this.isSliding = false;
                this.dog.scale.copy(this.normalScale);
                this.playAnimation('run');
            }
        }
        
        // Move obstacles
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            obstacle.position.z += this.speed * delta;
            if (obstacle.position.z > 10) {
                this.scene.remove(obstacle);
                this.obstacles.splice(i, 1);
            }
        }
        
        // Move coins
        for (let i = this.coinObjects.length - 1; i >= 0; i--) {
            const coin = this.coinObjects[i];
            coin.position.z += this.speed * delta;
            coin.rotation.z += delta * 3;
            if (coin.position.z > 10) {
                this.scene.remove(coin);
                this.coinObjects.splice(i, 1);
            }
        }
        
        // Spawn
        if (this.obstacles.length === 0 || Math.random() < 0.015) {
            const lastZ = this.obstacles.length > 0 ? this.obstacles[this.obstacles.length - 1].position.z : 0;
            if (lastZ > -CONFIG.OBSTACLE_SPAWN_DISTANCE + CONFIG.MIN_OBSTACLE_GAP) {
                this.spawnObstacle();
            }
        }
        
        if (this.coinObjects.length < 15 && Math.random() < 0.01) {
            this.spawnCoinRow();
        }
        
        this.checkCollisions();
        this.updateHUD();
        
        if (this.mixer) this.mixer.update(delta);
    }
    
    updateHUD() {
        document.getElementById('score').textContent = this.score.toLocaleString();
        document.getElementById('coins').textContent = this.coins.toLocaleString();
        document.getElementById('distance').textContent = Math.floor(this.distance);
    }


    // ==================== ANIMATION LOOPS ====================
    animateMenu() {
        if (!this.isInMenu) return;
        requestAnimationFrame(() => this.animateMenu());
        
        const delta = this.clock.getDelta();
        if (this.menuMixer) this.menuMixer.update(delta);
        if (this.menuDog) this.menuDog.rotation.y = Math.sin(Date.now() * 0.001) * 0.2;
        
        this.menuRenderer.render(this.menuScene, this.menuCamera);
    }
    
    animate() {
        if (this.isInMenu) return;
        requestAnimationFrame(() => this.animate());
        
        const delta = Math.min(this.clock.getDelta(), 0.1);
        this.update(delta);
        
        if (this.dog && this.camera) {
            this.camera.position.x = this.dog.position.x * 0.3;
            this.camera.lookAt(this.dog.position.x * 0.5, 1, -20);
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
