import * as THREE from 'three';

// ============================================
// ROAD CLASSICS - CESTA NA JEŠTĚD
// Realistic cycling game with actual climbing to Ještěd
// Route: Liberec -> Raspenava -> Kryštofovo Údolí -> Ještěd
// ============================================

// Road path - winding road with elevation changes
// Each point: { x, z, elevation }
const ROAD_PATH = [];
const ROAD_LENGTH = 2000; // Game units
const TOTAL_DISTANCE = 49000; // Real 49km

// Generate winding road path
function generateRoadPath() {
    for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        const z = -t * ROAD_LENGTH;

        // Winding road - serpentines especially near the end
        let x = 0;
        x += Math.sin(t * Math.PI * 4) * 15;  // Gentle curves
        x += Math.sin(t * Math.PI * 8) * 8;   // Smaller wiggles

        // Tighter serpentines at the end (climbing Ještěd)
        if (t > 0.7) {
            const climbT = (t - 0.7) / 0.3;
            x += Math.sin(climbT * Math.PI * 6) * 25 * climbT;
        }

        // Elevation profile - realistic climb
        let elevation = 0;
        if (t < 0.3) {
            // Liberec to Raspenava - gentle
            elevation = t * 80 / 0.3;
        } else if (t < 0.65) {
            // Raspenava to Kryštofovo - rolling hills
            elevation = 80 + (t - 0.3) * 70 / 0.35 + Math.sin(t * Math.PI * 6) * 20;
        } else {
            // Kryštofovo to Ještěd - steep climb!
            const climbT = (t - 0.65) / 0.35;
            elevation = 150 + climbT * 500 * (1 + climbT); // Exponential steepness
        }

        ROAD_PATH.push({ x, z, elevation: elevation / 10 }); // Scale down for game
    }
}
generateRoadPath();

// Get road position and elevation at progress (0-1)
function getRoadData(progress) {
    const index = Math.min(Math.floor(progress * (ROAD_PATH.length - 1)), ROAD_PATH.length - 2);
    const t = (progress * (ROAD_PATH.length - 1)) - index;

    const p1 = ROAD_PATH[index];
    const p2 = ROAD_PATH[index + 1];

    return {
        x: p1.x + (p2.x - p1.x) * t,
        z: p1.z + (p2.z - p1.z) * t,
        elevation: p1.elevation + (p2.elevation - p1.elevation) * t,
        // Calculate slope for cyclist lean
        slope: (p2.elevation - p1.elevation) / (Math.abs(p2.z - p1.z) + 0.01),
        // Road direction for turning
        direction: Math.atan2(p2.x - p1.x, -(p2.z - p1.z))
    };
}

// Game State
const gameState = {
    isPlaying: false,
    speed: 0,
    maxSpeed: 65,
    acceleration: 0.8,
    deceleration: 0.08,
    brakeForce: 0.4,
    energy: 100,
    energyDrain: 0.008,
    distance: 0,
    totalDistance: TOTAL_DISTANCE,
    elevation: 370,
    time: 0,
    progress: 0, // 0 to 1 along the road
    laneOffset: 0, // -1 to 1, position on road
    isPaused: false,
    pendingProduct: null,
    currentCheckpoint: 0,
    playerRank: 1,
    currentSlope: 0
};

// AI Competitors
const competitors = [];
const COMPETITOR_COUNT = 8;
const COMPETITOR_COLORS = [
    0x0066ff, 0x00cc00, 0xff0066, 0xffcc00,
    0x9900ff, 0x00cccc, 0xff9900, 0xcc0000
];
const COMPETITOR_NAMES = [
    'Petr Vacek', 'Jan Novák', 'Martin Král', 'Tomáš Horák',
    'David Svoboda', 'Jakub Černý', 'Filip Dvořák', 'Ondřej Procházka'
];

