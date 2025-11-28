import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

class BadrikGame {
    constructor() {
        this.selectedSkin = 'white';
        this.textureLoader = new THREE.TextureLoader();
        this.loader = new GLTFLoader();
        
        // Three.js
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();
        
        // Персонаж
        this.dog = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        this.currentAnimName = '';
        
        // Меню
        this.menuScene = null;
        this.menuCamera = null;
        this.menuRenderer = null;
        this.menuDog = null;
        this.menuMixer = null;
        this.isInMenu = true;

        // Камера
        this.cameraAngleX = Math.PI;
        this.cameraAngleY = 0.4;
        this.cameraDistance = 4;
        
        // Управление
        this.keys = {};
        this.mouseButtons = { left: false, right: false };
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        
        // Состояние
        this.state = 'idle';
        this.walkSpeed = 1.5;
        this.runSpeed = 4;
        
        // Прыжок
        this.isJumping = false;
        this.velocityY = 0;
        this.gravity = -15;
        this.jumpForce = 5;
        this.groundY = 0;
        
        // Текстуры
        this.textures = {};
        this.textureMap = {
            'white': 'frenchbulldog.texture.white.001.png',
            'fawn': 'frenchbulldog.texture.fawn.001.png',
            'blackpied': 'frenchbulldog.texture.blackpied.001.png'
        };
        
        this.init();
    }
    
    init() {
        // Предзагрузка текстур
        for (const [key, path] of Object.entries(this.textureMap)) {
            const tex = this.textureLoader.load(path);
            tex.flipY = false;
            tex.colorSpace = THREE.SRGBColorSpace;
            this.textures[key] = tex;
        }
        
        this.initMenuScene();
        this.initMenuUI();
        this.animateMenu();
    }

    
    // ==================== МЕНЮ НА ВЕСЬ ЭКРАН ====================
    
    initMenuScene() {
        this.menuScene = new THREE.Scene();
        this.menuScene.background = new THREE.Color(0x1a1a2e);
        
        // Камера - крупный план морды
        this.menuCamera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
        this.menuCamera.position.set(0, 0.25, 0.9);
        this.menuCamera.lookAt(0, 0.15, 0);
        
        // Рендерер на весь экран
        const canvas = document.getElementById('menuCanvas');
        this.menuRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.menuRenderer.setSize(window.innerWidth, window.innerHeight);
        this.menuRenderer.shadowMap.enabled = true;
        
        // Освещение
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
        keyLight.position.set(2, 3, 3);
        this.menuScene.add(keyLight);
        
        const fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
        fillLight.position.set(-2, 1, 2);
        this.menuScene.add(fillLight);
        
        const rimLight = new THREE.DirectionalLight(0xffc864, 0.6);
        rimLight.position.set(0, 2, -2);
        this.menuScene.add(rimLight);
        
        this.menuScene.add(new THREE.AmbientLight(0xffffff, 0.3));
        
        // Загружаем бульдога
        this.loadMenuDog();
        
        // Resize
        window.addEventListener('resize', () => {
            if (this.isInMenu) {
                this.menuCamera.aspect = window.innerWidth / window.innerHeight;
                this.menuCamera.updateProjectionMatrix();
                this.menuRenderer.setSize(window.innerWidth, window.innerHeight);
            }
        });
    }

    
    loadMenuDog() {
        this.loader.load('bulldog.glb', (gltf) => {
            this.menuDog = gltf.scene;
            this.menuDog.scale.set(1, 1, 1);
            this.menuDog.position.set(0, 0, 0);
            this.menuDog.rotation.y = 0; // Лицом к камере (морда вперёд по Z+)
            
            this.applyTextureToModel(this.menuDog, 'white');
            this.menuScene.add(this.menuDog);
            
            // Анимация idle
            if (gltf.animations.length > 0) {
                this.menuMixer = new THREE.AnimationMixer(this.menuDog);
                const idleClip = gltf.animations.find(c => c.name.includes('idle_A_0'));
                if (idleClip) {
                    this.menuMixer.clipAction(idleClip).play();
                }
            }
        });
    }
    
