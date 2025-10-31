import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

// Configuration
const CONFIG = {
	GRID_SIZE: 21,
	SPHERE_RADIUS: 200,
	PLANET_SIZE: 0.5,
	ANIMATION_SPEED: 0.5,
};

// ========== GESTION TEXTURES HD ==========
const TEXTURE_MAPS = {
	volcanic: {
		diffuse: 'assets/textures/volcanic/volcanic_diffuse.png',
		bump: 'assets/textures/volcanic/volcanic_bump.png',
		roughness: 'assets/textures/volcanic/volcanic_roughness.png',
		elevation: 'assets/textures/volcanic/volcanic_elevation.png',
		clouds: 'assets/textures/volcanic/volcanic_clouds.png',
		lava: 'assets/textures/volcanic/volcanic_lava.png',
		citylights: 'assets/textures/volcanic/volcanic_citylights.png',
	},
	oceanic: {
		diffuse: 'assets/textures/oceanic/oceanic_diffuse.png',
		bump: 'assets/textures/oceanic/oceanic_bump.png',
		roughness: 'assets/textures/oceanic/oceanic_roughness.png',
		elevation: 'assets/textures/oceanic/oceanic_elevation.png',
		clouds: 'assets/textures/oceanic/oceanic_clouds.png',
		lava: 'assets/textures/oceanic/oceanic_islands.png',
		citylights: 'assets/textures/oceanic/oceanic_citylights.png',
	},
	coruscant: {
		diffuse: 'assets/planets/coruscant/coruscant_diffuse.png',
		bump: 'assets/planets/coruscant/coruscant_bump.png',
		roughness: 'assets/planets/coruscant/coruscant_elevation.png',
		elevation: 'assets/planets/coruscant/coruscant_clouds.png',
		clouds: 'assets/planets/coruscant/coruscant_clouds_bump.png',
		citylights: 'assets/planets/coruscant/coruscant_citylights.png',
	},
	// Ajoute ici d'autres biomes : desert, ice, oceanic...
};

const HdTextureCache = new Map();

async function loadHDTexturesAsync(biomeKey) {
	if (HdTextureCache.has(biomeKey)) return HdTextureCache.get(biomeKey);

	const loader = new THREE.TextureLoader();
	const files = TEXTURE_MAPS[biomeKey];
	if (!files) {
		console.warn(`Aucune texture HD définie pour le biome: ${biomeKey}`);
		return null;
	}

	const entries = await Promise.all(
		Object.entries(files).map(async ([k, url]) => [k, await loader.loadAsync(url)])
	);
	const tex = Object.fromEntries(entries);
	HdTextureCache.set(biomeKey, tex);
	return tex;
}

async function createHDPlanetMesh(biomeKey, planetRadius) {
	const tex = await loadHDTexturesAsync(biomeKey);
	if (!tex) return null;

	const mat = new THREE.MeshStandardMaterial({
		map: tex.diffuse,
		bumpMap: tex.bump,
		roughnessMap: tex.roughness,
		displacementMap: tex.elevation,
		displacementScale: 0.025,
		emissiveMap: tex.citylights,
		emissive: tex.citylights ? new THREE.Color(0xffa000) : new THREE.Color(0x000000),
		emissiveIntensity: 1.0,
	});

	const geo = new THREE.SphereGeometry(planetRadius, 128, 128);
	const mesh = new THREE.Mesh(geo, mat);

	// Nuages overlay
	if (tex.clouds) {
		const cloudsGeo = new THREE.SphereGeometry(planetRadius * 1.02, 64, 64);
		const cloudsMat = new THREE.MeshPhongMaterial({
			map: tex.clouds,
			transparent: true,
			opacity: 0.7,
			depthWrite: false,
		});
		const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
		mesh.add(cloudsMesh);
	}

	// Lave overlay (effet additif)
	if (tex.lava) {
		const lavaGeo = new THREE.SphereGeometry(planetRadius * 1.01, 64, 64);
		const lavaMat = new THREE.MeshPhongMaterial({
			map: tex.lava,
			transparent: true,
			blending: THREE.AdditiveBlending,
			opacity: 0.5,
			depthWrite: false,
		});
		const lavaMesh = new THREE.Mesh(lavaGeo, lavaMat);
		mesh.add(lavaMesh);
	}

	return mesh;
}
// ==========================================