// Enervit Products
const enervitProducts = [
    { name: 'Enervit C2:1 Gel', effect: 'energy', value: 35, color: 0xff6600, description: '+35 Energie', situation: 'low_energy' },
    { name: 'Enervit Isocarb 2:1', effect: 'speed', value: 8, color: 0x00aaff, description: '+8 km/h Max', situation: 'uphill' },
    { name: 'Enervit Salt Caps', effect: 'stamina', value: 15, color: 0xffffff, description: '-50% Únavy', situation: 'fatigue' },
    { name: 'Enervit Power Sport', effect: 'recovery', value: 25, color: 0x8b4513, description: '+25 Energie postupně', situation: 'recovery' }
];

// Three.js setup
let scene, camera, renderer;
let cyclist, roadMesh, terrainMeshes = [];
let pickups = [];
let trees = [];
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
const keys = { up: false, down: false, left: false, right: false };

// Initialize
init();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 100, 600);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game-container').appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffcc, 1.2);
    sunLight.position.set(100, 200, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x228b22, 0.4);
    scene.add(hemiLight);

    // Create game elements
    createTerrain();
    createRoad();
    createCyclist();
    createCompetitors();
    createEnvironment();
    createJestedMountain();
    spawnPickups();

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    startBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', restartGame);

    animate();
}

function createTerrain() {
    // Create terrain that follows road elevation
    const terrainWidth = 400;
    const terrainSegments = 100;

    // Left side terrain
    for (let side = -1; side <= 1; side += 2) {
        const geometry = new THREE.PlaneGeometry(terrainWidth / 2, ROAD_LENGTH + 200, terrainSegments, terrainSegments);
        const positions = geometry.attributes.position;

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i); // This is Z in world space after rotation

            const progress = Math.max(0, Math.min(1, (-y + 100) / ROAD_LENGTH));
            const roadData = getRoadData(progress);

            // Base elevation from road
            let elevation = roadData.elevation;

            // Add terrain variation
            const distFromRoad = Math.abs(x * side - roadData.x);
            elevation += Math.sin(x * 0.05 + y * 0.02) * 5;
            elevation += Math.cos(x * 0.03 - y * 0.01) * 3;

            // Hills rise away from road
            if (distFromRoad > 20) {
                elevation += (distFromRoad - 20) * 0.3;
            }

            positions.setZ(i, elevation);
        }

        geometry.computeVertexNormals();

        const material = new THREE.MeshLambertMaterial({
            color: 0x3d8c40,
            side: THREE.DoubleSide
        });

        const terrainMesh = new THREE.Mesh(geometry, material);
        terrainMesh.rotation.x = -Math.PI / 2;
        terrainMesh.position.x = side * terrainWidth / 4;
        terrainMesh.position.z = -ROAD_LENGTH / 2 + 100;
        terrainMesh.receiveShadow = true;
        scene.add(terrainMesh);
        terrainMeshes.push(terrainMesh);
    }
}

