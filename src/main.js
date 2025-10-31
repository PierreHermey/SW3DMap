import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const isMobile = () => {
	return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
			.test(navigator.userAgent) ||
		window.matchMedia("(max-width: 768px)").matches;
};

// Configuration
const CONFIG = {
	GRID_SIZE: 21,
	SPHERE_RADIUS: 200,
	PLANET_SIZE: 0.5,
	ANIMATION_SPEED: 0.5,
};

const isDev = location.hostname == 'localhost';
const host = isDev
	? '/assets'
	: 'https://pub-1ee90aa7201d46a6866703f0c56989a7.r2.dev';

// ========== GESTION TEXTURES HD ==========

const TEXTURE_MAPS_BASE = {
	volcanic: {
		diffuse: 'volcanic_diffuse.png',
		bump: 'volcanic_bump.png',
		roughness: 'volcanic_roughness.png',
		elevation: 'volcanic_elevation.png',
		clouds: 'volcanic_clouds.png',
		lava: 'volcanic_lava.png',
		citylights: 'volcanic_citylights.png',
	},
	oceanic: {
		diffuse: 'oceanic_diffuse.png',
		bump: 'oceanic_bump.png',
		roughness: 'oceanic_roughness.png',
		elevation: 'oceanic_elevation.png',
		clouds: 'oceanic_clouds.png',
		lava: 'oceanic_islands.png',
		citylights: 'oceanic_citylights.png',
	},
};

const PLANET_SPECIFIC_TEXTURES = {
	coruscant: {
		diffuse: 'coruscant_diffuse.png',
		bump: 'coruscant_bump.png',
		roughness: null,
		specular: 'coruscant_specular.png',
		elevation: null,
		clouds: 'coruscant_clouds.png',
		cloudsbump: 'coruscant_clouds_bump.png',
		citylights: 'coruscant_citylights.png',
		alwaysVisible: true,  // ← PLANÈTE PRINCIPALE
	},
	taris: {
		diffuse: 'taris_diffuse.png',
		bump: 'taris_bump.png',
		roughness: null,
		specular: 'taris_specular.png',
		elevation: null,
		clouds: 'taris_clouds.png',
		cloudsbump: 'taris_cloud_bump.png',
		citylights: 'taris_citylights.png',
		alwaysVisible: true,  // ← PLANÈTE PRINCIPALE
	},
};

const TEXTURE_MAPS = {};

Object.entries(TEXTURE_MAPS_BASE).forEach(([biome, files]) => {
	TEXTURE_MAPS[biome] = {};
	Object.entries(files).forEach(([type, filename]) => {
		TEXTURE_MAPS[biome][type] = `${host}/textures/${biome}/${filename}`;
	});
});

Object.entries(PLANET_SPECIFIC_TEXTURES).forEach(([planetName, files]) => {
	TEXTURE_MAPS[planetName] = {};
	Object.entries(files).forEach(([type, filename]) => {
		if (filename && type !== 'alwaysVisible') {
			TEXTURE_MAPS[planetName][type] = `${host}/planets/${planetName}/${filename}`;
		}
	});
});

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
		Object.entries(files)
			.filter(([k, url]) => url)
			.map(async ([k, url]) => {
				try {
					const tex = await loader.loadAsync(url);
					return [k, tex];
				} catch (error) {
					console.warn(`⚠️ Impossible de charger ${k} depuis ${url}:`, error.message);
					return [k, null];
				}
			})
	);

	const tex = Object.fromEntries(entries);
	HdTextureCache.set(biomeKey, tex);
	return tex;
}

