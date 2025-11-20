let scene, camera, renderer, particles;
const count = 12000; // 12k Particles
let currentState = 'sphere';
let returnTimeout;
let faceModel;
let video;
// Default rotation targets
let targetRotationX = 0;
let targetRotationY = 0;
// Store idle rotation to mix with face tracking
let idleRotationY = 0; 

const themes = {
    cosmic: { h: 0.6, s: 0.7, l: 0.5 },
    neon: { h: 0.4, s: 1.0, l: 0.5 },
    sunset: { h: 0.05, s: 0.9, l: 0.5 },
    ocean: { h: 0.55, s: 0.8, l: 0.5 }
};
let currentTheme = themes.cosmic;

function init() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.02);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    adjustCamera();

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
    document.getElementById('container').appendChild(renderer.domElement);

    createParticles();
    setupEventListeners();
    setupFaceTracking();
    animate();
}

async function setupFaceTracking() {
    video = document.getElementById('webcam');

    try {
        // Request Camera
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: 640, height: 480 }, // Explicitly ask for size
            audio: false
        });
        video.srcObject = stream;
        
        // Wait for video to actually load data
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                resolve(video);
            };
        });
        
        await video.play();
        
        faceModel = await blazeface.load();
        console.log("Face Tracking Active");
        
        detectFace();
    } catch (err) {
        console.warn("Camera access error:", err);
    }
}

async function detectFace() {
    if (!faceModel || !video) return;

    // Estimate faces
    const predictions = await faceModel.estimateFaces(video, false);

    if (predictions.length > 0) {
        const start = predictions[0].topLeft;
        const end = predictions[0].bottomRight;
        const size = [end[0] - start[0], end[1] - start[1]];
        
        // Calculate center
        const faceX = (start[0] + size[0] / 2) / video.videoWidth; 
        const faceY = (start[1] + size[1] / 2) / video.videoHeight;

        // Map to Rotation 
        // Increased sensitivity for better effect
        targetRotationY = (faceX - 0.5) * 2.5; 
        targetRotationX = (faceY - 0.5) * 1.5; 
    } else {
        // If no face, slowly drift back to center/neutral
        targetRotationX = targetRotationX * 0.95;
        targetRotationY = targetRotationY * 0.95;
    }

    requestAnimationFrame(detectFace);
}

function adjustCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    if (aspect < 0.7) {
        camera.position.z = 65; 
    } else if (aspect < 1) {
        camera.position.z = 50;
    } else {
        camera.position.z = 30;
    }
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
}

function createParticles() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        const point = getSpherePoint(i);
        positions[i * 3] = point.x;
        positions[i * 3 + 1] = point.y;
        positions[i * 3 + 2] = point.z;

        const color = getThemeColor(point.x, point.y, point.z);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 0.15,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.8
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);
}

function getSpherePoint(i) {
    const phi = Math.acos(-1 + (2 * i) / count);
    const theta = Math.sqrt(count * Math.PI) * phi;
    return {
        x: 10 * Math.cos(theta) * Math.sin(phi),
        y: 10 * Math.sin(theta) * Math.sin(phi),
        z: 10 * Math.cos(phi)
    };
}

function getThemeColor(x, y, z) {
    const color = new THREE.Color();
    const depth = (x + y + z) / 30;
    color.setHSL(currentTheme.h + depth * 0.2, currentTheme.s, currentTheme.l);
    return color;
}

function createTextPoints(text) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const fontSize = 40; 
    const width = 1200; 
    const height = 300;

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'white';
    ctx.font = `900 ${fontSize}px Inter`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2);

    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    const points = [];
    const step = 2; 

    for (let i = 0; i < height; i += step) {
        for (let j = 0; j < width; j += step) {
            const index = (i * width + j) * 4;
            if (pixels[index] > 128) {
                points.push({
                    x: (j - width / 2) * 0.15,
                    y: -(i - height / 2) * 0.15,
                    z: 0
                });
            }
        }
    }
    return points;
}