function createRoad() {
    // Create road as a ribbon following the path
    const roadWidth = 10;
    const points = [];

    for (let i = 0; i < ROAD_PATH.length; i++) {
        const p = ROAD_PATH[i];
        points.push(new THREE.Vector3(p.x, p.elevation + 0.1, p.z));
    }

    // Create road geometry
    const shape = new THREE.Shape();
    shape.moveTo(-roadWidth / 2, 0);
    shape.lineTo(roadWidth / 2, 0);

    const extrudeSettings = {
        steps: ROAD_PATH.length - 1,
        extrudePath: new THREE.CatmullRomCurve3(points)
    };

    // Simpler approach: Create road segments
    const roadMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const yellowLineMaterial = new THREE.MeshBasicMaterial({ color: 0xffcc00 });

    for (let i = 0; i < ROAD_PATH.length - 1; i++) {
        const p1 = ROAD_PATH[i];
        const p2 = ROAD_PATH[i + 1];

        const length = Math.sqrt(
            Math.pow(p2.x - p1.x, 2) +
            Math.pow(p2.z - p1.z, 2)
        );

        const midX = (p1.x + p2.x) / 2;
        const midZ = (p1.z + p2.z) / 2;
        const midY = (p1.elevation + p2.elevation) / 2;

        const angle = Math.atan2(p2.x - p1.x, -(p2.z - p1.z));
        const pitch = Math.atan2(p2.elevation - p1.elevation, length);

        // Road segment
        const segmentGeo = new THREE.PlaneGeometry(roadWidth, length + 0.5);
        const segment = new THREE.Mesh(segmentGeo, roadMaterial);
        segment.rotation.x = -Math.PI / 2;
        segment.rotation.z = -angle;
        segment.rotation.order = 'YXZ';
        segment.position.set(midX, midY + 0.05, midZ);

        // Tilt road for elevation
        const tiltAxis = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        segment.rotateOnWorldAxis(tiltAxis, pitch);

        segment.receiveShadow = true;
        scene.add(segment);
        roadSegments.push(segment);

        // Center line (dashed)
        if (i % 3 === 0) {
            const lineGeo = new THREE.PlaneGeometry(0.2, length * 0.6);
            const line = new THREE.Mesh(lineGeo, yellowLineMaterial);
            line.rotation.x = -Math.PI / 2;
            line.rotation.z = -angle;
            line.rotation.order = 'YXZ';
            line.position.set(midX, midY + 0.1, midZ);
            line.rotateOnWorldAxis(tiltAxis, pitch);
            scene.add(line);
        }
    }
}