class GalaxyViewer {
	constructor() {
		this.regionalClouds = [];
		this.planets = [];
		this.planetData = [];
		this.planetVelocities = new Map();
		this.selectedPlanetIndex = null;
		this.raycaster = new THREE.Raycaster();
		this.mouse = new THREE.Vector2();
		this.focusedHdMesh = null; // ← Mesh HD de la planète en focus

		this.REPULSION_CONFIG = {
			radius: 40,
			strength: 0.8,
			dampingFactor: 0.92
		};

		this.init();
	}

	async init() {
		console.log('🚀 Initialisation de la galaxie volumétrique 3D...');

		await this.loadPlanets();
		this.populateSearchDatalist();
		this.setupScene();
		this.setupCamera();
		this.setupRenderer();
		this.setupControls();
		this.setupLights();
		this.createVolumetricGalaxy();
		this.createInstancedPlanets();
		this.setupEvents();
		this.setupSearchEvents();
		this.animate();

		document.getElementById('loading').style.display = 'none';
		console.log('✅ Galaxie volumétrique chargée!');
	}

	async loadPlanets() {
		try {
			const response = await fetch('./planets.json');
			this.planets = await response.json();
			console.log(`✅ ${this.planets.length} planètes chargées`);
			document.getElementById('planet-count').textContent =
				`Planètes: ${this.planets.length}`;
			document.getElementById('planet-count-mobile').textContent =
				`Planètes: ${this.planets.length}`;
		} catch (error) {
			console.error('❌ Erreur lors du chargement des planètes:', error);
			this.planets = [];
		}
	}

	populateSearchDatalist() {
		const datalist = document.getElementById('planets-list');
		datalist.innerHTML = '';

		const sortedPlanets = [...this.planets].sort((a, b) =>
			a.name.localeCompare(b.name)
		);

		sortedPlanets.forEach(planet => {
			const option = document.createElement('option');
			option.value = planet.name;
			option.textContent = `${planet.name} (${planet.grid}) - ${planet.region}`;
			datalist.appendChild(option);
		});
	}