function morphToText(text) {
    clearTimeout(returnTimeout);
    currentState = 'text';
    const textPoints = createTextPoints(text);
    const positions = particles.geometry.attributes.position.array;

    gsap.killTweensOf(positions);
    
    // Reset tracking rotations briefly
    targetRotationX = 0;
    targetRotationY = 0;
    
    // Reset actual rotation smoothly
    gsap.to(particles.rotation, { duration: 1, x: 0, y: 0, z: 0 });

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        let target = { x: 0, y: 0, z: 0 };

        if (i < textPoints.length) {
            target = textPoints[i];
        } else {
            const angle = Math.random() * Math.PI * 2;
            const r = 20 + Math.random() * 20;
            target.x = Math.cos(angle) * r;
            target.y = Math.sin(angle) * r;
            target.z = (Math.random() - 0.5) * 50;
        }

        gsap.to(positions, {
            [i3]: target.x,
            [i3 + 1]: target.y,
            [i3 + 2]: target.z,
            duration: 2 + Math.random(),
            ease: "power3.inOut",
            delay: Math.random() * 0.2,
        });
    }

    returnTimeout = setTimeout(morphToSphere, 6000);
}

function morphToSphere() {
    currentState = 'sphere';
    const positions = particles.geometry.attributes.position.array;
    const colors = particles.geometry.attributes.color.array;
    
    gsap.killTweensOf(positions);

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const target = getSpherePoint(i);
        const jitter = 0.5;

        gsap.to(positions, {
            [i3]: target.x + (Math.random() - 0.5) * jitter,
            [i3 + 1]: target.y + (Math.random() - 0.5) * jitter,
            [i3 + 2]: target.z + (Math.random() - 0.5) * jitter,
            duration: 2 + Math.random(),
            ease: "elastic.out(1, 0.5)",
            delay: Math.random() * 0.2
        });

        const targetColor = getThemeColor(target.x, target.y, target.z);
        gsap.to(colors, {
            [i3]: targetColor.r,
            [i3 + 1]: targetColor.g,
            [i3 + 2]: targetColor.b,
            duration: 2
        });
    }
}

function changeTheme(name) {
    currentTheme = themes[name];
    document.querySelectorAll('.color-scheme button').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${name}`).classList.add('active');

    const header = document.querySelector('.header h1');
    if(name === 'neon') header.style.background = 'linear-gradient(45deg, #00ff87, #60efff)';
    else if(name === 'sunset') header.style.background = 'linear-gradient(45deg, #ff8c37, #ff427a)';
    else if(name === 'ocean') header.style.background = 'linear-gradient(45deg, #0082c8, #00b4db)';
    else header.style.background = 'linear-gradient(45deg, #ff6e7f, #bfe9ff)';
    header.style.webkitBackgroundClip = 'text';
    header.style.backgroundClip = 'text';

    if(currentState === 'sphere') morphToSphere();
}

function setupEventListeners() {
    const btn = document.getElementById('typeBtn');
    const input = document.getElementById('morphText');

    const trigger = () => {
        const text = input.value.trim(); 
        if (text) morphToText(text);
    };

    btn.addEventListener('click', trigger);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') trigger();
    });
    
    setTimeout(() => morphToText("Good Morning Baby"), 1000);
}

function animate() {
    requestAnimationFrame(animate);

    if (particles) {
        // Calculate face tracking influence
        // We smooth the tracking values to prevent jitter
        const sensitivity = 0.05;
        
        if (currentState === 'sphere') {
            // SPHERE MODE:
            // 1. Keep continuous spinning (idleRotationY)
            // 2. ADD face tracking offset (targetRotationY)
            idleRotationY += 0.002; 
            
            // Current X matches face X
            particles.rotation.x += (targetRotationX - particles.rotation.x) * sensitivity;
            
            // Current Y = Idle Spin + Face Offset
            // We calculate the offset difference manually
            const currentFaceOffsetY = particles.rotation.y - idleRotationY;
            const diff = targetRotationY - currentFaceOffsetY;
            
            particles.rotation.y = idleRotationY + (currentFaceOffsetY + diff * sensitivity);
            
            // Add slight Z tilt for fun
            particles.rotation.z += (0 - particles.rotation.z) * sensitivity;

        } else {
            // TEXT MODE:
            // Stop spinning, just track face to look 3D/Holographic
            particles.rotation.x += (targetRotationX - particles.rotation.x) * sensitivity;
            particles.rotation.y += (targetRotationY - particles.rotation.y) * sensitivity;
            particles.rotation.z += (0 - particles.rotation.z) * sensitivity;
        }

        particles.geometry.attributes.position.needsUpdate = true;
        particles.geometry.attributes.color.needsUpdate = true;
    }
    
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    adjustCamera();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();

