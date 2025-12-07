import * as THREE from 'three';

// ============================================
// ROAD CLASSICS - CESTA NA JEŠTĚD
// Realistic cycling game based on Road Classics event
// Route: Liberec -> Raspenava -> Kryštofovo Údolí -> Ještěd
// ============================================

// Route checkpoints (based on real Road Classics short route - 49km, 1100m elevation)
const ROUTE_CHECKPOINTS = [
    { name: 'START - Liberec', distance: 0, elevation: 370 },
    { name: 'Raspenava', distance: 15000, elevation: 450 },
    { name: 'Kryštofovo Údolí', distance: 32000, elevation: 520 },
    { name: 'CÍL - Ještěd', distance: 49000, elevation: 1012 }
];

// Game State
const gameState = {
    isPlaying: false,
    speed: 0,
    maxSpeed: 65,
    acceleration: 0.12,
    deceleration: 0.06,
    brakeForce: 0.25,
    energy: 100,
    energyDrain: 0.015,
    distance: 0,
    totalDistance: 49000, // 49km like real short route
    elevation: 370, // Starting elevation in Liberec
    time: 0,
    position: { x: 0, z: 0, y: 0 },
    rotation: 0,
    turnSpeed: 0.025,
    isPaused: false,
    pendingProduct: null,
    currentCheckpoint: 0,
    playerRank: 1
};

// AI Competitors
const competitors = [];
const COMPETITOR_COUNT = 8;
const COMPETITOR_COLORS = [
    0x0066ff, // Blue
    0x00cc00, // Green
    0xff0066, // Pink
    0xffcc00, // Yellow
    0x9900ff, // Purple
    0x00cccc, // Cyan
    0xff9900, // Orange
    0xcc0000  // Dark Red
];
const COMPETITOR_NAMES = [
    'Petr Vacek', 'Jan Novák', 'Martin Král', 'Tomáš Horák',
    'David Svoboda', 'Jakub Černý', 'Filip Dvořák', 'Ondřej Procházka'
];

// Enervit Products
const enervitProducts = [
    {
        name: 'Enervit C2:1 Gel',
        effect: 'energy',
        value: 35,
        color: 0xff6600,
        description: '+35 Energie',
        situation: 'low_energy'
    },
    {
        name: 'Enervit Isocarb 2:1',
        effect: 'speed',
        value: 8,
        color: 0x00aaff,
        description: '+8 km/h Max',
        situation: 'uphill'
    },
    {
        name: 'Enervit Salt Caps',
        effect: 'stamina',
        value: 15,
        color: 0xffffff,
        description: '-50% Únavy',
        situation: 'fatigue'
    },
    {
        name: 'Enervit Power Sport',
        effect: 'recovery',
        value: 25,
        color: 0x8b4513,
        description: '+25 Energie postupně',
        situation: 'recovery'
    }
];

// Three.js setup
let scene, camera, renderer;
let cyclist, road, terrain;
let pickups = [];
let trees = [];
let buildings = [];
let roadSegments = [];
let clock = new THREE.Clock();

// DOM Elements
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const hud = document.getElementById('hud');
const energyContainer = document.getElementById('energy-container');
const speedometer = document.getElementById('speedometer');
const routeProgress = document.getElementById('route-progress');
const speedDisplay = document.getElementById('speed');
const timeDisplay = document.getElementById('time');
const distanceDisplay = document.getElementById('distance');
const elevationDisplay = document.getElementById('elevation');
const rankDisplay = document.getElementById('rank');
const playerMarker = document.getElementById('player-marker');
const energyBar = document.getElementById('energy-bar');
const pickupNotification = document.getElementById('pickup-notification');
const finishScreen = document.getElementById('finish-screen');
const finalTimeValue = document.getElementById('final-time-value');
const finalRankDisplay = document.getElementById('final-rank');
const restartBtn = document.getElementById('restart-btn');
const productSelection = document.getElementById('product-selection');
const productOptions = document.getElementById('product-options');
const situationText = document.getElementById('situation-text');

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
    scene.fog = new THREE.Fog(0x87ceeb, 150, 800);

    // Camera
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 8, 18);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game-container').appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffcc, 1.2);
    sunLight.position.set(100, 200, 100);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 1000;
    sunLight.shadow.camera.left = -200;
    sunLight.shadow.camera.right = 200;
    sunLight.shadow.camera.top = 200;
    sunLight.shadow.camera.bottom = -200;
    scene.add(sunLight);

    // Hemisphere light for better outdoor feel
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x228b22, 0.4);
    scene.add(hemiLight);

    // Create game elements
    createTerrain();
    createRoad();
    createCyclist();
    createCompetitors();
    createEnvironment();
    createCheckpoints();
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
    // Rolling hills terrain
    const terrainSize = 600;
    const segments = 100;
    const groundGeometry = new THREE.PlaneGeometry(terrainSize, 3000, segments, segments);

    // Add elevation variation
    const positions = groundGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);

        // Create rolling hills
        let elevation = 0;
        elevation += Math.sin(x * 0.02) * 8;
        elevation += Math.sin(z * 0.01) * 15;
        elevation += Math.cos(x * 0.01 + z * 0.015) * 10;

        // Keep road area flat
        const distFromCenter = Math.abs(x);
        if (distFromCenter < 15) {
            elevation *= distFromCenter / 15;
        }

        positions.setZ(i, elevation);
    }
    groundGeometry.computeVertexNormals();

    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x3d8c40 });
    terrain = new THREE.Mesh(groundGeometry, groundMaterial);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.z = -800;
    terrain.receiveShadow = true;
    scene.add(terrain);

    // Ještěd mountain in the distance
    createJestedMountain();
}