	setupSearchEvents() {
		const searchInput = document.getElementById('planet-search');
		const clearButton = document.getElementById('clear-search');

		searchInput.addEventListener('input', (e) => {
			const searchTerm = e.target.value.trim();
			if (searchTerm) this.searchAndFocusPlanet(searchTerm);
		});

		searchInput.addEventListener('change', (e) => {
			const searchTerm = e.target.value.trim();
			if (searchTerm) this.searchAndFocusPlanet(searchTerm);
		});

		clearButton.addEventListener('click', () => {
			searchInput.value = '';
			this.clearPlanetFocus();
		});

		searchInput.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				searchInput.value = '';
				this.clearPlanetFocus();
				searchInput.blur();
			}
		});
	}

	searchAndFocusPlanet(searchTerm) {
		const planet = this.planets.find(p =>
			p.name.toLowerCase() === searchTerm.toLowerCase()
		);

		if (planet) {
			const planetData = this.planetData.find(d =>
				d.name === planet.name
			);
			if (planetData) this.focusOnPlanet(planetData.index);
		}
	}

	gridTo3D(gridX, gridY, depthFactor = Math.random()) {
		const centerGrid = 11;
		const scale = CONFIG.SPHERE_RADIUS / (CONFIG.GRID_SIZE / 2);

		const jitter = 0.5;
		const scaleRandomFactor = 1 + (Math.random() * 0.2 - 0.1);

		const jitteredX = gridX - centerGrid + (Math.random() * 2 - 1) * jitter;
		const jitteredY = gridY - centerGrid + (Math.random() * 2 - 1) * jitter;

		let x = jitteredX * scale * scaleRandomFactor;
		let y = jitteredY * scale * scaleRandomFactor;

		const radialDistance = Math.sqrt(x * x + y * y);

		const zFlattenFactor = 2;
		const maxRadiusXY = CONFIG.SPHERE_RADIUS;

		const density = Math.exp(-radialDistance / (maxRadiusXY / 2.5));
		const randomZFactor = 1 + Math.random() * 0.5;

		let z = (depthFactor - 0.5) * maxRadiusXY * 2 * zFlattenFactor * density * randomZFactor;

		y *= 1;

		const maxRadius3D = Math.sqrt(x * x + y * y + z * z);
		if (maxRadius3D > CONFIG.SPHERE_RADIUS) {
			const factor = CONFIG.SPHERE_RADIUS / maxRadius3D;
			x *= factor;
			y *= factor;
			z *= factor;
		}

		return new THREE.Vector3(x, y, z);
	}

	setupScene() {
		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x000011);
		this.scene.fog = new THREE.Fog(0x000011, CONFIG.SPHERE_RADIUS * 2, CONFIG.SPHERE_RADIUS * 4);
	}

	setupCamera() {
		this.camera = new THREE.PerspectiveCamera(
			60,
			window.innerWidth / window.innerHeight,
			0.1,
			1000
		);
		this.camera.position.set(
			CONFIG.SPHERE_RADIUS * 1.5,
			CONFIG.SPHERE_RADIUS * 1,
			CONFIG.SPHERE_RADIUS * 1.5
		);
	}

	setupRenderer() {
		this.renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: true
		});
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		document.body.appendChild(this.renderer.domElement);
	}

	setupControls() {
		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.05;
		this.controls.minDistance = CONFIG.SPHERE_RADIUS * 0.5;
		this.controls.maxDistance = CONFIG.SPHERE_RADIUS * 4;
		this.controls.target.set(0, 0, 0);
	}

	setupLights() {
		const ambientLight = new THREE.AmbientLight(0x1a3a4d, 0.6);
		this.scene.add(ambientLight);

		const coreLight = new THREE.PointLight(0xffcc99, 3.5, CONFIG.SPHERE_RADIUS * 4);
		coreLight.position.set(0, 0, 0);
		coreLight.castShadow = true;
		this.scene.add(coreLight);

		const rimLight = new THREE.PointLight(0x6688ff, 1.8, CONFIG.SPHERE_RADIUS * 3.5);
		rimLight.position.set(CONFIG.SPHERE_RADIUS * 1.2, CONFIG.SPHERE_RADIUS * 0.8, -CONFIG.SPHERE_RADIUS * 0.8);
		this.scene.add(rimLight);

		const fillLight = new THREE.PointLight(0xff6644, 1.2, CONFIG.SPHERE_RADIUS * 3);
		fillLight.position.set(-CONFIG.SPHERE_RADIUS * 1.5, -CONFIG.SPHERE_RADIUS * 0.5, CONFIG.SPHERE_RADIUS * 1.2);
		this.scene.add(fillLight);

		const directional = new THREE.DirectionalLight(0xffffff, 0.4);
		directional.position.set(100, 100, 100);
		directional.target.position.set(0, 0, 0);
		this.scene.add(directional);
		this.scene.add(directional.target);
	}

	createVolumetricGalaxy() {
		const sphereGeometry = new THREE.SphereGeometry(
			CONFIG.SPHERE_RADIUS,
			64,
			64
		);
		const sphereMaterial = new THREE.MeshBasicMaterial({
			color: 0x1a4466,
			transparent: true,
			opacity: 0,
			side: THREE.BackSide,
			wireframe: false
		});
		const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
		this.scene.add(sphere);

		this.createStarfield();
	}

	createStarfield() {
		const starsGeometry = new THREE.BufferGeometry();
		const starsVertices = [];
		const starsColors = [];

		for (let i = 0; i < 5000; i++) {
			const theta = Math.random() * Math.PI * 2;
			const phi = Math.acos(2 * Math.random() - 1);
			const radius = CONFIG.SPHERE_RADIUS * 2.5 + Math.random() * 200;

			const x = radius * Math.sin(phi) * Math.cos(theta);
			const y = radius * Math.sin(phi) * Math.sin(theta);
			const z = radius * Math.cos(phi);

			starsVertices.push(x, y, z);

			const color = new THREE.Color();
			color.setHSL(0.6, 0.2, 0.5 + Math.random() * 0.5);
			starsColors.push(color.r, color.g, color.b);
		}

		starsGeometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute(starsVertices, 3)
		);
		starsGeometry.setAttribute(
			'color',
			new THREE.Float32BufferAttribute(starsColors, 3)
		);

		const starsMaterial = new THREE.PointsMaterial({
			size: 0.5,
			transparent: true,
			opacity: 0.02,
			vertexColors: true,
			sizeAttenuation: true
		});

		const stars = new THREE.Points(starsGeometry, starsMaterial);
		this.scene.add(stars);
	}

	createInstancedPlanets() {
		const planetGeometry = new THREE.SphereGeometry(CONFIG.PLANET_SIZE, 32, 32);

		const material = new THREE.MeshPhongMaterial({
			color: 0xFFFFFF,
			shininess: 100,
			transparent: true,
			opacity: 0.95,
			side: THREE.FrontSide
		});

		const instancedMesh = new THREE.InstancedMesh(
			planetGeometry,
			material,
			this.planets.length
		);

		instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

		const gridGroups = {};
		this.planets.forEach(planet => {
			if (!gridGroups[planet.grid]) {
				gridGroups[planet.grid] = [];
			}
			gridGroups[planet.grid].push(planet);
		});

		this.planets.forEach((planet, index) => {
			const planetsInGrid = gridGroups[planet.grid];
			let depth = 0.5;

			if (planet.region.includes('Deep Core')) depth = 0.5;
			else if (planet.region.includes('Core Worlds')) depth = 0.4 + Math.random() * 0.2;
			else if (planet.region.includes('Colonies')) depth = 0.3 + Math.random() * 0.4;
			else if (planet.region.includes('Mid Rim')) depth = 0.35 + Math.random() * 0.3;
			else if (planet.region.includes('Outer Rim')) depth = 0.1 + Math.random() * 0.3;
			else if (planet.region.includes('Unknown')) depth = Math.random();

			if (planetsInGrid.length > 1) {
				const indexInGrid = planetsInGrid.indexOf(planet);
				depth += (indexInGrid / planetsInGrid.length - 0.5) * 0.1;
				depth = Math.max(0, Math.min(1, depth));
			}

			const basePosition = this.gridTo3D(planet.x, planet.y, depth);
			const offset = new THREE.Vector3(
				(Math.random() - 0.5) * 2,
				(Math.random() - 0.5) * 2,
				(Math.random() - 0.5) * 2
			);
			const position = basePosition.clone().add(offset);

			const matrix = new THREE.Matrix4();
			matrix.setPosition(position);
			instancedMesh.setMatrixAt(index, matrix);

			// ← Lire la couleur depuis le JSON (biome)
			const biomeColor = new THREE.Color(planet.color);
			instancedMesh.setColorAt(index, biomeColor);

			this.planetData.push({
				...planet,
				index,
				position: position.clone(),
				originalPosition: position.clone(),
				pulseSpeed: 0.5 + Math.random() * 0.5,
				pulseOffset: Math.random() * Math.PI * 2,
				hovered: false,
				focused: false,
				biomeColor: biomeColor,
				biome: planet.biome, // ← Clé du biome pour charger HD
			});

			this.planetVelocities.set(index, new THREE.Vector3());
		});

		instancedMesh.instanceMatrix.needsUpdate = true;
		this.instancedMesh = instancedMesh;
		this.scene.add(instancedMesh);

		this.createRegionalClouds();

		console.log(`✨ ${this.planets.length} planètes créées avec biomes`);
	}

	generateCloudParticleTexture() {
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const ctx = canvas.getContext('2d');

		ctx.clearRect(0, 0, 64, 64);

		const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
		gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
		gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
		gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.arc(32, 32, 32, 0, Math.PI * 2);
		ctx.fill();

		const texture = new THREE.CanvasTexture(canvas);
		texture.magFilter = THREE.LinearFilter;
		texture.minFilter = THREE.LinearFilter;
		return texture;
	}

	createRegionalClouds() {
		// Grouper planètes par région
		const regionGroups = {};
		this.planetData.forEach(planet => {
			const region = planet.region;
			if (!regionGroups[region]) {
				regionGroups[region] = [];
			}
			regionGroups[region].push(planet);
		});

		// Créer UN nuage par région avec sa couleur de région
		Object.entries(regionGroups).forEach(([regionName, planets]) => {
			if (planets.length === 0) return;

			// ← Utiliser regionColor du premier planet (tous ont la même pour la région)
			const regionColor = planets[0].regionColor;
			this.createRegionalCloud(regionName, planets, regionColor);
		});

		console.log(`☁️ ${Object.keys(regionGroups).length} nuages régionaux créés`);
	}

	createRegionalCloud(regionName, planets, colorHex) {
		const cloudGeometry = new THREE.BufferGeometry();
		const positions = [];
		const colors = [];
		const baseOffsets = [];

		const color = new THREE.Color(colorHex);

		planets.forEach(planet => {
			for (let i = 0; i < 30; i++) {
				const theta = Math.random() * Math.PI * 2;
				const phi = Math.acos(2 * Math.random() - 1);
				const radius = CONFIG.PLANET_SIZE * (0.2 + Math.random() * 0.1);

				const offsetX = radius * Math.sin(phi) * Math.cos(theta);
				const offsetY = radius * Math.sin(phi) * Math.sin(theta);
				const offsetZ = radius * Math.cos(phi);

				baseOffsets.push({ x: offsetX, y: offsetY, z: offsetZ });

				positions.push(
					planet.position.x + offsetX,
					planet.position.y + offsetY,
					planet.position.z + offsetZ
				);

				const alpha = Math.random() * 0.6 + 0.3;
				colors.push(color.r, color.g, color.b, alpha);
			}
		});

		cloudGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
		cloudGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 4));

		const cloudMaterial = new THREE.PointsMaterial({
			map: this.generateCloudParticleTexture(),
			size: 3,
			vertexColors: true,
			transparent: true,
			opacity: 0.15,
			sizeAttenuation: true,
			fog: false,
			depthWrite: false,
		});

		const cloud = new THREE.Points(cloudGeometry, cloudMaterial);
		this.scene.add(cloud);

		if (!this.regionalClouds) {
			this.regionalClouds = [];
		}

		this.regionalClouds.push({
			mesh: cloud,
			regionName,
			planets,
			geometry: cloudGeometry,
			colorHex,
			baseOffsets,
			driftOffsets: planets.flatMap(() =>
				Array(30).fill(0).map(() => ({
					x: (Math.random() - 0.5) * 1.5,
					y: (Math.random() - 0.5) * 1.5,
					z: (Math.random() - 0.5) * 1.5,
					vx: (Math.random() - 0.5) * 0.01,
					vy: (Math.random() - 0.5) * 0.01,
					vz: (Math.random() - 0.5) * 0.01,
				}))
			),
		});
	}

	updateRegionalClouds() {
		if (!this.regionalClouds) return;

		this.regionalClouds.forEach(cloudData => {
			const positions = [];
			const oldPositions = cloudData.geometry.attributes.position?.array;

			cloudData.driftOffsets.forEach(drift => {
				drift.x += drift.vx;
				drift.y += drift.vy;
				drift.z += drift.vz;

				if (Math.abs(drift.x) > 1.5) drift.vx *= -1;
				if (Math.abs(drift.y) > 1.5) drift.vy *= -1;
				if (Math.abs(drift.z) > 1.5) drift.vz *= -1;
			});

			cloudData.planets.forEach((planet, planetIndex) => {
				for (let i = 0; i < 30; i++) {
					const pointIndex = planetIndex * 30 + i;
					const baseOffset = cloudData.baseOffsets[pointIndex];
					const drift = cloudData.driftOffsets[pointIndex];

					if (!baseOffset || !drift) continue;

					const newX = planet.position.x + baseOffset.x + drift.x;
					const newY = planet.position.y + baseOffset.y + drift.y;
					const newZ = planet.position.z + baseOffset.z + drift.z;

					if (oldPositions && pointIndex * 3 < oldPositions.length) {
						const oldX = oldPositions[pointIndex * 3];
						const oldY = oldPositions[pointIndex * 3 + 1];
						const oldZ = oldPositions[pointIndex * 3 + 2];

						positions.push(
							oldX * 0.5 + newX * 0.5,
							oldY * 0.5 + newY * 0.5,
							oldZ * 0.5 + newZ * 0.5
						);
					} else {
						positions.push(newX, newY, newZ);
					}
				}
			});

			cloudData.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
			cloudData.geometry.attributes.position.needsUpdate = true;
		});
	}

	applyRepulsionForces() {
		if (this.selectedPlanetIndex === null) return;

		const selectedData = this.planetData[this.selectedPlanetIndex];
		const selectedPos = selectedData.position;
		const { radius, strength, dampingFactor } = this.REPULSION_CONFIG;

		this.planetData.forEach((data, index) => {
			if (index === this.selectedPlanetIndex) return;

			const distance = data.position.distanceTo(selectedPos);

			if (distance < radius && distance > 0) {
				const direction = data.position.clone()
					.sub(selectedPos)
					.normalize();

				const forceMagnitude = (1 - distance / radius) * strength;

				let velocity = this.planetVelocities.get(index);
				if (!velocity) {
					velocity = new THREE.Vector3();
					this.planetVelocities.set(index, velocity);
				}

				velocity.add(direction.multiplyScalar(forceMagnitude));
			}
		});
	}

	restorePlanetsToOriginalPositions(duration = 0.8) {
		const startTime = Date.now();
		const startPositions = new Map(
			this.planetData.map(data => [data.index, data.position.clone()])
		);

		const animate = () => {
			const elapsed = (Date.now() - startTime) / 1000;
			const progress = Math.min(elapsed / duration, 1);

			const eased = 1 - Math.pow(1 - progress, 3);

			this.planetData.forEach(data => {
				const startPos = startPositions.get(data.index);
				const targetPos = data.originalPosition;

				data.position.lerpVectors(startPos, targetPos, eased);

				const matrix = new THREE.Matrix4();
				matrix.setPosition(data.position);
				this.instancedMesh.setMatrixAt(data.index, matrix);

				const velocity = this.planetVelocities.get(data.index);
				if (velocity) {
					velocity.multiplyScalar(1 - progress);
				}
			});

			this.instancedMesh.instanceMatrix.needsUpdate = true;

			if (progress < 1) {
				requestAnimationFrame(animate);
			}
		};

		animate();
	}

	updatePlanetVelocities() {
		const { dampingFactor } = this.REPULSION_CONFIG;

		this.planetData.forEach(data => {
			const velocity = this.planetVelocities.get(data.index);
			if (velocity && velocity.length() > 0) {
				data.position.add(velocity);
				velocity.multiplyScalar(dampingFactor);

				const matrix = new THREE.Matrix4();
				matrix.setPosition(data.position);
				this.instancedMesh.setMatrixAt(data.index, matrix);
			}
		});

		this.instancedMesh.instanceMatrix.needsUpdate = true;
	}

	setupEvents() {
		window.addEventListener('resize', () => this.onWindowResize());
		window.addEventListener('click', (e) => this.onMouseClick(e));
		window.addEventListener('mousemove', (e) => this.onMouseMove(e));
	}

	onWindowResize() {
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(window.innerWidth, window.innerHeight);
	}

	onMouseMove(event) {
		this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
		this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

		this.raycaster.setFromCamera(this.mouse, this.camera);
		const intersects = this.raycaster.intersectObject(this.instancedMesh);

		this.planetData.forEach(data => {
			data.hovered = false;
		});

		if (intersects.length > 0) {
			const instanceId = intersects[0].instanceId;
			this.planetData[instanceId].hovered = true;
			document.body.style.cursor = 'pointer';
		} else {
			document.body.style.cursor = 'default';
		}
	}

	onMouseClick(event) {
		this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
		this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

		this.raycaster.setFromCamera(this.mouse, this.camera);
		const intersects = this.raycaster.intersectObject(this.instancedMesh);

		if (intersects.length > 0) {
			const instanceId = intersects[0].instanceId;
			this.focusOnPlanet(instanceId);
		}
	}

	async focusOnPlanet(instanceId) {
		if (this.selectedPlanetIndex !== null && this.selectedPlanetIndex !== instanceId) {
			this.restorePlanetsToOriginalPositions(0.5);
		}

		this.selectedPlanetIndex = instanceId;
		const planet = this.planetData[instanceId];
		planet.focused = true;

		this.controls.minDistance = CONFIG.PLANET_SIZE * 2;

		this.planetData.forEach((data, index) => {
			if (index !== instanceId) {
				this.planetVelocities.set(index, new THREE.Vector3());
			}
		});

		this.updateRegionalClouds();

		// ========== CHARGER TEXTURE HD ==========
		// Masquer TOUS les meshes low-res
		this.instancedMesh.visible = false;

		// ← MASQUER LES NUAGES AUSSI
		this.regionalClouds.forEach(cloud => {
			cloud.mesh.visible = false;
		});

		// Supprimer l'ancien mesh HD si existant
		if (this.focusedHdMesh) {
			this.scene.remove(this.focusedHdMesh);
			this.focusedHdMesh = null;
		}

		// Charger et créer le mesh HD
		const biomeKey = planet.biome; // ex: 'volcanic'
		if (TEXTURE_MAPS[biomeKey]) {
			console.log(`🔄 Chargement textures HD pour ${planet.name} (${biomeKey})...`);
			this.focusedHdMesh = await createHDPlanetMesh(biomeKey, CONFIG.PLANET_SIZE * 3);
			if (this.focusedHdMesh) {
				// ← AJOUTER LA POSITION CORRECTEMENT
				this.focusedHdMesh.position.copy(planet.position);
				this.scene.add(this.focusedHdMesh);
				console.log(`✅ Textures HD chargées pour ${planet.name}`);
				console.log(`📍 Position: x=${planet.position.x}, y=${planet.position.y}, z=${planet.position.z}`);
			} else {
				console.error(`❌ Erreur lors de la création du mesh HD pour ${biomeKey}`);
			}
		} else {
			console.warn(`⚠️ Aucune texture HD définie pour le biome: ${biomeKey}`);
		}
		// =========================================

		document.getElementById('planet-info').innerHTML = `
        <div class="space-y-3">
            <div class="text-base font-semibold text-white">
                ${planet.name}
            </div>
            
            <div class="space-y-2 text-xs">
                <div class="flex items-start gap-2.5 text-gray-300">
                    <svg class="w-3.5 h-3.5 text-star-wars flex-shrink-0 mt-0.5 opacity-70" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"></path>
                    </svg>
                    <div class="flex-1">
                        <div class="text-gray-500 mb-0.5">Grille</div>
                        <div class="text-star-wars font-medium">${planet.grid}</div>
                    </div>
                </div>
                
                <div class="flex items-start gap-2.5 text-gray-300">
                    <svg class="w-3.5 h-3.5 text-star-wars flex-shrink-0 mt-0.5 opacity-70" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path>
                    </svg>
                    <div class="flex-1">
                        <div class="text-gray-500 mb-0.5">Secteur</div>
                        <div class="text-white">${planet.sector}</div>
                    </div>
                </div>
                
                <div class="flex items-start gap-2.5 text-gray-300">
                    <svg class="w-3.5 h-3.5 text-star-wars flex-shrink-0 mt-0.5 opacity-70" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z"></path>
                    </svg>
                    <div class="flex-1">
                        <div class="text-gray-500 mb-0.5">Région</div>
                        <div class="text-white">${planet.region}</div>
                    </div>
                </div>
                
                <div class="flex items-start gap-2.5 text-gray-300">
                    <svg class="w-3.5 h-3.5 text-star-wars flex-shrink-0 mt-0.5 opacity-70" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M2 4a1 1 0 011-1h6a1 1 0 011 1v12a1 1 0 11-2 0V7H3v9a1 1 0 11-2 0V4zm8 0a1 1 0 011-1h6a1 1 0 011 1v12a1 1 0 11-2 0V7h-3v9a1 1 0 11-2 0V4z" clip-rule="evenodd"></path>
                    </svg>
                    <div class="flex-1">
                        <div class="text-gray-500 mb-0.5">Biome</div>
                        <div class="text-white capitalize">${planet.biome}</div>
                    </div>
                </div>
            </div>
        </div>
    `;

		window.showPlanetModal && window.showPlanetModal(planet);

		this.animateCameraTo(planet.position);
	}

	clearPlanetFocus() {
		if (this.selectedPlanetIndex !== null) {
			this.planetData[this.selectedPlanetIndex].focused = false;
			this.selectedPlanetIndex = null;

			this.controls.minDistance = CONFIG.SPHERE_RADIUS * 0.5;

			this.restorePlanetsToOriginalPositions();

			this.planetVelocities.forEach((velocity) => {
				velocity.set(0, 0, 0);
			});

			this.updateRegionalClouds();

			// ========== RESTAURER VUE GALAXIE ==========
			// Supprimer le mesh HD
			if (this.focusedHdMesh) {
				this.scene.remove(this.focusedHdMesh);
				this.focusedHdMesh = null;
			}
			// Réafficher l'instancedMesh
			this.instancedMesh.visible = true;

			// ← RÉAFFICHER LES NUAGES AUSSI
			this.regionalClouds.forEach(cloud => {
				cloud.mesh.visible = true;
			});
			// ===========================================
		}
		document.getElementById('planet-info').innerHTML = '';
	}


	animateCameraTo(targetPosition) {
		const distance = CONFIG.SPHERE_RADIUS * 0.03;
		const direction = targetPosition.clone().normalize();
		const cameraTarget = targetPosition.clone().add(direction.multiplyScalar(distance));

		const duration = 1.5;
		const startPosition = this.camera.position.clone();
		const startTarget = this.controls.target.clone();
		const startTime = Date.now();

		const animate = () => {
			const elapsed = (Date.now() - startTime) / 1000;
			const progress = Math.min(elapsed / duration, 1);

			const eased = progress < 0.5
				? 2 * progress * progress
				: 1 - Math.pow(-2 * progress + 2, 2) / 2;

			this.camera.position.lerpVectors(startPosition, cameraTarget, eased);
			this.controls.target.lerpVectors(startTarget, targetPosition, eased);
			this.controls.update();

			if (progress < 1) {
				requestAnimationFrame(animate);
			}
		};

		animate();
	}

	animate() {
		requestAnimationFrame(() => this.animate());

		const time = Date.now() * 0.001 * CONFIG.ANIMATION_SPEED;

		this.applyRepulsionForces();
		this.updatePlanetVelocities();
		this.updateRegionalClouds();

		this.controls.update();
		this.renderer.render(this.scene, this.camera);
	}
}

new GalaxyViewer();