async function createHDPlanetMesh(biomeKey, planetRadius) {
	const tex = await loadHDTexturesAsync(biomeKey);
	if (!tex || !tex.diffuse) {
		console.error(`❌ Impossible de créer le mesh HD : pas de texture diffuse pour ${biomeKey}`);
		return null;
	}

	// Réglage des encodages
	if (tex.diffuse) tex.diffuse.encoding = THREE.sRGBEncoding;
	if (tex.bump) tex.bump.encoding = THREE.LinearEncoding;
	if (tex.roughness) tex.roughness.encoding = THREE.LinearEncoding;
	if (tex.elevation) tex.elevation.encoding = THREE.LinearEncoding;
	if (tex.specular) tex.specular.encoding = THREE.LinearEncoding;
	if (tex.citylights) tex.citylights.encoding = THREE.sRGBEncoding;
	if (tex.clouds) tex.clouds.encoding = THREE.sRGBEncoding;
	if (tex.cloudsbump) tex.cloudsbump.encoding = THREE.LinearEncoding;
	if (tex.lava) tex.lava.encoding = THREE.sRGBEncoding;

	// Groupe principal contenant tous les layers
	const planetGroup = new THREE.Group();

	// ========== LAYER 1 : Surface principale (diffuse + bump + elevation) ==========
	const surfaceGeo = new THREE.SphereGeometry(planetRadius, 128, 128);
	const surfaceMat = new THREE.MeshStandardMaterial({
		map: tex.diffuse,
		transparent: false,
		side: THREE.FrontSide,
		metalness: 0,
		roughness: 0.9,
	});

	if (tex.bump) {
		surfaceMat.bumpMap = tex.bump;
		surfaceMat.bumpScale = 0.02;
	}

	if (tex.elevation) {
		surfaceMat.displacementMap = tex.elevation;
		surfaceMat.displacementScale = 0.015;
	}

	// ← IMPORTANT : Ne pas utiliser roughnessMap directement si tu veux pas de réflexions
	// À la place, augmente le roughness global
	if (tex.roughness) {
		// Option 1 : Ignorer la roughnessMap
		// surfaceMat.roughnessMap = tex.roughness;

		// Option 2 : Utiliser la roughnessMap mais garder roughness à 1
		surfaceMat.roughnessMap = tex.roughness;
		surfaceMat.roughness = 1; // Force à maximum
	}

	const surfaceMesh = new THREE.Mesh(surfaceGeo, surfaceMat);
	planetGroup.add(surfaceMesh);

	// ========== LAYER 2 : Specular (reflets métalliques) ==========
	// if (tex.specular) {
	// 	const specularGeo = new THREE.SphereGeometry(planetRadius * 1.001, 64, 64);
	// 	const specularMat = new THREE.MeshStandardMaterial({
	// 		map: tex.specular,
	// 		transparent: true,
	// 		opacity: 0.5,
	// 		blending: THREE.AdditiveBlending,
	// 		depthWrite: false,
	// 		metalness: 0.3,
	// 		roughness: 0.2,
	// 	});
	// 	const specularMesh = new THREE.Mesh(specularGeo, specularMat);
	// 	planetGroup.add(specularMesh);
	// }

	// ========== LAYER 3 : City Lights (lumières urbaines/émissives) ==========
	if (tex.citylights) {
		const lightsGeo = new THREE.SphereGeometry(planetRadius * 1.002, 64, 64);
		const lightsMat = new THREE.MeshBasicMaterial({
			map: tex.citylights,
			transparent: true,
			blending: THREE.AdditiveBlending,
			opacity: 0.8,
			depthWrite: false,
		});
		const lightsMesh = new THREE.Mesh(lightsGeo, lightsMat);
		planetGroup.add(lightsMesh);
	}

	// ========== LAYER 4 : Lava (couches de lave/éléments additifs) ==========
	if (tex.lava) {
		const lavaGeo = new THREE.SphereGeometry(planetRadius * 1.003, 64, 64);
		const lavaMat = new THREE.MeshBasicMaterial({
			map: tex.lava,
			transparent: true,
			blending: THREE.AdditiveBlending,
			opacity: 0.4,
			depthWrite: false,
		});
		const lavaMesh = new THREE.Mesh(lavaGeo, lavaMat);
		planetGroup.add(lavaMesh);
	}

	// ========== LAYER 5 : Clouds (nuages atmosphériques) ==========
	if (tex.clouds) {
		const cloudsGeo = new THREE.SphereGeometry(planetRadius * 1.015, 64, 64);
		const cloudsMat = new THREE.MeshPhongMaterial({
			map: tex.clouds,
			transparent: true,
			opacity: 0.6,
			depthWrite: false,
			side: THREE.FrontSide,
		});

		if (tex.cloudsbump) {
			cloudsMat.bumpMap = tex.cloudsbump;
			cloudsMat.bumpScale = 0.3;
		}

		const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
		planetGroup.add(cloudsMesh);
	}

	return planetGroup;
}