function createJestedMountain() {
    const mountainGroup = new THREE.Group();

    // Main Ještěd mountain
    const mountainGeometry = new THREE.ConeGeometry(120, 200, 12);
    const mountainMaterial = new THREE.MeshLambertMaterial({ color: 0x4a6b4a });
    const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
    mountain.position.set(0, 100, -1200);
    mountainGroup.add(mountain);

    // Snow cap
    const snowCapGeometry = new THREE.ConeGeometry(30, 40, 12);
    const snowMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const snowCap = new THREE.Mesh(snowCapGeometry, snowMaterial);
    snowCap.position.set(0, 180, -1200);
    mountainGroup.add(snowCap);

    // Ještěd TV Tower (iconic hyperboloid structure)
    const towerGroup = new THREE.Group();

    // Tower base
    const baseGeometry = new THREE.CylinderGeometry(8, 12, 20, 16);
    const towerMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const base = new THREE.Mesh(baseGeometry, towerMaterial);
    base.position.y = 10;
    towerGroup.add(base);

    // Tower middle (hyperboloid shape)
    const middleGeometry = new THREE.CylinderGeometry(6, 8, 40, 16);
    const middle = new THREE.Mesh(middleGeometry, towerMaterial);
    middle.position.y = 40;
    towerGroup.add(middle);

    // Tower top
    const topGeometry = new THREE.ConeGeometry(8, 25, 16);
    const top = new THREE.Mesh(topGeometry, towerMaterial);
    top.position.y = 72;
    towerGroup.add(top);

    // Antenna
    const antennaGeometry = new THREE.CylinderGeometry(0.5, 0.5, 20, 8);
    const antenna = new THREE.Mesh(antennaGeometry, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    antenna.position.y = 95;
    towerGroup.add(antenna);

    towerGroup.position.set(0, 200, -1200);
    mountainGroup.add(towerGroup);

    // Surrounding mountains
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const radius = 300 + Math.random() * 200;
        const height = 80 + Math.random() * 80;

        const sideMount = new THREE.Mesh(
            new THREE.ConeGeometry(60 + Math.random() * 40, height, 8),
            new THREE.MeshLambertMaterial({ color: 0x3d5c3d })
        );
        sideMount.position.set(
            Math.cos(angle) * radius,
            height / 2,
            -1000 + Math.sin(angle) * radius * 0.5
        );
        mountainGroup.add(sideMount);
    }

    scene.add(mountainGroup);
}

function createRoad() {
    // Wide Czech country road
    const roadWidth = 12;
    const roadLength = 3000;

    // Asphalt surface
    const roadGeometry = new THREE.PlaneGeometry(roadWidth, roadLength);
    const roadMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.05;
    road.position.z = -roadLength / 2 + 100;
    road.receiveShadow = true;
    scene.add(road);

    // Road markings
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const yellowLineMaterial = new THREE.MeshBasicMaterial({ color: 0xffcc00 });

    // Center line (dashed yellow)
    for (let z = 50; z > -roadLength; z -= 15) {
        const dash = new THREE.Mesh(
            new THREE.PlaneGeometry(0.2, 8),
            yellowLineMaterial
        );
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(0, 0.06, z);
        scene.add(dash);
    }

    // Edge lines (solid white)
    const leftEdge = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, roadLength),
        lineMaterial
    );
    leftEdge.rotation.x = -Math.PI / 2;
    leftEdge.position.set(-roadWidth / 2 + 0.3, 0.06, -roadLength / 2 + 100);
    scene.add(leftEdge);

    const rightEdge = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, roadLength),
        lineMaterial
    );
    rightEdge.rotation.x = -Math.PI / 2;
    rightEdge.position.set(roadWidth / 2 - 0.3, 0.06, -roadLength / 2 + 100);
    scene.add(rightEdge);

    // Road shoulders
    const shoulderMaterial = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const leftShoulder = new THREE.Mesh(
        new THREE.PlaneGeometry(2, roadLength),
        shoulderMaterial
    );
    leftShoulder.rotation.x = -Math.PI / 2;
    leftShoulder.position.set(-roadWidth / 2 - 1, 0.03, -roadLength / 2 + 100);
    scene.add(leftShoulder);

    const rightShoulder = new THREE.Mesh(
        new THREE.PlaneGeometry(2, roadLength),
        shoulderMaterial
    );
    rightShoulder.rotation.x = -Math.PI / 2;
    rightShoulder.position.set(roadWidth / 2 + 1, 0.03, -roadLength / 2 + 100);
    scene.add(rightShoulder);
}

