import * as THREE from 'three';

// Game State
const gameState = {
    isPlaying: false,
    speed: 0,
    maxSpeed: 80,
    acceleration: 0.15,
    deceleration: 0.08,
    brakeForce: 0.3,
    energy: 100,
    energyDrain: 0.02,
    distance: 0,
    totalDistance: 8000, // 8km to Jested
    time: 0,
    position: { x: 0, z: 0 },
    rotation: 0,
    turnSpeed: 0.03,
    isPaused: false,
    pendingProduct: null
};

// Enervit Products
const enervitProducts = [
    {
        name: 'Enervit C2:1 Gel',
        effect: 'energy',
        value: 30,
        color: 0xff6600,
        description: '+30 Energie',
        situation: 'low_energy'
    },
    {
        name: 'Enervit Isocarb',
        effect: 'speed',
        value: 10,
        color: 0x00aaff,
        description: '+10% Rychlost',
        situation: 'uphill'
    },
    {
        name: 'Enervit Salt',
        effect: 'stamina',
        value: 15,
        color: 0xffffff,
        description: '-50% Únavy',
        situation: 'fatigue'
    },
    {
        name: 'Enervit Bar',
        effect: 'recovery',
        value: 20,
        color: 0x8b4513,
        description: '+20 Energie pomalu',
        situation: 'recovery'
    }
];

// Three.js setup
let scene, camera, renderer;
let cyclist, road, terrain;
let pickups = [];
let trees = [];
let clock = new THREE.Clock();

// DOM Elements
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const hud = document.getElementById('hud');
const energyContainer = document.getElementById('energy-container');
const speedDisplay = document.getElementById('speed');
const timeDisplay = document.getElementById('time');
const distanceDisplay = document.getElementById('distance');
const energyBar = document.getElementById('energy-bar');
const pickupNotification = document.getElementById('pickup-notification');
const finishScreen = document.getElementById('finish-screen');
const finalTimeValue = document.getElementById('final-time-value');
const restartBtn = document.getElementById('restart-btn');
const productSelection = document.getElementById('product-selection');
const productOptions = document.getElementById('product-options');

// Input
const keys = {
    up: false,
    down: false,
    left: false,
    right: false
};

// Initialize
init();

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 100, 500);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game-container').appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 500;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    scene.add(sunLight);

    // Create game elements
    createTerrain();
    createRoad();
    createCyclist();
    createEnvironment();
    spawnPickups();

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    startBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', restartGame);

    // Start render loop
    animate();
}

function createTerrain() {
    // Ground
    const groundGeometry = new THREE.PlaneGeometry(500, 2000);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x228b22 });
    terrain = new THREE.Mesh(groundGeometry, groundMaterial);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.z = -500;
    terrain.receiveShadow = true;
    scene.add(terrain);

    // Mountains in background (Jested)
    const mountainGeometry = new THREE.ConeGeometry(80, 150, 8);
    const mountainMaterial = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });

    const jested = new THREE.Mesh(mountainGeometry, mountainMaterial);
    jested.position.set(0, 75, -800);
    scene.add(jested);

    // Jested tower on top
    const towerGeometry = new THREE.CylinderGeometry(2, 5, 30, 8);
    const towerMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const tower = new THREE.Mesh(towerGeometry, towerMaterial);
    tower.position.set(0, 165, -800);
    scene.add(tower);

    // Side mountains
    for (let i = 0; i < 5; i++) {
        const m1 = new THREE.Mesh(
            new THREE.ConeGeometry(40 + Math.random() * 30, 80 + Math.random() * 50, 6),
            mountainMaterial
        );
        m1.position.set(-150 - i * 50, 40 + Math.random() * 20, -600 - i * 100);
        scene.add(m1);

        const m2 = new THREE.Mesh(
            new THREE.ConeGeometry(40 + Math.random() * 30, 80 + Math.random() * 50, 6),
            mountainMaterial
        );
        m2.position.set(150 + i * 50, 40 + Math.random() * 20, -600 - i * 100);
        scene.add(m2);
    }
}

