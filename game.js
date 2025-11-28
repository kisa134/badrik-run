/**
 * BADRIK RUN - Subway Surfer Style Runner
 * Collect bones, avoid obstacles, earn $BADRIK tokens!
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==================== GAME CONFIG ====================
const CONFIG = {
    // Lanes
    LANE_WIDTH: 2.5,
    LANES: [-2.5, 0, 2.5], // Left, Center, Right
    
    // Speed
    INITIAL_SPEED: 15,
    MAX_SPEED: 35,
    SPEED_INCREASE: 0.5, // per second
    
    // Player
    JUMP_FORCE: 12,
    GRAVITY: -35,
    LANE_SWITCH_SPEED: 12,
    
    // Obstacles
    OBSTACLE_SPAWN_DISTANCE: 80,
    MIN_OBSTACLE_GAP: 15,
    
    // Coins (bones)
    COIN_SPAWN_DISTANCE: 60,
    COIN_VALUE: 10,
    
    // Scoring
    DISTANCE_MULTIPLIER: 1,
    
    // World
    GROUND_LENGTH: 200,
    GROUND_SEGMENTS: 4,
};


// ==================== WALLET MANAGER ====================
class WalletManager {
    constructor() {
        this.connected = false;
        this.address = null;
        this.provider = null;
    }
    
    async connect() {
        try {
            // Check if Phantom is installed
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


// ==================== MAIN GAME CLASS ====================
class BadrikRunner {
    constructor() {
        // Managers
        this.wallet = new WalletManager();
        this.textureLoader = new THREE.TextureLoader();
        this.loader = new GLTFLoader();
        
        // Game state
        this.isPlaying = false;
        this.isPaused = false;
        this.isGameOver = false;
        this.selectedSkin = 'white';
        
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
        
        // Menu scene
        this.menuScene = null;
        this.menuCamera = null;
        this.menuRenderer = null;
        this.menuDog = null;
        this.menuMixer = null;
        this.isInMenu = true;
        
        // Player
        this.dog = null;
        this.mixer = null;
        this.animations = {};
        this.currentLane = 1; // 0=left, 1=center, 2=right
        this.targetX = 0;
        this.velocityY = 0;
        this.isJumping = false;
        this.isSliding = false;
        
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
        this.referralCode = this.getReferralFromURL();
        
        this.init();
    }


    getReferralFromURL() {
        const params = new URLSearchParams(window.location.search);
        return params.get('ref');
    }
    
    init() {
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
        
        const fillLight = new THREE.DirectionalLight(0x9945FF, 0.5);
        fillLight.position.set(-2, 1, 2);
        this.menuScene.add(fillLight);
        
        const rimLight = new THREE.DirectionalLight(0x14F195, 0.5);
        rimLight.position.set(0, 2, -2);
        this.menuScene.add(rimLight);
        
        this.menuScene.add(new THREE.AmbientLight(0xffffff, 0.3));
        
        this.loadMenuDog();
        
        window.addEventListener('resize', () => this.onResize());
    }
    
    loadMenuDog() {
        this.loader.load('bulldog.glb', (gltf) => {
            this.menuDog = gltf.scene;
            this.menuDog.scale.set(1, 1, 1);
            this.menuDog.position.set(0, 0, 0);
            
            this.applyTexture(this.menuDog, 'white');
            this.menuScene.add(this.menuDog);
            
            if (gltf.animations.length > 0) {
                this.menuMixer = new THREE.AnimationMixer(this.menuDog);
                const idleClip = gltf.animations.find(c => c.name.includes('idle'));
                if (idleClip) {
                    this.menuMixer.clipAction(idleClip).play();
                }
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
                    map: texture,
                    roughness: 0.7,
                    metalness: 0.1
                });
            }
        });
    }
    
    // ==================== UI ====================
    initUI() {
        // Wallet button
        document.getElementById('connectWallet').addEventListener('click', async () => {
            const success = await this.wallet.connect();
            if (success) {
                document.getElementById('connectWallet').style.display = 'none';
                const walletInfo = document.getElementById('walletInfo');
                walletInfo.style.display = 'flex';
                walletInfo.querySelector('.wallet-address').textContent = this.wallet.getShortAddress();
                
                // Generate referral link
                this.updateReferralLink();
            }
        });
        
        // Skin buttons
        document.querySelectorAll('.skin-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.skin-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedSkin = btn.dataset.skin;
                
                if (this.menuDog) {
                    this.applyTexture(this.menuDog, this.selectedSkin);
                }
            });
        });
        
        // Start button
        document.getElementById('startGame').addEventListener('click', () => this.startGame());
        
        // Game over buttons
        document.getElementById('playAgain').addEventListener('click', () => this.restartGame());
        document.getElementById('backToMenu').addEventListener('click', () => this.backToMenu());
        
        // Share button
        document.getElementById('shareTwitter').addEventListener('click', () => this.shareOnTwitter());
        
        // Modals
        document.getElementById('showLeaderboard').addEventListener('click', (e) => {
            e.preventDefault();
            this.showLeaderboard();
        });
        
        document.getElementById('showReferral').addEventListener('click', (e) => {
            e.preventDefault();
            this.showReferralModal();
        });
        
        // Close modals
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
            });
        });
        
        // Copy referral
        document.getElementById('copyReferral').addEventListener('click', () => {
            const input = document.getElementById('referralLink');
            input.select();
            document.execCommand('copy');
            document.getElementById('copyReferral').textContent = 'Copied!';
            setTimeout(() => {
                document.getElementById('copyReferral').textContent = 'Copy';
            }, 2000);
        });
    }


    updateReferralLink() {
        if (this.wallet.address) {
            const link = `${window.location.origin}${window.location.pathname}?ref=${this.wallet.address.slice(0, 8)}`;
            document.getElementById('referralLink').value = link;
        }
    }
    
    showLeaderboard() {
        document.getElementById('leaderboardModal').style.display = 'flex';
        // TODO: Fetch from backend
        document.getElementById('leaderboardList').innerHTML = `
            <div class="leaderboard-item top-3">
                <span class="leaderboard-rank">1</span>
                <span class="leaderboard-address">7xK9...3mPq</span>
                <span class="leaderboard-score">158,000</span>
            </div>
            <div class="leaderboard-item top-3">
                <span class="leaderboard-rank">2</span>
                <span class="leaderboard-address">3nB2...9xLw</span>
                <span class="leaderboard-score">142,500</span>
            </div>
            <div class="leaderboard-item top-3">
                <span class="leaderboard-rank">3</span>
                <span class="leaderboard-address">9pM1...2kJr</span>
                <span class="leaderboard-score">138,200</span>
            </div>
            <div class="leaderboard-item">
                <span class="leaderboard-rank">4</span>
                <span class="leaderboard-address">5tR7...8nQx</span>
                <span class="leaderboard-score">125,800</span>
            </div>
            <div class="leaderboard-item">
                <span class="leaderboard-rank">5</span>
                <span class="leaderboard-address">2mK4...6pLz</span>
                <span class="leaderboard-score">118,300</span>
            </div>
        `;
    }
    
    showReferralModal() {
        document.getElementById('referralModal').style.display = 'flex';
        this.updateReferralLink();
    }
    
    shareOnTwitter() {
        const text = `🐕 I scored ${this.score.toLocaleString()} points in BADRIK RUN!\n\nPlay & earn $BADRIK tokens: ${window.location.href}\n\n#BADRIK #Solana #Web3Gaming`;
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
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
        // Clear old objects
        this.obstacles.forEach(o => this.scene.remove(o));
        this.coinObjects.forEach(c => this.scene.remove(c));
        this.obstacles = [];
        this.coinObjects = [];
        
        if (this.dog) {
            this.dog.position.set(0, 0, 0);
            this.currentLane = 1;
            this.targetX = CONFIG.LANES[1];
        }
        
        this.score = 0;
        this.coins = 0;
        this.distance = 0;
        this.speed = CONFIG.INITIAL_SPEED;
        this.velocityY = 0;
        this.isJumping = false;
        this.isGameOver = false;
        this.isPlaying = true;
        this.lastObstacleZ = -50;
        this.lastCoinZ = -30;
        
        document.getElementById('gameOver').style.display = 'none';
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
        
        // Gradient sky
        const skyColor = new THREE.Color(0x1a0a2e);
        const groundColor = new THREE.Color(0x0a0a1a);
        this.scene.background = skyColor;
        this.scene.fog = new THREE.Fog(skyColor, 40, 120);
        
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
        sun.shadow.camera.far = 100;
        sun.shadow.camera.left = -20;
        sun.shadow.camera.right = 20;
        sun.shadow.camera.top = 20;
        sun.shadow.camera.bottom = -20;
        this.scene.add(sun);
        
        this.scene.add(new THREE.AmbientLight(0x9945FF, 0.3));
        this.scene.add(new THREE.HemisphereLight(0x14F195, 0x1a0a2e, 0.4));
    }
    
    createWorld() {
        // Create ground segments
        const groundGeo = new THREE.PlaneGeometry(15, CONFIG.GROUND_LENGTH);
        const groundMat = new THREE.MeshStandardMaterial({ 
            color: 0x1a1a2e,
            roughness: 0.9
        });
        
        for (let i = 0; i < CONFIG.GROUND_SEGMENTS; i++) {
            const ground = new THREE.Mesh(groundGeo, groundMat);
            ground.rotation.x = -Math.PI / 2;
            ground.position.z = -i * CONFIG.GROUND_LENGTH + CONFIG.GROUND_LENGTH / 2;
            ground.receiveShadow = true;
            this.scene.add(ground);
            this.grounds.push(ground);
        }
        
        // Lane markers
        this.createLaneMarkers();
        
        // Side walls (for visual)
        this.createSideWalls();
    }
    
    createLaneMarkers() {
        const lineGeo = new THREE.PlaneGeometry(0.1, CONFIG.GROUND_LENGTH * CONFIG.GROUND_SEGMENTS);
        const lineMat = new THREE.MeshBasicMaterial({ color: 0x333344 });
        
        [-CONFIG.LANE_WIDTH, CONFIG.LANE_WIDTH].forEach(x => {
            const line = new THREE.Mesh(lineGeo, lineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(x, 0.01, -CONFIG.GROUND_LENGTH);
            this.scene.add(line);
        });
    }
    
    createSideWalls() {
        const wallGeo = new THREE.BoxGeometry(1, 3, CONFIG.GROUND_LENGTH * CONFIG.GROUND_SEGMENTS);
        const wallMat = new THREE.MeshStandardMaterial({ 
            color: 0x14F195,
            emissive: 0x14F195,
            emissiveIntensity: 0.2,
            transparent: true,
            opacity: 0.3
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
            this.dog.rotation.y = Math.PI; // Face forward (negative Z)
            
            this.applyTexture(this.dog, this.selectedSkin);
            this.scene.add(this.dog);
            
            // Setup animations
            if (gltf.animations.length > 0) {
                this.mixer = new THREE.AnimationMixer(this.dog);
                gltf.animations.forEach(clip => {
                    this.animations[clip.name] = this.mixer.clipAction(clip);
                });
                this.playAnimation('run');
            }
        });
    }
    
    playAnimation(name) {
        // Find animation containing name
        const animName = Object.keys(this.animations).find(n => n.toLowerCase().includes(name.toLowerCase()));
        if (!animName) return;
        
        const action = this.animations[animName];
        if (!action) return;
        
        // Stop all other animations
        Object.values(this.animations).forEach(a => {
            if (a !== action) a.fadeOut(0.2);
        });
        
        action.reset().fadeIn(0.2).play();
    }
    
    // ==================== INPUT ====================
    setupInput() {
        // Keyboard
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        
        // Touch
        const canvas = this.renderer.domElement;
        canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
        canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    }
    
    onKeyDown(e) {
        if (!this.isPlaying || this.isGameOver) return;
        
        switch(e.key) {
            case 'ArrowLeft':
            case 'a':
            case 'A':
                this.moveLeft();
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                this.moveRight();
                break;
            case 'ArrowUp':
            case 'w':
            case 'W':
            case ' ':
                this.jump();
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                this.slide();
                break;
        }
    }
    
    onTouchStart(e) {
        e.preventDefault();
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
    }
    
    onTouchEnd(e) {
        if (!this.isPlaying || this.isGameOver) return;
        
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        
        const deltaX = touchEndX - this.touchStartX;
        const deltaY = touchEndY - this.touchStartY;
        
        const minSwipe = 30;
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // Horizontal swipe
            if (deltaX > minSwipe) this.moveRight();
            else if (deltaX < -minSwipe) this.moveLeft();
        } else {
            // Vertical swipe
            if (deltaY < -minSwipe) this.jump();
            else if (deltaY > minSwipe) this.slide();
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
        if (!this.isJumping) {
            this.isJumping = true;
            this.velocityY = CONFIG.JUMP_FORCE;
        }
    }
    
    slide() {
        // TODO: Add slide animation and hitbox change
        this.isSliding = true;
        setTimeout(() => this.isSliding = false, 500);
    }
    
    // ==================== OBSTACLES ====================
    spawnObstacle() {
        const lane = Math.floor(Math.random() * 3);
        const x = CONFIG.LANES[lane];
        
        // Random obstacle type
        const types = ['box', 'tall', 'wide'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        let geometry, height;
        switch(type) {
            case 'box':
                geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
                height = 0.75;
                break;
            case 'tall':
                geometry = new THREE.BoxGeometry(1, 3, 1);
                height = 1.5;
                break;
            case 'wide':
                geometry = new THREE.BoxGeometry(2, 1, 2);
                height = 0.5;
                break;
        }
        
        const material = new THREE.MeshStandardMaterial({
            color: 0xff4444,
            emissive: 0xff0000,
            emissiveIntensity: 0.2
        });
        
        const obstacle = new THREE.Mesh(geometry, material);
        obstacle.position.set(x, height, this.lastObstacleZ - CONFIG.OBSTACLE_SPAWN_DISTANCE);
        obstacle.castShadow = true;
        obstacle.userData = { type: 'obstacle', obstacleType: type };
        
        this.scene.add(obstacle);
        this.obstacles.push(obstacle);
        this.lastObstacleZ = obstacle.position.z;
    }
    
    // ==================== COINS ====================
    spawnCoinRow() {
        const lane = Math.floor(Math.random() * 3);
        const x = CONFIG.LANES[lane];
        const count = 3 + Math.floor(Math.random() * 5);
        
        for (let i = 0; i < count; i++) {
            const coinGeo = new THREE.TorusGeometry(0.3, 0.1, 8, 16);
            const coinMat = new THREE.MeshStandardMaterial({
                color: 0xffc864,
                emissive: 0xffa500,
                emissiveIntensity: 0.5,
                metalness: 0.8,
                roughness: 0.2
            });
            
            const coin = new THREE.Mesh(coinGeo, coinMat);
            coin.position.set(x, 1, this.lastCoinZ - CONFIG.COIN_SPAWN_DISTANCE - i * 3);
            coin.rotation.x = Math.PI / 2;
            coin.userData = { type: 'coin' };
            
            this.scene.add(coin);
            this.coinObjects.push(coin);
        }
        
        this.lastCoinZ = this.lastCoinZ - CONFIG.COIN_SPAWN_DISTANCE - count * 3;
    }


    // ==================== COLLISION ====================
    checkCollisions() {
        if (!this.dog) return;
        
        const playerBox = new THREE.Box3().setFromObject(this.dog);
        playerBox.expandByScalar(-0.2); // Slightly smaller hitbox
        
        // Check obstacles
        for (const obstacle of this.obstacles) {
            const obstacleBox = new THREE.Box3().setFromObject(obstacle);
            
            if (playerBox.intersectsBox(obstacleBox)) {
                this.gameOver();
                return;
            }
        }
        
        // Check coins
        for (let i = this.coinObjects.length - 1; i >= 0; i--) {
            const coin = this.coinObjects[i];
            const coinBox = new THREE.Box3().setFromObject(coin);
            
            if (playerBox.intersectsBox(coinBox)) {
                this.collectCoin(coin, i);
            }
        }
    }
    
    collectCoin(coin, index) {
        this.scene.remove(coin);
        this.coinObjects.splice(index, 1);
        this.coins++;
        this.score += CONFIG.COIN_VALUE;
        
        // TODO: Add sound effect
    }
    
    // ==================== GAME OVER ====================
    gameOver() {
        this.isPlaying = false;
        this.isGameOver = true;
        
        // Update best score
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('badrik_best', this.bestScore.toString());
        }
        
        // Show game over screen
        document.getElementById('gameOver').style.display = 'flex';
        document.getElementById('finalScore').textContent = this.score.toLocaleString();
        document.getElementById('finalCoins').textContent = this.coins.toLocaleString();
        document.getElementById('finalDistance').textContent = Math.floor(this.distance) + 'm';
        document.getElementById('bestScore').textContent = this.bestScore.toLocaleString();
        
        // Submit score to backend
        this.submitScore();
    }
    
    async submitScore() {
        if (!this.wallet.connected) return;
        
        // TODO: Implement backend submission
        console.log('Submitting score:', {
            wallet: this.wallet.address,
            score: this.score,
            coins: this.coins,
            distance: this.distance,
            referral: this.referralCode
        });
    }


    // ==================== UPDATE ====================
    update(delta) {
        if (!this.isPlaying || this.isGameOver || !this.dog) return;
        
        // Increase speed over time
        this.speed = Math.min(this.speed + CONFIG.SPEED_INCREASE * delta, CONFIG.MAX_SPEED);
        
        // Move player forward (actually move world backward)
        this.distance += this.speed * delta;
        this.score = Math.floor(this.distance * CONFIG.DISTANCE_MULTIPLIER) + this.coins * CONFIG.COIN_VALUE;
        
        // Lane switching
        const dx = this.targetX - this.dog.position.x;
        if (Math.abs(dx) > 0.05) {
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
            }
        }
        
        // Move obstacles toward player
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            obstacle.position.z += this.speed * delta;
            
            // Remove if behind player
            if (obstacle.position.z > 10) {
                this.scene.remove(obstacle);
                this.obstacles.splice(i, 1);
            }
        }
        
        // Move coins toward player
        for (let i = this.coinObjects.length - 1; i >= 0; i--) {
            const coin = this.coinObjects[i];
            coin.position.z += this.speed * delta;
            coin.rotation.z += delta * 3; // Spin
            
            if (coin.position.z > 10) {
                this.scene.remove(coin);
                this.coinObjects.splice(i, 1);
            }
        }
        
        // Spawn new obstacles
        if (this.obstacles.length === 0 || 
            this.obstacles[this.obstacles.length - 1].position.z > this.lastObstacleZ + CONFIG.MIN_OBSTACLE_GAP) {
            if (Math.random() < 0.02) {
                this.spawnObstacle();
            }
        }
        
        // Spawn new coins
        if (this.coinObjects.length < 10 && Math.random() < 0.01) {
            this.spawnCoinRow();
        }
        
        // Check collisions
        this.checkCollisions();
        
        // Update HUD
        this.updateHUD();
        
        // Update animation mixer
        if (this.mixer) {
            this.mixer.update(delta);
        }
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
        
        // Gentle sway
        if (this.menuDog) {
            this.menuDog.rotation.y = Math.sin(Date.now() * 0.001) * 0.2;
        }
        
        this.menuRenderer.render(this.menuScene, this.menuCamera);
    }
    
    animate() {
        if (this.isInMenu) return;
        requestAnimationFrame(() => this.animate());
        
        const delta = Math.min(this.clock.getDelta(), 0.1);
        
        this.update(delta);
        
        // Camera follow
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
window.addEventListener('DOMContentLoaded', () => {
    new BadrikRunner();
});