function createCyclistModel(jerseyColor, scale = 1) {
    const cyclistGroup = new THREE.Group();
    const s = scale * 2.5; // Much bigger cyclist

    // === BICYCLE ===

    // Frame - main triangle
    const frameMaterial = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

    // Top tube
    const topTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 1.4 * s, 8),
        frameMaterial
    );
    topTube.rotation.z = Math.PI / 2;
    topTube.rotation.y = 0.15;
    topTube.position.set(0, 1.1 * s, 0.1 * s);
    cyclistGroup.add(topTube);

    // Down tube
    const downTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 1.3 * s, 8),
        frameMaterial
    );
    downTube.rotation.z = 0.5;
    downTube.position.set(0, 0.65 * s, 0.35 * s);
    cyclistGroup.add(downTube);

    // Seat tube
    const seatTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 1.0 * s, 8),
        frameMaterial
    );
    seatTube.position.set(0, 0.7 * s, 0.7 * s);
    cyclistGroup.add(seatTube);

    // Seat stays
    const seatStay = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.9 * s, 8),
        frameMaterial
    );
    seatStay.rotation.z = -0.4;
    seatStay.position.set(0, 0.65 * s, 0.9 * s);
    cyclistGroup.add(seatStay);

    // Chain stays
    const chainStay = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.8 * s, 8),
        frameMaterial
    );
    chainStay.rotation.z = Math.PI / 2;
    chainStay.position.set(0, 0.35 * s, 0.7 * s);
    cyclistGroup.add(chainStay);

    // Fork
    const fork = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.7 * s, 8),
        frameMaterial
    );
    fork.rotation.z = 0.15;
    fork.position.set(0, 0.55 * s, -0.4 * s);
    cyclistGroup.add(fork);

    // Wheels
    const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const tireMaterial = new THREE.MeshLambertMaterial({ color: 0x222222 });

    // Front wheel
    const frontWheelRim = new THREE.Mesh(
        new THREE.TorusGeometry(0.42 * s, 0.025 * s, 8, 32),
        wheelMaterial
    );
    frontWheelRim.rotation.y = Math.PI / 2;
    frontWheelRim.position.set(0, 0.42 * s, -0.7 * s);
    cyclistGroup.add(frontWheelRim);

    const frontTire = new THREE.Mesh(
        new THREE.TorusGeometry(0.42 * s, 0.04 * s, 8, 32),
        tireMaterial
    );
    frontTire.rotation.y = Math.PI / 2;
    frontTire.position.set(0, 0.42 * s, -0.7 * s);
    cyclistGroup.add(frontTire);

    // Rear wheel
    const rearWheelRim = new THREE.Mesh(
        new THREE.TorusGeometry(0.42 * s, 0.025 * s, 8, 32),
        wheelMaterial
    );
    rearWheelRim.rotation.y = Math.PI / 2;
    rearWheelRim.position.set(0, 0.42 * s, 1.1 * s);
    cyclistGroup.add(rearWheelRim);

    const rearTire = new THREE.Mesh(
        new THREE.TorusGeometry(0.42 * s, 0.04 * s, 8, 32),
        tireMaterial
    );
    rearTire.rotation.y = Math.PI / 2;
    rearTire.position.set(0, 0.42 * s, 1.1 * s);
    cyclistGroup.add(rearTire);

    // Spokes (simplified)
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const spoke1 = new THREE.Mesh(
            new THREE.CylinderGeometry(0.005 * s, 0.005 * s, 0.4 * s, 4),
            new THREE.MeshBasicMaterial({ color: 0xaaaaaa })
        );
        spoke1.rotation.z = angle;
        spoke1.position.set(0, 0.42 * s, -0.7 * s);
        cyclistGroup.add(spoke1);

        const spoke2 = new THREE.Mesh(
            new THREE.CylinderGeometry(0.005 * s, 0.005 * s, 0.4 * s, 4),
            new THREE.MeshBasicMaterial({ color: 0xaaaaaa })
        );
        spoke2.rotation.z = angle;
        spoke2.position.set(0, 0.42 * s, 1.1 * s);
        cyclistGroup.add(spoke2);
    }

    // Handlebars
    const handlebar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.6 * s, 8),
        frameMaterial
    );
    handlebar.rotation.z = Math.PI / 2;
    handlebar.position.set(0, 1.2 * s, -0.45 * s);
    cyclistGroup.add(handlebar);

    // Drop bars
    const dropBar = new THREE.Mesh(
        new THREE.TorusGeometry(0.12 * s, 0.015 * s, 8, 16, Math.PI),
        frameMaterial
    );
    dropBar.rotation.x = Math.PI / 2;
    dropBar.rotation.z = Math.PI;
    dropBar.position.set(0, 1.1 * s, -0.45 * s);
    cyclistGroup.add(dropBar);

    // Saddle
    const saddle = new THREE.Mesh(
        new THREE.BoxGeometry(0.12 * s, 0.05 * s, 0.35 * s),
        new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    saddle.position.set(0, 1.25 * s, 0.7 * s);
    cyclistGroup.add(saddle);

    // Pedals and cranks
    const crankMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const leftCrank = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.25 * s, 8),
        crankMaterial
    );
    leftCrank.rotation.z = Math.PI / 2;
    leftCrank.position.set(-0.12 * s, 0.35 * s, 0.2 * s);
    cyclistGroup.add(leftCrank);

    const rightCrank = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.25 * s, 8),
        crankMaterial
    );
    rightCrank.rotation.z = Math.PI / 2;
    rightCrank.position.set(0.12 * s, 0.35 * s, 0.2 * s);
    cyclistGroup.add(rightCrank);

    // === RIDER ===

    const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xf5d0c0 });
    const jerseyMaterial = new THREE.MeshLambertMaterial({ color: jerseyColor });
    const shortsMaterial = new THREE.MeshLambertMaterial({ color: 0x111111 });

    // Torso (leaning forward in racing position)
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.45 * s, 0.6 * s, 0.25 * s),
        jerseyMaterial
    );
    torso.position.set(0, 1.5 * s, 0.2 * s);
    torso.rotation.x = 0.6; // Leaning forward
    cyclistGroup.add(torso);

    // Jersey back pocket detail
    const pocket = new THREE.Mesh(
        new THREE.BoxGeometry(0.35 * s, 0.15 * s, 0.03 * s),
        new THREE.MeshLambertMaterial({ color: 0x000000 })
    );
    pocket.position.set(0, 1.35 * s, 0.42 * s);
    pocket.rotation.x = 0.6;
    cyclistGroup.add(pocket);

    // Head
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.14 * s, 16, 16),
        skinMaterial
    );
    head.position.set(0, 1.85 * s, -0.15 * s);
    cyclistGroup.add(head);

    // Helmet
    const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.17 * s, 16, 16),
        jerseyMaterial
    );
    helmet.scale.set(1, 0.8, 1.3);
    helmet.position.set(0, 1.92 * s, -0.12 * s);
    cyclistGroup.add(helmet);

    // Helmet vents
    for (let i = 0; i < 3; i++) {
        const vent = new THREE.Mesh(
            new THREE.BoxGeometry(0.02 * s, 0.08 * s, 0.02 * s),
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        vent.position.set((i - 1) * 0.06 * s, 2.0 * s, -0.15 * s);
        cyclistGroup.add(vent);
    }

    // Sunglasses
    const glasses = new THREE.Mesh(
        new THREE.BoxGeometry(0.2 * s, 0.04 * s, 0.02 * s),
        new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    glasses.position.set(0, 1.87 * s, -0.28 * s);
    cyclistGroup.add(glasses);

    // Arms
    const armMaterial = jerseyMaterial;

    // Upper arms
    const leftUpperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * s, 0.05 * s, 0.35 * s, 8),
        armMaterial
    );
    leftUpperArm.position.set(-0.25 * s, 1.55 * s, -0.05 * s);
    leftUpperArm.rotation.z = 0.3;
    leftUpperArm.rotation.x = 0.5;
    cyclistGroup.add(leftUpperArm);

    const rightUpperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * s, 0.05 * s, 0.35 * s, 8),
        armMaterial
    );
    rightUpperArm.position.set(0.25 * s, 1.55 * s, -0.05 * s);
    rightUpperArm.rotation.z = -0.3;
    rightUpperArm.rotation.x = 0.5;
    cyclistGroup.add(rightUpperArm);

    // Forearms (skin)
    const leftForearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045 * s, 0.04 * s, 0.3 * s, 8),
        skinMaterial
    );
    leftForearm.position.set(-0.32 * s, 1.3 * s, -0.25 * s);
    leftForearm.rotation.z = 0.2;
    leftForearm.rotation.x = 0.8;
    cyclistGroup.add(leftForearm);

    const rightForearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045 * s, 0.04 * s, 0.3 * s, 8),
        skinMaterial
    );
    rightForearm.position.set(0.32 * s, 1.3 * s, -0.25 * s);
    rightForearm.rotation.z = -0.2;
    rightForearm.rotation.x = 0.8;
    cyclistGroup.add(rightForearm);

    // Gloves/Hands
    const leftHand = new THREE.Mesh(
        new THREE.SphereGeometry(0.04 * s, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    leftHand.position.set(-0.3 * s, 1.15 * s, -0.4 * s);
    cyclistGroup.add(leftHand);

    const rightHand = new THREE.Mesh(
        new THREE.SphereGeometry(0.04 * s, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    rightHand.position.set(0.3 * s, 1.15 * s, -0.4 * s);
    cyclistGroup.add(rightHand);

    // Thighs
    const leftThigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1 * s, 0.08 * s, 0.45 * s, 8),
        shortsMaterial
    );
    leftThigh.position.set(-0.12 * s, 1.0 * s, 0.45 * s);
    leftThigh.rotation.x = 0.8;
    leftThigh.rotation.z = 0.1;
    cyclistGroup.add(leftThigh);

    const rightThigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1 * s, 0.08 * s, 0.45 * s, 8),
        shortsMaterial
    );
    rightThigh.position.set(0.12 * s, 1.0 * s, 0.45 * s);
    rightThigh.rotation.x = -0.3;
    rightThigh.rotation.z = -0.1;
    cyclistGroup.add(rightThigh);

    // Calves (skin with leg warmers effect)
    const leftCalf = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * s, 0.05 * s, 0.4 * s, 8),
        skinMaterial
    );
    leftCalf.position.set(-0.15 * s, 0.55 * s, 0.25 * s);
    leftCalf.rotation.x = 0.3;
    cyclistGroup.add(leftCalf);

    const rightCalf = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * s, 0.05 * s, 0.4 * s, 8),
        skinMaterial
    );
    rightCalf.position.set(0.15 * s, 0.55 * s, 0.15 * s);
    rightCalf.rotation.x = -0.2;
    cyclistGroup.add(rightCalf);

    // Cycling shoes
    const shoeMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const leftShoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.08 * s, 0.05 * s, 0.18 * s),
        shoeMaterial
    );
    leftShoe.position.set(-0.18 * s, 0.35 * s, 0.15 * s);
    cyclistGroup.add(leftShoe);

    const rightShoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.08 * s, 0.05 * s, 0.18 * s),
        shoeMaterial
    );
    rightShoe.position.set(0.18 * s, 0.35 * s, 0.25 * s);
    cyclistGroup.add(rightShoe);

    // Number plate on back
    const numberPlate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.2 * s, 0.15 * s),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    numberPlate.position.set(0, 1.55 * s, 0.45 * s);
    numberPlate.rotation.x = 0.6;
    cyclistGroup.add(numberPlate);

    cyclistGroup.castShadow = true;
    return cyclistGroup;
}