function createRoad() {
    // Main road
    const roadGeometry = new THREE.PlaneGeometry(15, 2000);
    const roadMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    road.position.z = -500;
    road.receiveShadow = true;
    scene.add(road);

    // Road lines
    const lineGeometry = new THREE.PlaneGeometry(0.3, 2000);
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const centerLine = new THREE.Mesh(lineGeometry, lineMaterial);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.y = 0.02;
    centerLine.position.z = -500;
    scene.add(centerLine);

    // Dashed lines on sides
    for (let z = 0; z > -1000; z -= 20) {
        const dashLeft = new THREE.Mesh(
            new THREE.PlaneGeometry(0.2, 10),
            lineMaterial
        );
        dashLeft.rotation.x = -Math.PI / 2;
        dashLeft.position.set(-6, 0.02, z);
        scene.add(dashLeft);

        const dashRight = new THREE.Mesh(
            new THREE.PlaneGeometry(0.2, 10),
            lineMaterial
        );
        dashRight.rotation.x = -Math.PI / 2;
        dashRight.position.set(6, 0.02, z);
        scene.add(dashRight);
    }
}

function createCyclist() {
    // Cyclist group
    cyclist = new THREE.Group();

    // Body
    const bodyGeometry = new THREE.BoxGeometry(0.4, 0.6, 0.3);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xff6600 }); // Enervit orange jersey
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1.3;
    body.rotation.x = 0.3;
    cyclist.add(body);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 1.6, -0.15);
    cyclist.add(head);

    // Helmet
    const helmetGeometry = new THREE.SphereGeometry(0.18, 16, 16);
    const helmetMaterial = new THREE.MeshLambertMaterial({ color: 0xff3300 });
    const helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
    helmet.position.set(0, 1.7, -0.1);
    helmet.scale.set(1, 0.7, 1.2);
    cyclist.add(helmet);

    // Legs
    const legGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8);
    const legMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });

    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.12, 0.8, 0);
    leftLeg.rotation.x = 0.5;
    cyclist.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.12, 0.8, 0);
    rightLeg.rotation.x = -0.5;
    cyclist.add(rightLeg);

    // Bicycle frame
    const frameColor = 0x222222;
    const frameMaterial = new THREE.MeshLambertMaterial({ color: frameColor });

    // Main frame tubes
    const tubeGeometry = new THREE.CylinderGeometry(0.03, 0.03, 1, 8);

    const topTube = new THREE.Mesh(tubeGeometry, frameMaterial);
    topTube.position.set(0, 0.7, 0);
    topTube.rotation.z = Math.PI / 2;
    topTube.rotation.x = 0.2;
    cyclist.add(topTube);

    const downTube = new THREE.Mesh(tubeGeometry, frameMaterial);
    downTube.position.set(0, 0.5, 0.2);
    downTube.rotation.z = Math.PI / 2;
    downTube.rotation.x = -0.3;
    cyclist.add(downTube);

    // Wheels
    const wheelGeometry = new THREE.TorusGeometry(0.35, 0.03, 8, 32);
    const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x111111 });

    const frontWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    frontWheel.position.set(0, 0.35, -0.7);
    frontWheel.rotation.y = Math.PI / 2;
    cyclist.add(frontWheel);

    const rearWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    rearWheel.position.set(0, 0.35, 0.7);
    rearWheel.rotation.y = Math.PI / 2;
    cyclist.add(rearWheel);

    // Handlebars
    const handlebarGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8);
    const handlebar = new THREE.Mesh(handlebarGeometry, frameMaterial);
    handlebar.position.set(0, 1.0, -0.5);
    handlebar.rotation.z = Math.PI / 2;
    cyclist.add(handlebar);

    cyclist.position.set(0, 0, 0);
    cyclist.castShadow = true;
    scene.add(cyclist);
}