// ==========================================

class GalaxyViewer {
	constructor() {
		this.isMobile = isMobile();  // ← AJOUTER
		this.instanceIndexToPlanetIndex = new Map();  // ← AJOUTER: mapping

		this.regionalClouds = [];
		this.planets = [];
		this.planetData = [];
		this.planetVelocities = new Map();
		this.selectedPlanetIndex = null;
		this.raycaster = new THREE.Raycaster();
		this.mouse = new THREE.Vector2();
		this.focusedHdMesh = null;
		this.focusedHdMeshKey = null;
		this.alwaysVisibleMeshes = new Map();

		this.spotlights = [];
		this.ambientLight = null;

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

		// ← AJOUTER: Créer les tooltips après avoir créé les alwaysVisible meshes
		this.setupPlanetTooltips();

		this.animate();

		document.getElementById('loading').style.display = 'none';
		console.log('✅ Galaxie volumétrique chargée!');

		// ← AJOUTER: Auto-focus Coruscant sur mobile
		if (this.isMobile) {
			const coruscantPlanet = this.planetData.find(p => p.biome === 'coruscant');
			if (coruscantPlanet) {
				this.focusOnPlanet(coruscantPlanet.index);
				console.log('📱 Focus automatique sur Coruscant (mobile)');
			}
		}
	}

	setupPlanetTooltips() {
		const container = document.getElementById('planet-tooltips-container');

		// Créer des tooltips pour toutes les alwaysVisible
		this.planetTooltips = new Map();

		for (const [biomeKey, textureConfig] of Object.entries(PLANET_SPECIFIC_TEXTURES)) {
			if (!textureConfig.alwaysVisible) continue;

			const planet = this.planetData.find(p => p.biome === biomeKey);
			if (!planet) continue;

			// Créer l'élément tooltip
			const tooltip = document.createElement('div');
			tooltip.className = 'planet-tooltip';
			tooltip.id = `tooltip-${biomeKey}`;
			tooltip.innerHTML = `<span>${planet.name}</span>`;
			tooltip.classList.add('visible');

			// ← AJOUTER: Rendre cliquable avec un curseur pointer
			tooltip.style.cursor = 'pointer';
			tooltip.style.pointerEvents = 'auto';  // Accepter les clics

			// ← AJOUTER: Event listener pour les clics
			tooltip.addEventListener('click', () => {
				this.focusOnPlanet(planet.index);
			});

			// ← AJOUTER: Effect au survol
			tooltip.addEventListener('mouseenter', () => {
				tooltip.style.transform = 'translate(-50%, -100%) scale(1.1)';
				tooltip.style.boxShadow = '0 0 20px rgba(255, 192, 0, 0.8)';
			});

			tooltip.addEventListener('mouseleave', () => {
				tooltip.style.transform = 'translate(-50%, -100%) scale(1)';
				tooltip.style.boxShadow = '0 0 15px rgba(255, 192, 0, 0.4)';
			});

			container.appendChild(tooltip);

			this.planetTooltips.set(biomeKey, {
				element: tooltip,
				planet: planet,
				visible: true
			});
		}

		console.log(`✨ ${this.planetTooltips.size} tooltips créés et cliquables`);
	}