    applyTextureToModel(model, skinName) {
        const texture = this.textures[skinName];
        if (!texture) return;
        
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.material = new THREE.MeshStandardMaterial({
                    map: texture,
                    roughness: 0.8,
                    metalness: 0.1
                });
            }
        });
    }

    
    initMenuUI() {
        const skinButtons = document.querySelectorAll('.skin-btn');
        const startButton = document.getElementById('startGame');
        
        // Белый выбран по умолчанию
        skinButtons[0].classList.add('selected');
        startButton.disabled = false;
        
        skinButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                skinButtons.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedSkin = btn.dataset.skin;
                
                // Меняем текстуру
                if (this.menuDog) {
                    this.applyTextureToModel(this.menuDog, this.selectedSkin);
                }
            });
        });
        
        startButton.addEventListener('click', () => this.startGame());
    }
    
    animateMenu() {
        if (!this.isInMenu) return;
        requestAnimationFrame(() => this.animateMenu());
        
        const delta = this.clock.getDelta();
        
        if (this.menuMixer) this.menuMixer.update(delta);
        
        // Лёгкое покачивание
        if (this.menuDog) {
            this.menuDog.rotation.y = Math.sin(Date.now() * 0.0008) * 0.15;
        }
        
        this.menuRenderer.render(this.menuScene, this.menuCamera);
    }

    
    // ==================== ИГРА ====================
    
    startGame() {
        this.isInMenu = false;
        document.getElementById('menu').style.display = 'none';
        document.getElementById('gameContainer').style.display = 'block';
        
        this.initThreeJS();
        this.setupLights();
        this.createWorld();
        this.loadDog();
        this.setupInput();
        this.animate();
    }
    
    initThreeJS() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this.scene.fog = new THREE.Fog(0x87ceeb, 30, 100);
        
        const canvas = document.getElementById('gameCanvas');
        this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
        
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        window.addEventListener('resize', () => {
            if (!this.isInMenu) {
                this.camera.aspect = window.innerWidth / window.innerHeight;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(window.innerWidth, window.innerHeight);
            }
        });
    }

    
    setupLights() {
        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(30, 50, 30);
        sun.castShadow = true;
        sun.shadow.camera.left = -20;
        sun.shadow.camera.right = 20;
        sun.shadow.camera.top = 20;
        sun.shadow.camera.bottom = -20;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        this.scene.add(sun);
        
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
        this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x3d5c3d, 0.5));
    }
    
    createWorld() {
        const groundGeo = new THREE.PlaneGeometry(100, 100);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a7c32, roughness: 0.9 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        const grid = new THREE.GridHelper(100, 50, 0x666666, 0x444444);
        grid.position.y = 0.01;
        this.scene.add(grid);
    }
    
    loadDog() {
        this.loader.load('bulldog.glb', (gltf) => {
            this.dog = gltf.scene;
            this.dog.scale.set(1, 1, 1);
            this.dog.position.set(0, 0, 0);
            
            this.applyTextureToModel(this.dog, this.selectedSkin);
            this.scene.add(this.dog);
            this.setupAnimations(gltf);
        });
    }

    
    setupAnimations(gltf) {
        if (!gltf.animations || gltf.animations.length === 0) return;
        
        this.mixer = new THREE.AnimationMixer(this.dog);
        gltf.animations.forEach((clip) => {
            this.animations[clip.name] = this.mixer.clipAction(clip);
        });
        
        this.playAnimation('idle_A_0');
    }
    
    playAnimation(name, loop = true, crossfade = 0.3) {
        const action = this.animations[name];
        if (!action || this.currentAnimName === name) return;
        
        if (this.currentAction) this.currentAction.fadeOut(crossfade);
        
        action.reset();
        action.fadeIn(crossfade);
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
        action.clampWhenFinished = !loop;
        action.play();
        
        this.currentAction = action;
        this.currentAnimName = name;
    }
    
    setupInput() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            if (e.key === '1') this.toggleSit();
            if (e.key === '2') this.toggleLay();
            if (e.key === '3') this.doScratch();
            if (e.key === ' ') this.jump(); // Пробел = прыжок
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        
        const canvas = this.renderer.domElement;
        
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.mouseButtons.left = true;
            if (e.button === 2) this.mouseButtons.right = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });
        
        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouseButtons.left = false;
            if (e.button === 2) this.mouseButtons.right = false;
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (this.mouseButtons.left || this.mouseButtons.right) {
                const dx = e.clientX - this.lastMouseX;
                const dy = e.clientY - this.lastMouseY;
                
                this.cameraAngleX -= dx * 0.005;
                this.cameraAngleY = Math.max(0.1, Math.min(1.3, this.cameraAngleY + dy * 0.005));
                
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            }
        });
        
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.cameraDistance = Math.max(2, Math.min(10, this.cameraDistance + e.deltaY * 0.01));
        });
        
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    
    // === ДЕЙСТВИЯ ===
    
    toggleSit() {
        if (this.state === 'sitting') {
            this.state = 'idle';
            this.playAnimation('sit_A_to_walk_A', false);
            setTimeout(() => {
                if (this.state === 'idle') this.playAnimation('idle_A_0');
            }, 500);
        } else if (this.state === 'idle') {
            this.state = 'sitting';
            this.playAnimation('walk_A_to_sit_A', false);
            setTimeout(() => {
                if (this.state === 'sitting') this.playAnimation('sit_A_0');
            }, 500);
        }
    }
    
    toggleLay() {
        if (this.state === 'laying') {
            this.state = 'idle';
            this.playAnimation('idle_A_0');
        } else if (this.state === 'idle') {
            this.state = 'laying';
            this.playAnimation('layingdown_A_0');
        }
    }
    
    doScratch() {
        if (this.state === 'sitting') {
            this.playAnimation('sit_A_itch', false);
            setTimeout(() => {
                if (this.state === 'sitting') this.playAnimation('sit_A_0');
            }, 3000);
        }
    }
    
    jump() {
        // Можно прыгать только с земли и не сидя/лёжа
        if (this.isJumping) return;
        if (this.state === 'sitting' || this.state === 'laying') return;
        
        this.isJumping = true;
        this.velocityY = this.jumpForce;
        
        // Просто продолжаем текущую анимацию - выглядит естественнее
    }

    
    // === ДВИЖЕНИЕ ===
    
    updateMovement(delta) {
        if (!this.dog) return;
        if (this.state === 'sitting' || this.state === 'laying') return;
        
        // === ФИЗИКА ПРЫЖКА ===
        if (this.isJumping) {
            this.velocityY += this.gravity * delta;
            this.dog.position.y += this.velocityY * delta;
            
            // Приземление
            if (this.dog.position.y <= this.groundY) {
                this.dog.position.y = this.groundY;
                this.isJumping = false;
                this.velocityY = 0;
            }
        }
        
        // === ГОРИЗОНТАЛЬНОЕ ДВИЖЕНИЕ ===
        let moveForward = 0, moveRight = 0;
        let isMoving = false;
        
        if (this.keys['w']) { moveForward = 1; isMoving = true; }
        if (this.keys['s']) { moveForward = -1; isMoving = true; }
        if (this.keys['a']) { moveRight = 1; isMoving = true; }
        if (this.keys['d']) { moveRight = -1; isMoving = true; }
        
        if (isMoving) {
            const len = Math.sqrt(moveForward * moveForward + moveRight * moveRight);
            moveForward /= len;
            moveRight /= len;
            
            const camDir = this.cameraAngleX + Math.PI;
            const worldX = Math.sin(camDir) * moveForward + Math.sin(camDir + Math.PI/2) * moveRight;
            const worldZ = Math.cos(camDir) * moveForward + Math.cos(camDir + Math.PI/2) * moveRight;
            
            // В прыжке двигаемся медленнее
            let speed = this.keys['shift'] ? this.walkSpeed : this.runSpeed;
            if (this.isJumping) speed *= 0.7;
            
            this.dog.position.x += worldX * speed * delta;
            this.dog.position.z += worldZ * speed * delta;
            
            // Плавный поворот
            const targetAngle = Math.atan2(worldX, worldZ);
            let angleDiff = targetAngle - this.dog.rotation.y;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            this.dog.rotation.y += angleDiff * 0.15;

            
            // Анимация (только если не в прыжке)
            if (!this.isJumping) {
                if (this.keys['shift']) {
                    if (this.state !== 'walking') {
                        this.state = 'walking';
                        this.playAnimation('walk_A_0');
                    }
                } else {
                    if (this.state !== 'running') {
                        this.state = 'running';
                        this.playAnimation('run_A_0');
                    }
                }
            }
        } else {
            if (!this.isJumping && (this.state === 'walking' || this.state === 'running')) {
                this.state = 'idle';
                this.playAnimation('idle_A_0');
            }
        }
    }
    
    updateCamera() {
        if (!this.dog) return;
        
        const offset = new THREE.Vector3(
            Math.sin(this.cameraAngleX) * this.cameraDistance * Math.cos(this.cameraAngleY),
            this.cameraDistance * Math.sin(this.cameraAngleY) + 0.3,
            Math.cos(this.cameraAngleX) * this.cameraDistance * Math.cos(this.cameraAngleY)
        );
        
        const targetPos = this.dog.position.clone().add(offset);
        this.camera.position.lerp(targetPos, 0.1);
        
        const lookAt = this.dog.position.clone();
        lookAt.y += 0.25;
        this.camera.lookAt(lookAt);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();
        
        if (this.mixer) this.mixer.update(delta);
        this.updateMovement(delta);
        this.updateCamera();
        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('DOMContentLoaded', () => new BadrikGame());