function createCyclistModel(jerseyColor, scale = 1) {
    const group = new THREE.Group();
    const s = scale * 2.2;

    const frameMaterial = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const jerseyMaterial = new THREE.MeshLambertMaterial({ color: jerseyColor });
    const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xf5d0c0 });
    const shortsMaterial = new THREE.MeshLambertMaterial({ color: 0x111111 });

    // Bicycle frame
    const topTube = new THREE.Mesh(new THREE.CylinderGeometry(0.04*s, 0.04*s, 1.2*s, 8), frameMaterial);
    topTube.rotation.z = Math.PI/2;
    topTube.rotation.y = 0.15;
    topTube.position.set(0, 1.0*s, 0.1*s);
    group.add(topTube);

    const downTube = new THREE.Mesh(new THREE.CylinderGeometry(0.05*s, 0.05*s, 1.1*s, 8), frameMaterial);
    downTube.rotation.z = 0.5;
    downTube.position.set(0, 0.6*s, 0.3*s);
    group.add(downTube);

    const seatTube = new THREE.Mesh(new THREE.CylinderGeometry(0.04*s, 0.04*s, 0.9*s, 8), frameMaterial);
    seatTube.position.set(0, 0.65*s, 0.6*s);
    group.add(seatTube);

    // Wheels
    const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x222222 });

    const frontWheel = new THREE.Mesh(new THREE.TorusGeometry(0.38*s, 0.04*s, 8, 24), wheelMaterial);
    frontWheel.rotation.y = Math.PI/2;
    frontWheel.position.set(0, 0.38*s, -0.6*s);
    group.add(frontWheel);

    const rearWheel = new THREE.Mesh(new THREE.TorusGeometry(0.38*s, 0.04*s, 8, 24), wheelMaterial);
    rearWheel.rotation.y = Math.PI/2;
    rearWheel.position.set(0, 0.38*s, 0.95*s);
    group.add(rearWheel);

    // Handlebars
    const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.02*s, 0.02*s, 0.5*s, 8), frameMaterial);
    handlebar.rotation.z = Math.PI/2;
    handlebar.position.set(0, 1.1*s, -0.4*s);
    group.add(handlebar);

    // Saddle
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.1*s, 0.04*s, 0.3*s), new THREE.MeshLambertMaterial({color: 0x111111}));
    saddle.position.set(0, 1.15*s, 0.6*s);
    group.add(saddle);

    // Rider torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4*s, 0.55*s, 0.22*s), jerseyMaterial);
    torso.position.set(0, 1.4*s, 0.15*s);
    torso.rotation.x = 0.5;
    group.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13*s, 12, 12), skinMaterial);
    head.position.set(0, 1.7*s, -0.15*s);
    group.add(head);

    // Helmet
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15*s, 12, 12), jerseyMaterial);
    helmet.scale.set(1, 0.8, 1.2);
    helmet.position.set(0, 1.78*s, -0.12*s);
    group.add(helmet);

    // Arms
    const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.045*s, 0.04*s, 0.5*s, 8), jerseyMaterial);
    leftArm.position.set(-0.22*s, 1.35*s, -0.1*s);
    leftArm.rotation.z = 0.3;
    leftArm.rotation.x = 0.6;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.045*s, 0.04*s, 0.5*s, 8), jerseyMaterial);
    rightArm.position.set(0.22*s, 1.35*s, -0.1*s);
    rightArm.rotation.z = -0.3;
    rightArm.rotation.x = 0.6;
    group.add(rightArm);

    // Thighs
    const leftThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.09*s, 0.07*s, 0.4*s, 8), shortsMaterial);
    leftThigh.position.set(-0.1*s, 0.9*s, 0.4*s);
    leftThigh.rotation.x = 0.7;
    group.add(leftThigh);

    const rightThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.09*s, 0.07*s, 0.4*s, 8), shortsMaterial);
    rightThigh.position.set(0.1*s, 0.9*s, 0.4*s);
    rightThigh.rotation.x = -0.3;
    group.add(rightThigh);

    // Lower legs
    const leftCalf = new THREE.Mesh(new THREE.CylinderGeometry(0.055*s, 0.045*s, 0.35*s, 8), skinMaterial);
    leftCalf.position.set(-0.12*s, 0.5*s, 0.2*s);
    leftCalf.rotation.x = 0.2;
    group.add(leftCalf);

    const rightCalf = new THREE.Mesh(new THREE.CylinderGeometry(0.055*s, 0.045*s, 0.35*s, 8), skinMaterial);
    rightCalf.position.set(0.12*s, 0.5*s, 0.15*s);
    rightCalf.rotation.x = -0.2;
    group.add(rightCalf);

    // Shoes
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.07*s, 0.04*s, 0.15*s), shoeMat);
    leftShoe.position.set(-0.15*s, 0.32*s, 0.12*s);
    group.add(leftShoe);

    const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.07*s, 0.04*s, 0.15*s), shoeMat);
    rightShoe.position.set(0.15*s, 0.32*s, 0.2*s);
    group.add(rightShoe);

    group.castShadow = true;
    return group;
}

function createCyclist() {
    cyclist = createCyclistModel(0xff6600);
    scene.add(cyclist);
}

function createCompetitors() {
    for (let i = 0; i < COMPETITOR_COUNT; i++) {
        const comp = createCyclistModel(COMPETITOR_COLORS[i], 0.95);
        scene.add(comp);

        const startProgress = 0.001 + (i + 1) * 0.002;

        competitors.push({
            mesh: comp,
            name: COMPETITOR_NAMES[i],
            progress: startProgress,
            laneOffset: (Math.random() - 0.5) * 1.5,
            speed: 28 + Math.random() * 12,
            targetSpeed: 32 + Math.random() * 8,
            energy: 100
        });
    }
}