function createCyclist() {
    cyclist = createCyclistModel(0xff6600); // Enervit orange
    cyclist.position.set(0, 0, 0);
    scene.add(cyclist);
}

function createCompetitors() {
    for (let i = 0; i < COMPETITOR_COUNT; i++) {
        const competitor = createCyclistModel(COMPETITOR_COLORS[i], 0.95);

        // Start positions - staggered
        const startX = (Math.random() - 0.5) * 8;
        const startZ = -5 - i * 3 - Math.random() * 5;

        competitor.position.set(startX, 0, startZ);
        scene.add(competitor);

        competitors.push({
            mesh: competitor,
            name: COMPETITOR_NAMES[i],
            speed: 30 + Math.random() * 15,
            targetSpeed: 35 + Math.random() * 10,
            energy: 100,
            distance: Math.abs(startZ),
            x: startX,
            z: startZ,
            laneChangeTimer: 0,
            targetX: startX
        });
    }
}

function createEnvironment() {
    // Dense forest along the route (Jizerské hory style)
    for (let z = -50; z > -2500; z -= 15) {
        // Left side trees
        for (let x = -20; x > -80; x -= 15 + Math.random() * 10) {
            if (Math.random() > 0.3) {
                createTree(x + Math.random() * 5, z + Math.random() * 10);
            }
        }
        // Right side trees
        for (let x = 20; x < 80; x += 15 + Math.random() * 10) {
            if (Math.random() > 0.3) {
                createTree(x + Math.random() * 5, z + Math.random() * 10);
            }
        }
    }

    // Liberec start area - buildings
    createBuilding(-25, 20, 15, 8, 12, 0x8b7355);
    createBuilding(30, 25, 12, 10, 15, 0x9c8b7a);
    createBuilding(-35, 15, 20, 12, 8, 0x7a6b5a);

    // Start/Finish arch
    createStartArch(0, 30);

    // Road signs and km markers
    createKmMarker(-8, -200, '5');
    createKmMarker(8, -500, '10');
    createKmMarker(-8, -800, '15');
    createKmMarker(8, -1100, '20');
    createKmMarker(-8, -1400, '25');
    createKmMarker(8, -1700, '30');
    createKmMarker(-8, -2000, '35');

    // Villages along the route
    createVillage(-40, -400, 'Raspenava');
    createVillage(45, -1000, 'Kryštofovo Údolí');

    // Spectators along the route
    createSpectators();
}