	updatePlanetTooltipsPositions() {
		if (!this.planetTooltips) return;

		for (const [biomeKey, data] of this.planetTooltips) {
			// Convertir la position 3D en screen space
			const vector = data.planet.position.clone();
			vector.project(this.camera);

			// Vérifier si la planète est visible (en avant de la caméra)
			const isVisible = vector.z < 1 && vector.z > -1;

			// Vérifier que la planète n'est pas derrière la caméra
			const cameraDistance = this.camera.position.distanceTo(data.planet.position);
			const behindCamera = cameraDistance < this.camera.near;

			if (isVisible && !behindCamera) {
				// Convertir en coordonnées pixel
				const x = (vector.x + 1) * window.innerWidth / 2;
				const y = -(vector.y - 1) * window.innerHeight / 2;

				// Ajouter offset pour afficher au-dessus
				const tooltipY = y - 50;

				// Mettre à jour la position
				data.element.style.left = `${x}px`;
				data.element.style.top = `${tooltipY}px`;

				// Afficher le tooltip
				data.element.classList.add('visible');
				data.visible = true;
			} else {
				// Masquer si hors écran ou derrière caméra
				data.element.classList.remove('visible');
				data.visible = false;
			}
		}
	}


	showTooltip(biomeKey) {
		const data = this.planetTooltips?.get(biomeKey);
		if (data) {
			data.element.classList.add('visible');
			data.visible = true;
		}
	}

	hideTooltip(biomeKey) {
		const data = this.planetTooltips?.get(biomeKey);
		if (data) {
			data.element.classList.remove('visible');
			data.visible = false;
		}
	}