function createEnvironment() {
    // Trees along the road
    for (let i = 0; i < ROAD_PATH.length; i += 3) {
        const p = ROAD_PATH[i];

        // Trees on both sides
        for (let side = -1; side <= 1; side += 2) {
            if (Math.random() > 0.4) {
                const offset = 15 + Math.random() * 30;
                createTree(p.x + side * offset, p.z + (Math.random() - 0.5) * 10, p.elevation);
            }
        }
    }

    // Start arch
    createArch(ROAD_PATH[0].x, ROAD_PATH[0].z + 5, ROAD_PATH[0].elevation, 'START - LIBEREC');

    // Checkpoint arches
    const raspenavaIndex = Math.floor(ROAD_PATH.length * 0.3);
    const krystofovoIndex = Math.floor(ROAD_PATH.length * 0.65);

    createArch(ROAD_PATH[raspenavaIndex].x, ROAD_PATH[raspenavaIndex].z, ROAD_PATH[raspenavaIndex].elevation, 'RASPENAVA');
    createArch(ROAD_PATH[krystofovoIndex].x, ROAD_PATH[krystofovoIndex].z, ROAD_PATH[krystofovoIndex].elevation, 'KRYŠTOFOVO ÚDOLÍ');

    // Finish arch at Ještěd
    const finishP = ROAD_PATH[ROAD_PATH.length - 1];
    createArch(finishP.x, finishP.z, finishP.elevation, 'CÍL - JEŠTĚD');

    // Km markers
    for (let km = 5; km < 49; km += 5) {
        const progress = km / 49;
        const idx = Math.floor(progress * (ROAD_PATH.length - 1));
        const p = ROAD_PATH[idx];
        createKmMarker(p.x + 8, p.z, p.elevation, km.toString());
    }
}

function createTree(x, z, baseElevation) {
    const tree = new THREE.Group();
    const type = Math.random();

    if (type < 0.6) {
        // Spruce
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.4, 4, 6),
            new THREE.MeshLambertMaterial({ color: 0x4a3728 })
        );
        trunk.position.y = 2;
        tree.add(trunk);

        for (let i = 0; i < 4; i++) {
            const foliage = new THREE.Mesh(
                new THREE.ConeGeometry(3 - i * 0.5, 2.5, 6),
                new THREE.MeshLambertMaterial({ color: 0x1a4d1a })
            );
            foliage.position.y = 3.5 + i * 1.8;
            tree.add(foliage);
        }
    } else {
        // Deciduous
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.4, 3.5, 6),
            new THREE.MeshLambertMaterial({ color: 0x5c4033 })
        );
        trunk.position.y = 1.75;
        tree.add(trunk);

        const foliage = new THREE.Mesh(
            new THREE.SphereGeometry(2.5, 6, 6),
            new THREE.MeshLambertMaterial({ color: 0x2d5a2d })
        );
        foliage.position.y = 5;
        tree.add(foliage);
    }

    tree.position.set(x, baseElevation, z);
    scene.add(tree);
    trees.push(tree);
}

function createArch(x, z, elevation, text) {
    const arch = new THREE.Group();

    const pillarMat = new THREE.MeshLambertMaterial({ color: 0xff6600 });

    const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), pillarMat);
    leftPillar.position.set(-6, 3.5, 0);
    arch.add(leftPillar);

    const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), pillarMat);
    rightPillar.position.set(6, 3.5, 0);
    arch.add(rightPillar);

    const banner = new THREE.Mesh(new THREE.BoxGeometry(14, 1.5, 0.4), pillarMat);
    banner.position.set(0, 7, 0);
    arch.add(banner);

    const textBg = new THREE.Mesh(
        new THREE.BoxGeometry(12, 1, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    textBg.position.set(0, 7, 0.25);
    arch.add(textBg);

    arch.position.set(x, elevation, z);
    scene.add(arch);
}

function createKmMarker(x, z, elevation, km) {
    const marker = new THREE.Group();

    const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 1.8, 6),
        new THREE.MeshLambertMaterial({ color: 0x666666 })
    );
    post.position.y = 0.9;
    marker.add(post);

    const sign = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.7, 0.08),
        new THREE.MeshLambertMaterial({ color: 0x006600 })
    );
    sign.position.y = 2;
    marker.add(sign);

    marker.position.set(x, elevation, z);
    scene.add(marker);
}