function createTree(x, z) {
    const tree = new THREE.Group();
    const treeType = Math.random();

    if (treeType < 0.6) {
        // Spruce (smrk) - common in Jizerské hory
        const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.4, 5, 8);
        const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3728 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = 2.5;
        trunk.castShadow = true;
        tree.add(trunk);

        // Multiple layers of foliage
        const foliageMaterial = new THREE.MeshLambertMaterial({ color: 0x1a4d1a });
        for (let i = 0; i < 4; i++) {
            const size = 3.5 - i * 0.6;
            const foliage = new THREE.Mesh(
                new THREE.ConeGeometry(size, 3, 8),
                foliageMaterial
            );
            foliage.position.y = 4 + i * 2;
            foliage.castShadow = true;
            tree.add(foliage);
        }
    } else if (treeType < 0.85) {
        // Deciduous tree (buk/dub)
        const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 4, 8);
        const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x5c4033 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = 2;
        trunk.castShadow = true;
        tree.add(trunk);

        const foliageGeometry = new THREE.SphereGeometry(3, 8, 8);
        const foliageMaterial = new THREE.MeshLambertMaterial({ color: 0x2d5a2d });
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.y = 6;
        foliage.castShadow = true;
        tree.add(foliage);
    } else {
        // Birch (bříza)
        const trunkGeometry = new THREE.CylinderGeometry(0.15, 0.2, 6, 8);
        const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = 3;
        trunk.castShadow = true;
        tree.add(trunk);

        // Birch bark marks
        for (let i = 0; i < 5; i++) {
            const mark = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 0.05, 0.02),
                new THREE.MeshBasicMaterial({ color: 0x333333 })
            );
            mark.position.set(0.15, 1 + i * 1, 0);
            tree.add(mark);
        }

        const foliageGeometry = new THREE.SphereGeometry(2, 8, 8);
        const foliageMaterial = new THREE.MeshLambertMaterial({ color: 0x4a7c4a });
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.y = 7;
        foliage.castShadow = true;
        tree.add(foliage);
    }

    tree.position.set(x, 0, z);
    scene.add(tree);
    trees.push(tree);
}

function createBuilding(x, z, width, depth, height, color) {
    const building = new THREE.Group();

    // Main structure
    const bodyGeometry = new THREE.BoxGeometry(width, height, depth);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: color });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = height / 2;
    body.castShadow = true;
    building.add(body);

    // Roof
    const roofGeometry = new THREE.ConeGeometry(Math.max(width, depth) * 0.7, 4, 4);
    const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x8b0000 });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = height + 2;
    roof.rotation.y = Math.PI / 4;
    building.add(roof);

    // Windows
    const windowMaterial = new THREE.MeshBasicMaterial({ color: 0x87ceeb });
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
            const win = new THREE.Mesh(
                new THREE.PlaneGeometry(1.5, 2),
                windowMaterial
            );
            win.position.set(
                (i - 0.5) * width * 0.4,
                height * 0.4 + j * height * 0.3,
                depth / 2 + 0.1
            );
            building.add(win);
        }
    }

    building.position.set(x, 0, z);
    scene.add(building);
    buildings.push(building);
}