function createEnvironment() {
    // Trees along the road
    for (let z = -50; z > -1000; z -= 30) {
        createTree(-15 - Math.random() * 20, z + Math.random() * 10);
        createTree(15 + Math.random() * 20, z + Math.random() * 10);
    }

    // Road signs
    createRoadSign(-8, -100, 'ROAD CLASSICS');
    createRoadSign(8, -300, 'JEŠTĚD 6km');
    createRoadSign(-8, -500, 'JEŠTĚD 4km');
    createRoadSign(8, -700, 'JEŠTĚD 2km');
}

function createTree(x, z) {
    const tree = new THREE.Group();

    // Trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 4, 8);
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 2;
    trunk.castShadow = true;
    tree.add(trunk);

    // Foliage
    const foliageGeometry = new THREE.ConeGeometry(3, 6, 8);
    const foliageMaterial = new THREE.MeshLambertMaterial({ color: 0x228b22 });
    const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliage.position.y = 6;
    foliage.castShadow = true;
    tree.add(foliage);

    tree.position.set(x, 0, z);
    scene.add(tree);
    trees.push(tree);
}

function createRoadSign(x, z, text) {
    const signGroup = new THREE.Group();

    // Post
    const postGeometry = new THREE.CylinderGeometry(0.1, 0.1, 3, 8);
    const postMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });
    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.y = 1.5;
    signGroup.add(post);

    // Sign board
    const boardGeometry = new THREE.BoxGeometry(3, 1, 0.1);
    const boardMaterial = new THREE.MeshLambertMaterial({ color: 0x0066cc });
    const board = new THREE.Mesh(boardGeometry, boardMaterial);
    board.position.y = 3;
    signGroup.add(board);

    signGroup.position.set(x, 0, z);
    scene.add(signGroup);
}

function spawnPickups() {
    // Clear existing pickups
    pickups.forEach(p => scene.remove(p.mesh));
    pickups = [];

    // Spawn Enervit pickups along the road
    const pickupPositions = [
        -80, -180, -280, -400, -520, -640, -760, -880
    ];

    pickupPositions.forEach((z, index) => {
        const product = enervitProducts[index % enervitProducts.length];
        createPickup(
            (Math.random() - 0.5) * 8, // Random x position on road
            z,
            product
        );
    });
}

function createPickup(x, z, product) {
    const pickupGroup = new THREE.Group();

    // Glowing orb
    const orbGeometry = new THREE.SphereGeometry(1, 16, 16);
    const orbMaterial = new THREE.MeshBasicMaterial({
        color: product.color,
        transparent: true,
        opacity: 0.7
    });
    const orb = new THREE.Mesh(orbGeometry, orbMaterial);
    pickupGroup.add(orb);

    // Inner core
    const coreGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    pickupGroup.add(core);

    // Ring
    const ringGeometry = new THREE.TorusGeometry(1.3, 0.1, 8, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: product.color });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    pickupGroup.add(ring);

    pickupGroup.position.set(x, 1.5, z);
    scene.add(pickupGroup);

    pickups.push({
        mesh: pickupGroup,
        product: product,
        collected: false
    });
}

function startGame() {
    startScreen.style.display = 'none';
    hud.style.display = 'flex';
    energyContainer.style.display = 'block';
    gameState.isPlaying = true;
    gameState.time = 0;
    clock.start();
}

function restartGame() {
    finishScreen.style.display = 'none';

    // Reset game state
    gameState.speed = 0;
    gameState.energy = 100;
    gameState.distance = 0;
    gameState.time = 0;
    gameState.position = { x: 0, z: 0 };
    gameState.rotation = 0;
    gameState.isPlaying = true;
    gameState.isPaused = false;

    // Reset cyclist position
    cyclist.position.set(0, 0, 0);
    cyclist.rotation.y = 0;

    // Respawn pickups
    spawnPickups();

    // Show HUD
    hud.style.display = 'flex';
    energyContainer.style.display = 'block';

    clock.start();
}