function createJestedMountain() {
    const mountainGroup = new THREE.Group();
    const finishP = ROAD_PATH[ROAD_PATH.length - 1];

    // Main Ještěd peak
    const mountain = new THREE.Mesh(
        new THREE.ConeGeometry(80, 120, 8),
        new THREE.MeshLambertMaterial({ color: 0x4a6b4a })
    );
    mountain.position.set(finishP.x, finishP.elevation + 60, finishP.z - 100);
    mountainGroup.add(mountain);

    // Snow cap
    const snow = new THREE.Mesh(
        new THREE.ConeGeometry(20, 25, 8),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    snow.position.set(finishP.x, finishP.elevation + 110, finishP.z - 100);
    mountainGroup.add(snow);

    // Ještěd TV tower
    const tower = new THREE.Group();

    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(5, 8, 15, 12),
        new THREE.MeshLambertMaterial({ color: 0xcccccc })
    );
    base.position.y = 7.5;
    tower.add(base);

    const middle = new THREE.Mesh(
        new THREE.CylinderGeometry(4, 5, 25, 12),
        new THREE.MeshLambertMaterial({ color: 0xdddddd })
    );
    middle.position.y = 27.5;
    tower.add(middle);

    const top = new THREE.Mesh(
        new THREE.ConeGeometry(5, 18, 12),
        new THREE.MeshLambertMaterial({ color: 0xcccccc })
    );
    top.position.y = 49;
    tower.add(top);

    const antenna = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 12, 6),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    antenna.position.y = 64;
    tower.add(antenna);

    tower.position.set(finishP.x, finishP.elevation + 120, finishP.z - 100);
    mountainGroup.add(tower);

    // Surrounding peaks
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const dist = 150 + Math.random() * 100;
        const height = 50 + Math.random() * 40;

        const peak = new THREE.Mesh(
            new THREE.ConeGeometry(40 + Math.random() * 20, height, 6),
            new THREE.MeshLambertMaterial({ color: 0x3d5c3d })
        );
        peak.position.set(
            finishP.x + Math.cos(angle) * dist,
            finishP.elevation + height / 2,
            finishP.z - 100 + Math.sin(angle) * dist * 0.5
        );
        mountainGroup.add(peak);
    }

    scene.add(mountainGroup);
}

function spawnPickups() {
    pickups.forEach(p => scene.remove(p.mesh));
    pickups = [];

    const pickupProgresses = [0.08, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 0.88];

    pickupProgresses.forEach((prog, i) => {
        const roadData = getRoadData(prog);
        const product = enervitProducts[i % enervitProducts.length];

        const pickup = new THREE.Group();

        const box = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 1.2, 1.2),
            new THREE.MeshLambertMaterial({ color: product.color, transparent: true, opacity: 0.9 })
        );
        pickup.add(box);

        const glow = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 1.5, 1.5),
            new THREE.MeshBasicMaterial({ color: product.color, transparent: true, opacity: 0.3, side: THREE.BackSide })
        );
        pickup.add(glow);

        pickup.position.set(
            roadData.x + (Math.random() - 0.5) * 4,
            roadData.elevation + 1.5,
            roadData.z
        );

        scene.add(pickup);
        pickups.push({ mesh: pickup, product, collected: false, progress: prog });
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
    gameState.progress = 0;
    clock.start();
}