function createStartArch(x, z) {
    const arch = new THREE.Group();

    // Left pillar
    const pillarGeometry = new THREE.BoxGeometry(1, 8, 1);
    const pillarMaterial = new THREE.MeshLambertMaterial({ color: 0xff6600 });

    const leftPillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
    leftPillar.position.set(-8, 4, 0);
    arch.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
    rightPillar.position.set(8, 4, 0);
    arch.add(rightPillar);

    // Top banner
    const bannerGeometry = new THREE.BoxGeometry(18, 2, 0.5);
    const bannerMaterial = new THREE.MeshLambertMaterial({ color: 0xff6600 });
    const banner = new THREE.Mesh(bannerGeometry, bannerMaterial);
    banner.position.set(0, 8, 0);
    arch.add(banner);

    // ROAD CLASSICS text (simplified as white bar)
    const textBar = new THREE.Mesh(
        new THREE.BoxGeometry(14, 1.2, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    textBar.position.set(0, 8, 0.3);
    arch.add(textBar);

    arch.position.set(x, 0, z);
    scene.add(arch);
}

function createKmMarker(x, z, km) {
    const marker = new THREE.Group();

    // Post
    const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 2, 8),
        new THREE.MeshLambertMaterial({ color: 0x666666 })
    );
    post.position.y = 1;
    marker.add(post);

    // Sign
    const sign = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.8, 0.1),
        new THREE.MeshLambertMaterial({ color: 0x006600 })
    );
    sign.position.y = 2.2;
    marker.add(sign);

    // White background for km number
    const numBg = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.5, 0.02),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    numBg.position.set(0, 2.2, 0.06);
    marker.add(numBg);

    marker.position.set(x, 0, z);
    scene.add(marker);
}

function createVillage(x, z, name) {
    // Small cluster of buildings
    createBuilding(x, z, 8, 6, 7, 0x9c8b7a);
    createBuilding(x - 15, z + 10, 10, 8, 9, 0x8b7355);
    createBuilding(x + 12, z - 5, 6, 5, 6, 0xa08070);

    // Church
    const church = new THREE.Group();
    const churchBody = new THREE.Mesh(
        new THREE.BoxGeometry(6, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0xdddddd })
    );
    churchBody.position.y = 5;
    church.add(churchBody);

    const steeple = new THREE.Mesh(
        new THREE.ConeGeometry(2, 8, 4),
        new THREE.MeshLambertMaterial({ color: 0x4a4a4a })
    );
    steeple.position.y = 14;
    church.add(steeple);

    church.position.set(x + 20, 0, z + 15);
    scene.add(church);
}

function createSpectators() {
    const spectatorPositions = [
        { x: -10, z: 25 },
        { x: 10, z: 28 },
        { x: -9, z: -100 },
        { x: 11, z: -150 },
        { x: -10, z: -300 },
        { x: 9, z: -450 },
        { x: -11, z: -600 },
        { x: 10, z: -800 }
    ];

    spectatorPositions.forEach(pos => {
        for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
            createSpectator(
                pos.x + (Math.random() - 0.5) * 4,
                pos.z + (Math.random() - 0.5) * 3
            );
        }
    });
}

function createSpectator(x, z) {
    const spectator = new THREE.Group();

    // Body
    const colors = [0xff0000, 0x0000ff, 0x00ff00, 0xffff00, 0xff6600, 0x9900ff];
    const bodyColor = colors[Math.floor(Math.random() * colors.length)];

    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.3, 1, 8),
        new THREE.MeshLambertMaterial({ color: bodyColor })
    );
    body.position.y = 0.7;
    spectator.add(body);

    // Head
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0xf5d0c0 })
    );
    head.position.y = 1.4;
    spectator.add(head);

    // Arms up (cheering)
    if (Math.random() > 0.5) {
        const arm = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8),
            new THREE.MeshLambertMaterial({ color: bodyColor })
        );
        arm.position.set(0.2, 1.3, 0);
        arm.rotation.z = -0.5;
        spectator.add(arm);
    }

    spectator.position.set(x, 0, z);
    scene.add(spectator);
}

function createCheckpoints() {
    // Checkpoint arches at key locations
    ROUTE_CHECKPOINTS.forEach((checkpoint, index) => {
        if (index > 0 && index < ROUTE_CHECKPOINTS.length - 1) {
            const z = -(checkpoint.distance / gameState.totalDistance) * 2000;
            createCheckpointArch(0, z, checkpoint.name);
        }
    });
}

function createCheckpointArch(x, z, name) {
    const arch = new THREE.Group();

    // Inflatable arch style
    const archGeometry = new THREE.TorusGeometry(7, 1, 8, 16, Math.PI);
    const archMaterial = new THREE.MeshLambertMaterial({ color: 0xff6600 });
    const archMesh = new THREE.Mesh(archGeometry, archMaterial);
    archMesh.rotation.x = Math.PI / 2;
    archMesh.rotation.z = Math.PI;
    archMesh.position.y = 7;
    arch.add(archMesh);

    arch.position.set(x, 0, z);
    scene.add(arch);
}

function spawnPickups() {
    pickups.forEach(p => scene.remove(p.mesh));
    pickups = [];

    // More pickups spread across the route
    const pickupPositions = [
        -100, -250, -400, -550, -700, -850, -1000,
        -1150, -1300, -1500, -1700, -1900
    ];

    pickupPositions.forEach((z, index) => {
        const product = enervitProducts[index % enervitProducts.length];
        createPickup(
            (Math.random() - 0.5) * 6,
            z,
            product
        );
    });
}