function showProductSelection(pickup) {
    gameState.isPaused = true;
    gameState.pendingProduct = pickup;

    // Determine current situation
    let situation = 'low_energy';
    if (gameState.energy < 30) {
        situation = 'low_energy';
    } else if (gameState.distance > gameState.totalDistance * 0.5) {
        situation = 'uphill';
    } else if (gameState.speed < 20) {
        situation = 'fatigue';
    } else {
        situation = 'recovery';
    }

    // Create product options
    productOptions.innerHTML = '';

    // Shuffle and pick 3 products (one correct)
    const correctProduct = enervitProducts.find(p => p.situation === situation) || enervitProducts[0];
    let options = [correctProduct];

    const otherProducts = enervitProducts.filter(p => p !== correctProduct);
    while (options.length < 3 && otherProducts.length > 0) {
        const idx = Math.floor(Math.random() * otherProducts.length);
        options.push(otherProducts.splice(idx, 1)[0]);
    }

    // Shuffle options
    options = options.sort(() => Math.random() - 0.5);

    options.forEach(product => {
        const btn = document.createElement('div');
        btn.className = 'product-btn';
        btn.innerHTML = `
            <div style="width:80px;height:80px;background:${new THREE.Color(product.color).getStyle()};border-radius:50%;margin:0 auto 10px;"></div>
            <div class="product-name">${product.name}</div>
            <div class="product-effect">${product.description}</div>
        `;
        btn.onclick = () => selectProduct(product, product === correctProduct);
        productOptions.appendChild(btn);
    });

    productSelection.style.display = 'block';
}

function selectProduct(product, isCorrect) {
    productSelection.style.display = 'none';
    gameState.isPaused = false;

    if (isCorrect) {
        // Apply full effect
        applyProductEffect(product, 1.0);
        showPickupNotification(`${product.name} - SPRÁVNÁ VOLBA!`, '#00ff00');
    } else {
        // Apply reduced effect
        applyProductEffect(product, 0.3);
        showPickupNotification(`${product.name} - Špatná volba...`, '#ff0000');
    }

    // Mark pickup as collected
    if (gameState.pendingProduct) {
        gameState.pendingProduct.collected = true;
        scene.remove(gameState.pendingProduct.mesh);
    }
    gameState.pendingProduct = null;
}

function applyProductEffect(product, multiplier) {
    switch (product.effect) {
        case 'energy':
            gameState.energy = Math.min(100, gameState.energy + product.value * multiplier);
            break;
        case 'speed':
            gameState.maxSpeed += product.value * multiplier;
            setTimeout(() => {
                gameState.maxSpeed = 80; // Reset after 10 seconds
            }, 10000);
            break;
        case 'stamina':
            gameState.energyDrain *= (1 - 0.5 * multiplier);
            setTimeout(() => {
                gameState.energyDrain = 0.02; // Reset after 15 seconds
            }, 15000);
            break;
        case 'recovery':
            // Gradual energy recovery
            const recoveryInterval = setInterval(() => {
                if (gameState.energy < 100) {
                    gameState.energy += 2 * multiplier;
                } else {
                    clearInterval(recoveryInterval);
                }
            }, 500);
            setTimeout(() => clearInterval(recoveryInterval), 10000);
            break;
    }
}

function showPickupNotification(text, color) {
    pickupNotification.textContent = text;
    pickupNotification.style.display = 'block';
    pickupNotification.style.borderColor = color;
    pickupNotification.style.color = color;

    setTimeout(() => {
        pickupNotification.style.display = 'none';
    }, 2000);
}

function finishGame() {
    gameState.isPlaying = false;
    hud.style.display = 'none';
    energyContainer.style.display = 'none';

    const minutes = Math.floor(gameState.time / 60);
    const seconds = Math.floor(gameState.time % 60);
    finalTimeValue.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    finishScreen.style.display = 'flex';
}

function onKeyDown(e) {
    switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            keys.up = true;
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            keys.down = true;
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            keys.left = true;
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            keys.right = true;
            break;
    }
}