	hideAllTooltips() {
		if (!this.planetTooltips) return;
		for (const data of this.planetTooltips.values()) {
			data.element.classList.remove('visible');
		}
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

		// ← AJOUTER: Variable pour le debounce
		let searchTimeout = null;

		// ← MODIFIER: Utiliser 'input' avec debounce
		searchInput.addEventListener('input', (e) => {
			clearTimeout(searchTimeout);
			const searchTerm = e.target.value.trim();

			// Attendre 300ms après le dernier caractère tapé
			searchTimeout = setTimeout(() => {
				if (searchTerm) {
					this.searchAndFocusPlanet(searchTerm);
				}
			}, 1000);
		});

		// ← GARDER: 'change' pour les clics dehors ou entrée
		searchInput.addEventListener('change', (e) => {
			clearTimeout(searchTimeout);
			const searchTerm = e.target.value.trim();
			if (searchTerm) {
				this.searchAndFocusPlanet(searchTerm);
			}
		});

		clearButton.addEventListener('click', () => {
			searchInput.value = '';
			clearTimeout(searchTimeout);
			this.clearPlanetFocus();
		});

		searchInput.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				searchInput.value = '';
				clearTimeout(searchTimeout);
				this.clearPlanetFocus();
				searchInput.blur();
			}
			// ← AJOUTER: Entrée pour chercher immédiatement
			if (e.key === 'Enter') {
				clearTimeout(searchTimeout);
				const searchTerm = searchInput.value.trim();
				if (searchTerm) {
					this.searchAndFocusPlanet(searchTerm);
				}
			}
		});
	}

	searchAndFocusPlanet(searchTerm) {
		const planet = this.planets.find(p =>
			p.name.toLowerCase() === searchTerm.toLowerCase()
		);

		if (planet) {
			// ← Trouver l'index global dans this.planets
			const globalIndex = this.planets.indexOf(planet);
			this.focusOnPlanet(globalIndex);
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
		this.ambientLight = new THREE.AmbientLight(0x1a3a4d, 0.6);
		this.scene.add(this.ambientLight);

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

		this.createSpotlights();
	}

	createSpotlights() {
		const spotlightConfigs = [
			{ position: { x: -15, y: -18, z: 0 } },
			{ position: { x: 15, y: -18, z: 0 } },
			{ position: { x: -15, y: 18, z: 0 } },
			{ position: { x: 15, y: 18, z: 0 } },
		];

		spotlightConfigs.forEach((config) => {
			const spotlight = new THREE.SpotLight(
				0xffffff,
				5,
				350,
				Math.PI / 5,
				0.4,
				1.5
			);

			spotlight.position.set(config.position.x, config.position.y, config.position.z);
			spotlight.target.position.set(0, 0, 0);
			spotlight.castShadow = false;
			spotlight.visible = false;

			this.scene.add(spotlight);
			this.scene.add(spotlight.target);

			spotlight.userData = {
				originalPosition: new THREE.Vector3(config.position.x, config.position.y, config.position.z)
			};

			this.spotlights.push(spotlight);
		});

		this.createVolumetricDust();
	}

	createVolumetricDust() {
		// Créer de la poussière/brume qui montre les rayons
		const dustGeometry = new THREE.BufferGeometry();
		const dustCount = 3000;

		const positions = new Float32Array(dustCount * 3);
		const colors = new Float32Array(dustCount * 3);

		for (let i = 0; i < dustCount * 3; i += 3) {
			positions[i] = (Math.random() - 0.5) * 80;     // x
			positions[i + 1] = (Math.random() - 0.5) * 80; // y
			positions[i + 2] = (Math.random() - 0.5) * 80; // z

			colors[i] = 1;     // r
			colors[i + 1] = 1; // g
			colors[i + 2] = 1; // b
		}

		dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		dustGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		const dustMaterial = new THREE.PointsMaterial({
			size: 0.3,
			transparent: true,
			opacity: 0.3,
			vertexColors: true,
			sizeAttenuation: true,
			fog: false
		});

		this.dustCloud = new THREE.Points(dustGeometry, dustMaterial);
		this.dustCloud.visible = false;
		this.scene.add(this.dustCloud);
	}

	updateLightingForPlanet(planetPosition) {
		// ← Augmenter drastiquement l'ambient light
		if (this.ambientLight) {
			this.ambientLight.intensity = 3.0; // Augmenté de 0.6 à 2.0
		}

		this.spotlights.forEach((spotlight) => {
			const offset = spotlight.userData.originalPosition.clone();
			const newPos = planetPosition.clone().add(offset);

			spotlight.position.copy(newPos);
			spotlight.target.position.copy(planetPosition);
			spotlight.visible = true;
		});

		// Afficher la poussière autour de la planète
		if (this.dustCloud) {
			this.dustCloud.position.copy(planetPosition);
			this.dustCloud.visible = true;
		}
	}

	resetLighting() {
		// ← Revenir à l'ambient light original
		if (this.ambientLight) {
			this.ambientLight.intensity = 0.6; // Back to original
		}

		this.spotlights.forEach(spotlight => {
			spotlight.visible = false;
		});

		if (this.dustCloud) {
			this.dustCloud.visible = false;
		}
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

		// ← Filtrer les planètes visibles sur mobile
		const visiblePlanets = this.isMobile
			? this.planets.filter(p => PLANET_SPECIFIC_TEXTURES[p.biome]?.alwaysVisible)
			: this.planets;

		console.log(`📱 Mobile: ${this.isMobile ? 'OUI' : 'NON'} - ${visiblePlanets.length}/${this.planets.length} planètes visibles`);

		const instancedMesh = new THREE.InstancedMesh(
			planetGeometry,
			material,
			visiblePlanets.length
		);

		instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

		const gridGroups = {};
		visiblePlanets.forEach(planet => {
			if (!gridGroups[planet.grid]) {
				gridGroups[planet.grid] = [];
			}
			gridGroups[planet.grid].push(planet);
		});

		// Index dans instancedMesh
		let instanceIndex = 0;

		// ← IMPORTANT: Créer d'abord TOUTES les entrées dans planetData
		const planetToGlobalIndex = new Map();
		this.planets.forEach((planet, globalIndex) => {
			const planetsInGrid = gridGroups[planet.grid] || [];
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

			const biomeColor = new THREE.Color(planet.color);

			// Créer l'entrée dans planetData POUR TOUTES les planètes
			this.planetData.push({
				...planet,
				index: globalIndex,
				instanceIndex: undefined,  // Sera défini plus bas si visible
				position: position.clone(),
				originalPosition: position.clone(),
				pulseSpeed: 0.5 + Math.random() * 0.5,
				pulseOffset: Math.random() * Math.PI * 2,
				hovered: false,
				focused: false,
				biomeColor: biomeColor,
				biome: planet.biome,
				visible: false,  // Sera mis à true si visible
			});

			planetToGlobalIndex.set(globalIndex, this.planetData.length - 1);
			this.planetVelocities.set(globalIndex, new THREE.Vector3());
		});

		// ← Maintenant ajouter les planètes visibles à l'instancedMesh
		visiblePlanets.forEach((planet) => {
			const globalIndex = this.planets.indexOf(planet);
			const planetDataIndex = planetToGlobalIndex.get(globalIndex);
			const planetData = this.planetData[planetDataIndex];

			const matrix = new THREE.Matrix4();
			matrix.setPosition(planetData.position);
			instancedMesh.setMatrixAt(instanceIndex, matrix);

			instancedMesh.setColorAt(instanceIndex, planetData.biomeColor);

			// ← AJOUTER: Sauvegarder le mapping
			this.instanceIndexToPlanetIndex.set(instanceIndex, globalIndex);

			// ← Mettre à jour planetData
			planetData.instanceIndex = instanceIndex;
			planetData.visible = true;

			instanceIndex++;
		});

		instancedMesh.instanceMatrix.needsUpdate = true;
		this.instancedMesh = instancedMesh;
		this.scene.add(instancedMesh);

		this.createRegionalClouds();

		console.log(`✨ ${visiblePlanets.length} planètes créées (${this.isMobile ? 'mobile' : 'desktop'})`);
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
		const regionGroups = {};
		this.planetData.forEach(planet => {
			const region = planet.region;
			if (!regionGroups[region]) {
				regionGroups[region] = [];
			}
			regionGroups[region].push(planet);
		});

		Object.entries(regionGroups).forEach(([regionName, planets]) => {
			if (planets.length === 0) return;

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

		// Réinitialiser les hover
		this.planetData.forEach(data => {
			data.hovered = false;
		});

		// 1. Tester les planètes du instancedMesh si visible
		if (this.instancedMesh.visible) {
			const intersects = this.raycaster.intersectObject(this.instancedMesh);

			if (intersects.length > 0) {
				const instanceId = intersects[0].instanceId;
				const globalPlanetIndex = this.instanceIndexToPlanetIndex.get(instanceId);
				const planet = this.planetData.find(p => p.index === globalPlanetIndex);

				if (planet && planet.visible) {
					planet.hovered = true;
					document.body.style.cursor = 'pointer';
					return;
				}
			}
		}

		// 2. Tester les planètes alwaysVisible en arrière-plan
		for (const [biomeKey, mesh] of this.alwaysVisibleMeshes) {
			const intersects = this.raycaster.intersectObject(mesh);

			if (intersects.length > 0) {
				const planet = this.planetData.find(p => p.biome === biomeKey);

				// ← AJOUTER: Vérifier que ce n'est pas la planète focusée
				if (planet && planet.index !== this.selectedPlanetIndex) {
					// ← VÉRIFIER: Que la planète n'est pas derrière la caméra
					const cameraDistance = this.camera.position.distanceTo(planet.position);
					const behindCamera = cameraDistance < this.camera.near;

					if (!behindCamera) {
						planet.hovered = true;
						document.body.style.cursor = 'pointer';
						return;
					}
				}
			}
		}

		document.body.style.cursor = 'default';
	}

	onMouseClick(event) {
		// ← AJOUTER: Ignorer les clics sur les tooltips (ils gèrent leurs propres clics)
		if (event.target.closest('.planet-tooltip')) {
			return;
		}

		this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
		this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

		this.raycaster.setFromCamera(this.mouse, this.camera);

		// 1. Tester d'abord les planètes du instancedMesh si visible
		if (this.instancedMesh.visible) {
			const intersects = this.raycaster.intersectObject(this.instancedMesh);

			if (intersects.length > 0) {
				const instanceId = intersects[0].instanceId;
				const globalPlanetIndex = this.instanceIndexToPlanetIndex.get(instanceId);
				const planet = this.planetData.find(p => p.index === globalPlanetIndex);

				if (planet && planet.visible) {
					this.focusOnPlanet(globalPlanetIndex);
					return;
				}
			}
		}

		// 2. Tester les planètes alwaysVisible en arrière-plan
		// ← MODIFIER: Vérifier que c'est la planète focusée ET pas masquée
		for (const [biomeKey, mesh] of this.alwaysVisibleMeshes) {
			const intersects = this.raycaster.intersectObject(mesh);

			if (intersects.length > 0) {
				const planet = this.planetData.find(p => p.biome === biomeKey);

				// ← AJOUTER: Vérifier que ce n'est pas une planète déjà focusée
				if (planet && planet.index !== this.selectedPlanetIndex) {
					// ← VÉRIFIER: Que la planète est pas derrière la caméra
					const cameraDistance = this.camera.position.distanceTo(planet.position);
					const behindCamera = cameraDistance < this.camera.near;

					if (!behindCamera) {
						this.focusOnPlanet(planet.index);
						return;
					}
				}
			}
		}
	}

	async focusOnPlanet(globalPlanetIndex) {
		if (this.selectedPlanetIndex !== null && this.selectedPlanetIndex !== globalPlanetIndex) {
			this.restorePlanetsToOriginalPositions(0.5);
		}

		this.selectedPlanetIndex = globalPlanetIndex;

		const planet = this.planetData.find(p => p.index === globalPlanetIndex);

		if (!planet) {
			console.error(`❌ Planète avec index ${globalPlanetIndex} non trouvée`);
			return;
		}

		planet.focused = true;

		this.controls.minDistance = CONFIG.PLANET_SIZE * 2;

		this.planetData.forEach((data) => {
			if (data.index !== globalPlanetIndex) {
				this.planetVelocities.set(data.index, new THREE.Vector3());
			}
		});

		this.updateRegionalClouds();

		if (planet.visible) {
			this.instancedMesh.visible = false;
		}

		this.regionalClouds.forEach(cloud => {
			cloud.mesh.visible = false;
		});

		// ← AJOUTER: Activer le glow sur les autres planètes alwaysVisible
		this.updateAlwaysVisibleGlow(globalPlanetIndex);

		if (this.focusedHdMesh) {
			const oldBiomeKey = this.focusedHdMeshKey;
			const shouldKeepOldVisible = PLANET_SPECIFIC_TEXTURES[oldBiomeKey]?.alwaysVisible;

			if (!shouldKeepOldVisible) {
				this.scene.remove(this.focusedHdMesh);
				if (this.focusedHdMesh.traverse) {
					this.focusedHdMesh.traverse((child) => {
						if (child.geometry) child.geometry.dispose();
						if (child.material) {
							if (Array.isArray(child.material)) {
								child.material.forEach(m => m.dispose());
							} else {
								child.material.dispose();
							}
						}
					});
				}
				this.focusedHdMesh = null;
			}
		}

		const biomeKey = planet.biome;
		if (TEXTURE_MAPS[biomeKey]) {
			console.log(`🔄 Chargement textures HD pour ${planet.name} (${biomeKey})...`);

			this.showLoader();

			let hdMesh = this.alwaysVisibleMeshes.get(biomeKey);

			if (!hdMesh) {
				hdMesh = await createHDPlanetMesh(biomeKey, CONFIG.PLANET_SIZE * 3);

				this.hideLoader();

				if (hdMesh) {
					this.scene.add(hdMesh);
					if (PLANET_SPECIFIC_TEXTURES[biomeKey]?.alwaysVisible) {
						this.alwaysVisibleMeshes.set(biomeKey, hdMesh);
					}
					if (this.planetTooltips?.has(biomeKey)) {
						const tooltipData = this.planetTooltips.get(biomeKey);
						tooltipData.element.classList.add('visible');
					}
				}
			} else {
				this.hideLoader();
			}

			if (hdMesh) {
				hdMesh.position.copy(planet.position);
				this.focusedHdMesh = hdMesh;
				this.focusedHdMeshKey = biomeKey;
				console.log(`✅ Textures HD chargées pour ${planet.name}`);

				this.updateLightingForPlanet(planet.position);
			} else {
				this.hideLoader();
				console.error(`❌ Erreur lors de la création du mesh HD pour ${biomeKey}`);
			}
		} else {
			this.hideLoader();
			console.warn(`⚠️ Aucune texture HD définie pour le biome: ${biomeKey}`);
		}

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
			const planet = this.planetData.find(p => p.index === this.selectedPlanetIndex);

			if (planet) {
				planet.focused = false;
			}

			this.selectedPlanetIndex = null;

			this.controls.minDistance = CONFIG.SPHERE_RADIUS * 0.5;

			this.restorePlanetsToOriginalPositions();

			this.planetVelocities.forEach((velocity) => {
				velocity.set(0, 0, 0);
			});

			this.updateRegionalClouds();

			this.updateAlwaysVisibleGlow(null);

			// ← Les tooltips restent visibles - pas besoin de les afficher à nouveau
			// car updatePlanetTooltipsPositions() les gère chaque frame

			if (this.focusedHdMesh && this.focusedHdMeshKey) {
				const shouldKeepVisible = PLANET_SPECIFIC_TEXTURES[this.focusedHdMeshKey]?.alwaysVisible;

				if (!shouldKeepVisible) {
					this.scene.remove(this.focusedHdMesh);
					if (this.focusedHdMesh.traverse) {
						this.focusedHdMesh.traverse((child) => {
							if (child.geometry) child.geometry.dispose();
							if (child.material) {
								if (Array.isArray(child.material)) {
									child.material.forEach(m => m.dispose());
								} else {
									child.material.dispose();
								}
							}
						});
					}
					this.focusedHdMesh = null;
					this.focusedHdMeshKey = null;
				} else {
					console.log(`✨ Planète principale reste visible`);
				}
			}

			this.instancedMesh.visible = true;

			this.regionalClouds.forEach(cloud => {
				cloud.mesh.visible = true;
			});

			this.resetLighting();
		}
		document.getElementById('planet-info').innerHTML = '';
	}

	updateAlwaysVisibleGlow(focusedPlanetIndex) {
		// Boucler sur tous les meshes alwaysVisible
		for (const [biomeKey, mesh] of this.alwaysVisibleMeshes) {
			const planet = this.planetData.find(p => p.biome === biomeKey);

			if (!planet) continue;

			// Si c'est la planète focusée → pas de glow
			if (planet.index === focusedPlanetIndex) {
				this.removeGlowFromMesh(mesh);
				continue;
			}

			// Si on est en focus (quelque chose est sélectionné) → ajouter glow
			if (focusedPlanetIndex !== null) {
				this.addGlowToMesh(mesh);
			} else {
				// Pas de focus → pas de glow
				this.removeGlowFromMesh(mesh);
			}
		}
	}

	addGlowToMesh(mesh) {
		mesh.traverse((child) => {
			if (child.material) {
				// Modifier l'émission
				if (child.material.emissive) {
					child.material.emissive.setHex(0x4488ff);
					child.material.emissiveIntensity = 0.7;
				}
			}
		});

		// ← AJOUTER: Légère augmentation de taille pour l'effet de glow
		mesh.scale.set(2, 2, 2);
	}

	removeGlowFromMesh(mesh) {
		mesh.traverse((child) => {
			if (child.material) {
				// Réinitialiser l'émission
				if (child.material.emissive) {
					child.material.emissive.setHex(0x000000);
					child.material.emissiveIntensity = 0;
				}
			}
		});

		// ← AJOUTER: Réinitialiser la scale
		mesh.scale.set(1, 1, 1);
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

		// ← AJOUTER: Mettre à jour les positions des tooltips
		this.updatePlanetTooltipsPositions();

		this.controls.update();
		this.renderer.render(this.scene, this.camera);
	}

	showLoader() {
		const loader = document.getElementById('planet-loader');
		if (loader) {
			loader.classList.remove('hidden');
		}
	}

	hideLoader() {
		const loader = document.getElementById('planet-loader');
		if (loader) {
			loader.classList.add('hidden');
		}
	}
}

new GalaxyViewer();