function restartGame() {
    finishScreen.style.display = 'none';

    gameState.speed = 0;
    gameState.energy = 100;
    gameState.progress = 0;
    gameState.laneOffset = 0;
    gameState.time = 0;
    gameState.isPlaying = true;
    gameState.isPaused = false;
    gameState.playerRank = 1;

    competitors.forEach((comp, i) => {
        comp.progress = 0.001 + (i + 1) * 0.002;
        comp.laneOffset = (Math.random() - 0.5) * 1.5;
        comp.speed = 28 + Math.random() * 12;
        comp.energy = 100;
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
    } else if (gameState.progress > 0.6) {
        situation = 'uphill';
        situationMessage = 'Stoupání na Ještěd! Připrav se na kopec.';
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
            <div style="width:70px;height:70px;background:${new THREE.Color(product.color).getStyle()};border-radius:10px;margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;color:white;">E</div>
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
            setTimeout(() => { gameState.maxSpeed = 65; }, 12000);
            break;
        case 'stamina':
            gameState.energyDrain *= (1 - 0.5 * multiplier);
            setTimeout(() => { gameState.energyDrain = 0.012; }, 20000);
            break;
        case 'recovery':
            const interval = setInterval(() => {
                if (gameState.energy < 100) gameState.energy += 3 * multiplier;
                else clearInterval(interval);
            }, 500);
            setTimeout(() => clearInterval(interval), 12000);
            break;
    }
}

function showPickupNotification(text, color) {
    pickupNotification.textContent = text;
    pickupNotification.style.display = 'block';
    pickupNotification.style.borderColor = color;
    pickupNotification.style.color = color;
    setTimeout(() => { pickupNotification.style.display = 'none'; }, 2000);
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
        // Speed variation
        const speedVar = Math.sin(Date.now() / 1000 + index * 0.7) * 4;
        const targetSpeed = comp.targetSpeed + speedVar;

        if (comp.speed < targetSpeed) comp.speed += 0.08;
        else comp.speed -= 0.04;

        // Slope affects AI speed
        const roadData = getRoadData(comp.progress);
        const slopeEffect = 1 - Math.max(0, roadData.slope * 3);

        // Move forward
        const moveAmount = comp.speed * slopeEffect * delta * 0.00003;
        comp.progress = Math.min(1, comp.progress + moveAmount);

        // Update position
        const pos = getRoadData(comp.progress);
        comp.mesh.position.set(
            pos.x + comp.laneOffset * 3,
            pos.elevation,
            pos.z
        );
        comp.mesh.rotation.y = pos.direction;

        // Lean into slope
        comp.mesh.rotation.x = -pos.slope * 0.5;
    });

    // Calculate rank
    let rank = 1;
    competitors.forEach(comp => {
        if (comp.progress > gameState.progress) rank++;
    });
    gameState.playerRank = rank;
}

function onKeyDown(e) {
    switch(e.key) {
        case 'ArrowUp': case 'w': case 'W': keys.up = true; break;
        case 'ArrowDown': case 's': case 'S': keys.down = true; break;
        case 'ArrowLeft': case 'a': case 'A': keys.left = true; break;
        case 'ArrowRight': case 'd': case 'D': keys.right = true; break;
    }
}