function onKeyUp(e) {
    switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            keys.up = false;
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            keys.down = false;
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            keys.left = false;
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            keys.right = false;
            break;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateGame(delta) {
    if (!gameState.isPlaying || gameState.isPaused) return;

    // Time
    gameState.time += delta;

    // Energy drain based on speed
    const energyDrainRate = gameState.energyDrain * (1 + gameState.speed / 100);
    gameState.energy -= energyDrainRate;
    gameState.energy = Math.max(0, gameState.energy);

    // Speed affected by energy
    const energyMultiplier = 0.5 + (gameState.energy / 100) * 0.5;
    const effectiveMaxSpeed = gameState.maxSpeed * energyMultiplier;

    // Acceleration/Deceleration
    if (keys.up && gameState.energy > 0) {
        gameState.speed += gameState.acceleration * energyMultiplier;
    } else if (keys.down) {
        gameState.speed -= gameState.brakeForce;
    } else {
        gameState.speed -= gameState.deceleration;
    }

    gameState.speed = Math.max(0, Math.min(effectiveMaxSpeed, gameState.speed));

    // Turning
    if (gameState.speed > 0) {
        if (keys.left) {
            gameState.rotation += gameState.turnSpeed * (gameState.speed / 40);
            cyclist.rotation.z = 0.2; // Lean
        } else if (keys.right) {
            gameState.rotation -= gameState.turnSpeed * (gameState.speed / 40);
            cyclist.rotation.z = -0.2; // Lean
        } else {
            cyclist.rotation.z = 0;
        }
    }

    // Movement
    const moveSpeed = gameState.speed * delta * 2;
    gameState.position.x += Math.sin(gameState.rotation) * moveSpeed;
    gameState.position.z -= Math.cos(gameState.rotation) * moveSpeed;

    // Keep on road bounds
    gameState.position.x = Math.max(-6, Math.min(6, gameState.position.x));

    // Update distance
    gameState.distance = Math.abs(gameState.position.z);

    // Check finish
    if (gameState.distance >= gameState.totalDistance) {
        finishGame();
        return;
    }

    // Check pickups
    pickups.forEach(pickup => {
        if (!pickup.collected) {
            const dx = cyclist.position.x - pickup.mesh.position.x;
            const dz = cyclist.position.z - pickup.mesh.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance < 3) {
                showProductSelection(pickup);
            }
        }
    });

    // Animate pickups
    pickups.forEach(pickup => {
        if (!pickup.collected) {
            pickup.mesh.rotation.y += delta * 2;
            pickup.mesh.position.y = 1.5 + Math.sin(Date.now() / 500) * 0.3;
        }
    });

    // Update cyclist position
    cyclist.position.x = gameState.position.x;
    cyclist.position.z = gameState.position.z;
    cyclist.rotation.y = gameState.rotation;

    // Pedaling animation
    const pedalSpeed = gameState.speed / 20;
    cyclist.children.forEach((child, index) => {
        if (index === 3 || index === 4) { // Legs
            child.rotation.x = Math.sin(Date.now() / 100 * pedalSpeed) * 0.5;
        }
    });

    // Camera follow
    const cameraOffset = new THREE.Vector3(0, 5, 12);
    cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), gameState.rotation);
    camera.position.lerp(
        new THREE.Vector3(
            cyclist.position.x + cameraOffset.x,
            cyclist.position.y + cameraOffset.y,
            cyclist.position.z + cameraOffset.z
        ),
        0.1
    );
    camera.lookAt(cyclist.position.x, cyclist.position.y + 1, cyclist.position.z);

    // Update HUD
    speedDisplay.textContent = Math.round(gameState.speed);
    distanceDisplay.textContent = Math.round(gameState.distance);

    const minutes = Math.floor(gameState.time / 60);
    const seconds = Math.floor(gameState.time % 60);
    timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    energyBar.style.width = `${gameState.energy}%`;

    // Move world (for infinite road effect)
    const worldOffset = gameState.position.z;
    terrain.position.z = worldOffset - 500;
    road.position.z = worldOffset - 500;
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    updateGame(delta);

    renderer.render(scene, camera);
}
