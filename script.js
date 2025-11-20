let scene, camera, renderer, particles;
const count = 12000; // 12k Particles
let currentState = 'sphere';
let returnTimeout;

// Themes configuration
const themes = {
    cosmic: { h: 0.6, s: 0.7, l: 0.5 },
    neon: { h: 0.4, s: 1.0, l: 0.5 },
    sunset: { h: 0.05, s: 0.9, l: 0.5 },
    ocean: { h: 0.55, s: 0.8, l: 0.5 }
};
let currentTheme = themes.cosmic;

function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.02);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 30;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('container').appendChild(renderer.domElement);

    // 2. Create Particles
    createParticles();

    // 3. Listeners
    setupEventListeners();

    // 4. Start Loop
    animate();
}

function createParticles() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    // Create initial sphere shape
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
    const fontSize = 60;
    const width = 800;
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
    const step = 2; // Density

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

// --- THE HEAVY LIFTING ---

function morphToText(text) {
    clearTimeout(returnTimeout);
    currentState = 'text';
    const textPoints = createTextPoints(text);
    const positions = particles.geometry.attributes.position.array;

    // KILL previous animations to prevent stacking
    gsap.killTweensOf(positions);
    
    // Reset rotation
    gsap.to(particles.rotation, { x: 0, y: 0, duration: 1 });

    // Loop through EVERY particle (Heavy!)
    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        let target = { x: 0, y: 0, z: 0 };

        if (i < textPoints.length) {
            target = textPoints[i];
        } else {
            // Random scatter for unused particles
            const angle = Math.random() * Math.PI * 2;
            const r = 20 + Math.random() * 20;
            target.x = Math.cos(angle) * r;
            target.y = Math.sin(angle) * r;
            target.z = (Math.random() - 0.5) * 50;
        }

        // INDIVIDUAL TWEEN per particle
        gsap.to(positions, {
            [i3]: target.x,
            [i3 + 1]: target.y,
            [i3 + 2]: target.z,
            duration: 2 + Math.random(), // Random duration for swarm effect
            ease: "power3.inOut",
            delay: Math.random() * 0.2, // Random delay
            // We don't need onUpdate here because the main loop handles it
        });
    }

    // Go back to sphere after 5 seconds
    returnTimeout = setTimeout(morphToSphere, 5000);
}

function morphToSphere() {
    currentState = 'sphere';
    const positions = particles.geometry.attributes.position.array;
    const colors = particles.geometry.attributes.color.array;
    
    gsap.killTweensOf(positions);

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const target = getSpherePoint(i);
        
        // Scatter slightly for organic feel
        const jitter = 0.5;

        gsap.to(positions, {
            [i3]: target.x + (Math.random() - 0.5) * jitter,
            [i3 + 1]: target.y + (Math.random() - 0.5) * jitter,
            [i3 + 2]: target.z + (Math.random() - 0.5) * jitter,
            duration: 2 + Math.random(),
            ease: "elastic.out(1, 0.5)",
            delay: Math.random() * 0.2
        });

        // Animate colors back to theme
        const targetColor = getThemeColor(target.x, target.y, target.z);
        gsap.to(colors, {
            [i3]: targetColor.r,
            [i3 + 1]: targetColor.g,
            [i3 + 2]: targetColor.b,
            duration: 2
        });
    }
}

// UI Interactivity
function changeTheme(name) {
    currentTheme = themes[name];
    
    // Update Buttons
    document.querySelectorAll('.color-scheme button').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${name}`).classList.add('active');

    // Update Header
    const header = document.querySelector('.header h1');
    if(name === 'neon') header.style.background = 'linear-gradient(45deg, #00ff87, #60efff)';
    else if(name === 'sunset') header.style.background = 'linear-gradient(45deg, #ff8c37, #ff427a)';
    else if(name === 'ocean') header.style.background = 'linear-gradient(45deg, #0082c8, #00b4db)';
    else header.style.background = 'linear-gradient(45deg, #ff6e7f, #bfe9ff)';
    header.style.webkitBackgroundClip = 'text';
    header.style.backgroundClip = 'text';

    if(currentState === 'sphere') morphToSphere(); // Re-trigger to catch color change
}

function setupEventListeners() {
    const btn = document.getElementById('typeBtn');
    const input = document.getElementById('morphText');

    const trigger = () => {
        const text = input.value.trim().toUpperCase();
        if (text) morphToText(text);
    };

    btn.addEventListener('click', trigger);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') trigger();
    });
    
    // Initial launch
    setTimeout(() => morphToText("HELLO"), 1000);
}

function animate() {
    requestAnimationFrame(animate);
    
    // Idle rotation
    if (currentState === 'sphere') {
        particles.rotation.y += 0.002;
        particles.rotation.z += 0.001;
    }

    // IMPORTANT: This flag tells Three.js to upload the new positions from GSAP to the GPU
    particles.geometry.attributes.position.needsUpdate = true;
    particles.geometry.attributes.color.needsUpdate = true;
    
    renderer.render(scene, camera);
}

// Handle resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start
init();