function onKeyUp(e) {
    switch(e.key) {
        case 'ArrowUp': case 'w': case 'W': keys.up = false; break;
        case 'ArrowDown': case 's': case 'S': keys.down = false; break;
        case 'ArrowLeft': case 'a': case 'A': keys.left = false; break;
        case 'ArrowRight': case 'd': case 'D': keys.right = false; break;
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

    // Get current road data
    const roadData = getRoadData(gameState.progress);
    gameState.currentSlope = roadData.slope;

    // Calculate real elevation (370m start, 1012m finish)
    gameState.elevation = 370 + (1012 - 370) * gameState.progress;

    // Slope affects max speed and energy drain
    const slopeMultiplier = Math.max(0.3, 1 - roadData.slope * 4);
    const effectiveMaxSpeed = gameState.maxSpeed * slopeMultiplier * (0.5 + gameState.energy / 200);

    // Energy drain - more on steep sections
    const drainMultiplier = 1 + roadData.slope * 5 + gameState.speed / 100;
    gameState.energy -= gameState.energyDrain * drainMultiplier;
    gameState.energy = Math.max(0, gameState.energy);

    // Speed control
    if (keys.up && gameState.energy > 0) {
        gameState.speed += gameState.acceleration * (0.5 + gameState.energy / 200);
    } else if (keys.down) {
        gameState.speed -= gameState.brakeForce;
    } else {
        // Natural deceleration - more on uphills
        gameState.speed -= gameState.deceleration * (1 + roadData.slope * 3);
    }
    gameState.speed = Math.max(0, Math.min(effectiveMaxSpeed, gameState.speed));

    // Lane movement
    if (keys.left) gameState.laneOffset = Math.max(-1, gameState.laneOffset - 2 * delta);
    if (keys.right) gameState.laneOffset = Math.min(1, gameState.laneOffset + 2 * delta);

    // Progress along road
    const progressSpeed = gameState.speed * delta * 0.00015;
    gameState.progress = Math.min(1, gameState.progress + progressSpeed);
    gameState.distance = gameState.progress * gameState.totalDistance;

    // Check finish
    if (gameState.progress >= 0.999) {
        finishGame();
        return;
    }

    // Update cyclist position
    cyclist.position.set(
        roadData.x + gameState.laneOffset * 4,
        roadData.elevation,
        roadData.z
    );
    cyclist.rotation.y = roadData.direction;

    // Lean cyclist into hill
    cyclist.rotation.x = -roadData.slope * 0.6;

    // Lean when turning
    if (keys.left) cyclist.rotation.z = 0.12;
    else if (keys.right) cyclist.rotation.z = -0.12;
    else cyclist.rotation.z *= 0.9;

    // Update competitors
    updateCompetitors(delta);

    // Check pickups
    pickups.forEach(pickup => {
        if (!pickup.collected && Math.abs(pickup.progress - gameState.progress) < 0.015) {
            const dx = cyclist.position.x - pickup.mesh.position.x;
            const dz = cyclist.position.z - pickup.mesh.position.z;
            if (Math.sqrt(dx*dx + dz*dz) < 4) {
                showProductSelection(pickup);
            }
        }
    });

    // Animate pickups
    pickups.forEach(pickup => {
        if (!pickup.collected) {
            pickup.mesh.rotation.y += delta * 1.5;
            pickup.mesh.position.y = getRoadData(pickup.progress).elevation + 1.5 + Math.sin(Date.now() / 400) * 0.2;
        }
    });

    // Camera follow
    const camOffset = new THREE.Vector3(0, 5, 12);
    camOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), roadData.direction);

    camera.position.lerp(
        new THREE.Vector3(
            cyclist.position.x + camOffset.x,
            cyclist.position.y + camOffset.y + 2,
            cyclist.position.z + camOffset.z
        ),
        0.06
    );
    camera.lookAt(cyclist.position.x, cyclist.position.y + 2, cyclist.position.z - 3);

    // Update HUD
    speedDisplay.textContent = Math.round(gameState.speed);
    distanceDisplay.textContent = (gameState.distance / 1000).toFixed(1);
    elevationDisplay.textContent = Math.round(gameState.elevation);
    rankDisplay.textContent = gameState.playerRank;

    const minutes = Math.floor(gameState.time / 60);
    const seconds = Math.floor(gameState.time % 60);
    timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    energyBar.style.width = `${gameState.energy}%`;
    playerMarker.style.bottom = `${5 + gameState.progress * 90}%`;

    if (gameState.energy < 20) {
        energyBar.style.background = 'linear-gradient(90deg, #ff0000, #ff3300)';
    } else if (gameState.energy < 50) {
        energyBar.style.background = 'linear-gradient(90deg, #ff6600, #ffcc00)';
    } else {
        energyBar.style.background = 'linear-gradient(90deg, #00cc00, #00ff00)';
    }
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    updateGame(delta);
    renderer.render(scene, camera);
}