function createPickup(x, z, product) {
    const pickupGroup = new THREE.Group();

    // Enervit product box style
    const boxGeometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const boxMaterial = new THREE.MeshLambertMaterial({
        color: product.color,
        transparent: true,
        opacity: 0.9
    });
    const box = new THREE.Mesh(boxGeometry, boxMaterial);
    pickupGroup.add(box);

    // Glowing outline
    const outlineGeometry = new THREE.BoxGeometry(1.7, 1.7, 1.7);
    const outlineMaterial = new THREE.MeshBasicMaterial({
        color: product.color,
        transparent: true,
        opacity: 0.3,
        side: THREE.BackSide
    });
    const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
    pickupGroup.add(outline);

    // Enervit logo (E letter)
    const eLetter = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.8, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    eLetter.position.z = 0.76;
    pickupGroup.add(eLetter);

    pickupGroup.position.set(x, 2, z);
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
    speedometer.style.display = 'flex';
    routeProgress.style.display = 'block';
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
    gameState.elevation = 370;
    gameState.time = 0;
    gameState.position = { x: 0, z: 0, y: 0 };
    gameState.rotation = 0;
    gameState.isPlaying = true;
    gameState.isPaused = false;
    gameState.currentCheckpoint = 0;
    gameState.playerRank = 1;

    // Reset cyclist
    cyclist.position.set(0, 0, 0);
    cyclist.rotation.y = 0;

    // Reset competitors
    competitors.forEach((comp, i) => {
        comp.x = (Math.random() - 0.5) * 8;
        comp.z = -5 - i * 3 - Math.random() * 5;
        comp.distance = Math.abs(comp.z);
        comp.speed = 30 + Math.random() * 15;
        comp.energy = 100;
        comp.mesh.position.set(comp.x, 0, comp.z);
    });

    spawnPickups();

    hud.style.display = 'flex';
    energyContainer.style.display = 'block';
    speedometer.style.display = 'flex';
    routeProgress.style.display = 'block';
    clock.start();
}

function showProductSelection(pickup) {
    gameState.isPaused = true;
    gameState.pendingProduct = pickup;

    let situation = 'low_energy';
    let situationMessage = 'Máš málo energie!';
    if (gameState.energy < 30) {
        situation = 'low_energy';
        situationMessage = 'Máš málo energie! Potřebuješ rychle doplnit.';
    } else if (gameState.distance > gameState.totalDistance * 0.6) {
        situation = 'uphill';
        situationMessage = 'Blíží se stoupání na Ještěd! Připrav se.';
    } else if (gameState.speed < 25) {
        situation = 'fatigue';
        situationMessage = 'Cítíš únavu a ztrátu solí.';
    } else {
        situation = 'recovery';
        situationMessage = 'Dobrá příležitost pro doplnění zásob.';
    }

    situationText.textContent = situationMessage;
    productOptions.innerHTML = '';

    const correctProduct = enervitProducts.find(p => p.situation === situation) || enervitProducts[0];
    let options = [correctProduct];

    const otherProducts = enervitProducts.filter(p => p !== correctProduct);
    while (options.length < 3 && otherProducts.length > 0) {
        const idx = Math.floor(Math.random() * otherProducts.length);
        options.push(otherProducts.splice(idx, 1)[0]);
    }

    options = options.sort(() => Math.random() - 0.5);

    options.forEach(product => {
        const btn = document.createElement('div');
        btn.className = 'product-btn';
        btn.innerHTML = `
            <div style="width:80px;height:80px;background:${new THREE.Color(product.color).getStyle()};border-radius:10px;margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:bold;color:white;">E</div>
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
        applyProductEffect(product, 1.0);
        showPickupNotification(`${product.name} - SPRÁVNÁ VOLBA!`, '#00ff00');
    } else {
        applyProductEffect(product, 0.3);
        showPickupNotification(`${product.name} - Špatná volba...`, '#ff0000');
    }

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
                gameState.maxSpeed = 65;
            }, 12000);
            break;
        case 'stamina':
            gameState.energyDrain *= (1 - 0.5 * multiplier);
            setTimeout(() => {
                gameState.energyDrain = 0.015;
            }, 20000);
            break;
        case 'recovery':
            const recoveryInterval = setInterval(() => {
                if (gameState.energy < 100) {
                    gameState.energy += 3 * multiplier;
                } else {
                    clearInterval(recoveryInterval);
                }
            }, 500);
            setTimeout(() => clearInterval(recoveryInterval), 12000);
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
    speedometer.style.display = 'none';
    routeProgress.style.display = 'none';

    const minutes = Math.floor(gameState.time / 60);
    const seconds = Math.floor(gameState.time % 60);
    finalTimeValue.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    finalRankDisplay.textContent = `${gameState.playerRank}.`;

    finishScreen.style.display = 'flex';
}

function updateCompetitors(delta) {
    competitors.forEach((comp, index) => {
        // AI behavior
        comp.laneChangeTimer -= delta;
        if (comp.laneChangeTimer <= 0) {
            comp.targetX = (Math.random() - 0.5) * 8;
            comp.laneChangeTimer = 3 + Math.random() * 5;
        }

        // Move towards target lane
        const laneSpeed = 2 * delta;
        if (Math.abs(comp.x - comp.targetX) > 0.1) {
            comp.x += Math.sign(comp.targetX - comp.x) * laneSpeed;
        }

        // Vary speed (simulating drafting, attacks, fatigue)
        const speedVariation = Math.sin(Date.now() / 1000 + index) * 5;
        const targetSpeed = comp.targetSpeed + speedVariation;

        // Gradually adjust speed
        if (comp.speed < targetSpeed) {
            comp.speed += 0.1;
        } else {
            comp.speed -= 0.05;
        }

        // Energy drain for AI
        comp.energy -= 0.01 * (comp.speed / 40);
        comp.energy = Math.max(20, comp.energy); // AI doesn't run out completely

        // Move forward
        const moveSpeed = comp.speed * delta * 1.5;
        comp.z -= moveSpeed;
        comp.distance = Math.abs(comp.z);

        // Update mesh position
        comp.mesh.position.x = comp.x;
        comp.mesh.position.z = comp.z;

        // Pedaling animation
        const pedalAngle = Date.now() / 50 * (comp.speed / 30);
        // Animate legs based on speed
        comp.mesh.children.forEach((child, i) => {
            if (child.material && child.material.color) {
                // Simple bobbing for rider
                if (i > 20) { // Rider parts
                    child.position.y += Math.sin(pedalAngle) * 0.002;
                }
            }
        });
    });

    // Calculate player rank
    let rank = 1;
    competitors.forEach(comp => {
        if (comp.distance > gameState.distance) {
            rank++;
        }
    });
    gameState.playerRank = rank;
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

    gameState.time += delta;

    // Calculate current elevation (simulated climb to Ještěd)
    const progress = gameState.distance / gameState.totalDistance;
    const elevationProfile = [
        { dist: 0, elev: 370 },
        { dist: 0.3, elev: 450 },
        { dist: 0.65, elev: 520 },
        { dist: 0.85, elev: 750 },
        { dist: 1.0, elev: 1012 }
    ];

    // Interpolate elevation
    let currentElev = 370;
    for (let i = 0; i < elevationProfile.length - 1; i++) {
        if (progress >= elevationProfile[i].dist && progress < elevationProfile[i + 1].dist) {
            const t = (progress - elevationProfile[i].dist) / (elevationProfile[i + 1].dist - elevationProfile[i].dist);
            currentElev = elevationProfile[i].elev + t * (elevationProfile[i + 1].elev - elevationProfile[i].elev);
            break;
        }
    }
    gameState.elevation = currentElev;

    // Gradient affects speed (steeper = harder)
    const gradient = (currentElev - 370) / (1012 - 370);
    const gradientPenalty = 1 - gradient * 0.3;

    // Energy drain based on speed and gradient
    const energyDrainRate = gameState.energyDrain * (1 + gameState.speed / 80 + gradient * 2);
    gameState.energy -= energyDrainRate;
    gameState.energy = Math.max(0, gameState.energy);

    // Speed affected by energy and gradient
    const energyMultiplier = 0.4 + (gameState.energy / 100) * 0.6;
    const effectiveMaxSpeed = gameState.maxSpeed * energyMultiplier * gradientPenalty;

    // Acceleration/Deceleration
    if (keys.up && gameState.energy > 0) {
        gameState.speed += gameState.acceleration * energyMultiplier;
    } else if (keys.down) {
        gameState.speed -= gameState.brakeForce;
    } else {
        gameState.speed -= gameState.deceleration * (1 + gradient);
    }

    gameState.speed = Math.max(0, Math.min(effectiveMaxSpeed, gameState.speed));

    // Turning
    if (gameState.speed > 0) {
        if (keys.left) {
            gameState.position.x -= gameState.turnSpeed * gameState.speed * delta * 3;
            cyclist.rotation.z = 0.15;
        } else if (keys.right) {
            gameState.position.x += gameState.turnSpeed * gameState.speed * delta * 3;
            cyclist.rotation.z = -0.15;
        } else {
            cyclist.rotation.z *= 0.9;
        }
    }

    // Keep on road
    gameState.position.x = Math.max(-5, Math.min(5, gameState.position.x));

    // Forward movement
    const moveSpeed = gameState.speed * delta * 1.5;
    gameState.position.z -= moveSpeed;

    // Update distance (scaled to match 49km route)
    gameState.distance = Math.abs(gameState.position.z) * (gameState.totalDistance / 2000);

    // Check finish
    if (gameState.distance >= gameState.totalDistance) {
        finishGame();
        return;
    }

    // Update competitors
    updateCompetitors(delta);

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
            pickup.mesh.rotation.y += delta * 1.5;
            pickup.mesh.position.y = 2 + Math.sin(Date.now() / 400) * 0.3;
        }
    });

    // Update cyclist position
    cyclist.position.x = gameState.position.x;
    cyclist.position.z = gameState.position.z;

    // Pedaling animation
    const pedalSpeed = gameState.speed / 15;
    const pedalAngle = Date.now() / 80 * pedalSpeed;
    cyclist.children.forEach((child, index) => {
        // Bobbing motion for upper body when pedaling
        if (index > 15 && gameState.speed > 5) {
            child.position.y += Math.sin(pedalAngle * 2) * 0.003;
        }
    });

    // Camera follow (closer, more dramatic angle)
    const cameraOffset = new THREE.Vector3(0, 6, 14);
    camera.position.lerp(
        new THREE.Vector3(
            cyclist.position.x * 0.5 + cameraOffset.x,
            cyclist.position.y + cameraOffset.y,
            cyclist.position.z + cameraOffset.z
        ),
        0.08
    );
    camera.lookAt(cyclist.position.x, cyclist.position.y + 2, cyclist.position.z - 5);

    // Update HUD
    speedDisplay.textContent = Math.round(gameState.speed);
    distanceDisplay.textContent = (gameState.distance / 1000).toFixed(1);
    elevationDisplay.textContent = Math.round(gameState.elevation);
    rankDisplay.textContent = gameState.playerRank;

    const minutes = Math.floor(gameState.time / 60);
    const seconds = Math.floor(gameState.time % 60);
    timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    energyBar.style.width = `${gameState.energy}%`;

    // Update route progress marker
    const progress = gameState.distance / gameState.totalDistance;
    playerMarker.style.bottom = `${5 + progress * 90}%`;

    // Color energy bar based on level
    if (gameState.energy < 20) {
        energyBar.style.background = 'linear-gradient(90deg, #ff0000, #ff3300)';
    } else if (gameState.energy < 50) {
        energyBar.style.background = 'linear-gradient(90deg, #ff6600, #ffcc00)';
    } else {
        energyBar.style.background = 'linear-gradient(90deg, #00cc00, #00ff00)';
    }

    // Move terrain with player
    terrain.position.z = gameState.position.z - 800;
    road.position.z = gameState.position.z - 1400;
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    updateGame(delta);

    renderer.render(scene, camera);
}
