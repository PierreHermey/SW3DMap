import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

// Configuration
const CONFIG = {
	GRID_SIZE: 21,
	SPHERE_RADIUS: 200,
	PLANET_SIZE: 0.5,
	ANIMATION_SPEED: 0.5,
};

class GalaxyViewer {
	constructor() {
		this.planets = [];
		this.planetData = [];
		this.planetVelocities = new Map();
		this.selectedPlanetIndex = null;
		this.raycaster = new THREE.Raycaster();
		this.mouse = new THREE.Vector2();

		// Repulsion config
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

			// ← Couleur UNIQUE pour la sphère solide
			const biomeData = this.generateBiomeColor();
			const uniqueMaterial = material.clone();
			uniqueMaterial.color = biomeData.color;
			uniqueMaterial.emissive = biomeData.color;
			uniqueMaterial.emissiveIntensity = 0.2;

			instancedMesh.setColorAt(index, biomeData.color);


			const textureGeometry = new THREE.IcosahedronGeometry(CONFIG.PLANET_SIZE * 1.05, 5);
			// ← RANDOMISER: 50% de chance d'avoir une texture
			const hasTexture = Math.random() > 0.5;

			let textureMesh = null;

			if (hasTexture) {
				const textureCanvas = this.generateBiomeTexture(biomeData.biome);
				const heightCanvas = this.generateHeightmap(biomeData.biome);

				const texture = this.canvasToThreeTexture(textureCanvas);
				const displacementMap = this.canvasToThreeTexture(heightCanvas);

				// ← FIX COUPURE: Répéter la texture au lieu de l'étirer
				texture.wrapS = THREE.RepeatWrapping;
				texture.wrapT = THREE.RepeatWrapping;
				texture.repeat.set(2, 2);  // Répète 2x2 pour éviter les coupures

				displacementMap.wrapS = THREE.RepeatWrapping;
				displacementMap.wrapT = THREE.RepeatWrapping;
				displacementMap.repeat.set(2, 2);

				const textureMaterial = new THREE.MeshPhongMaterial({
					map: texture,
					displacementMap: displacementMap,
					displacementScale: 0.3,
					transparent: true,
					opacity: 1,
					side: THREE.FrontSide,
					shininess: 50
				});

				textureMesh = new THREE.Mesh(textureGeometry, textureMaterial);
				textureMesh.position.copy(position);
				this.scene.add(textureMesh);
			}

			this.planetData.push({
				...planet,
				index,
				position: position.clone(),
				originalPosition: position.clone(),
				pulseSpeed: 0.5 + Math.random() * 0.5,
				pulseOffset: Math.random() * Math.PI * 2,
				hovered: false,
				focused: false,
				biomeColor: biomeData.color,
				biome: biomeData.biome,
				textureMesh: textureMesh
			});

			this.planetVelocities.set(index, new THREE.Vector3());
		});

		instancedMesh.instanceMatrix.needsUpdate = true;
		this.instancedMesh = instancedMesh;
		this.scene.add(instancedMesh);

		this.createPlanetHalos();

		console.log(`✨ ${this.planets.length} planètes: sphères colorées + textures + halos`);
	}

	canvasToThreeTexture(canvas) {
		const texture = new THREE.CanvasTexture(canvas);
		texture.magFilter = THREE.NearestFilter;
		texture.minFilter = THREE.NearestFilter;
		return texture;
	}

	generateHeightmap(biome) {
		const canvas = document.createElement('canvas');
		canvas.width = 128;
		canvas.height = 128;
		const ctx = canvas.getContext('2d');
		const imageData = ctx.createImageData(128, 128);
		const data = imageData.data;

		switch(biome) {
			case 'water':
				for (let y = 0; y < 128; y++) {
					for (let x = 0; x < 128; x++) {
						const wave = Math.sin(x * 0.1) * 20 + Math.sin(y * 0.08) * 15;
						const height = 128 + wave;
						const idx = (y * 128 + x) * 4;
						data[idx] = height;
						data[idx + 1] = height;
						data[idx + 2] = height;
						data[idx + 3] = 255;
					}
				}
				break;

			case 'ice':
				for (let y = 0; y < 128; y++) {
					for (let x = 0; x < 128; x++) {
						const crystal = Math.sin(x * 0.2) * 30 + Math.cos(y * 0.2) * 25;
						const height = 128 + crystal;
						const idx = (y * 128 + x) * 4;
						data[idx] = Math.min(255, Math.max(0, height));
						data[idx + 1] = data[idx];
						data[idx + 2] = data[idx];
						data[idx + 3] = 255;
					}
				}
				break;

			case 'earth':
				for (let y = 0; y < 128; y++) {
					for (let x = 0; x < 128; x++) {
						const mountain = Math.sin(x * 0.08) * 40 + Math.cos(y * 0.08) * 35;
						const height = 128 + mountain;
						const idx = (y * 128 + x) * 4;
						data[idx] = Math.min(255, Math.max(0, height));
						data[idx + 1] = data[idx];
						data[idx + 2] = data[idx];
						data[idx + 3] = 255;
					}
				}
				break;

			case 'desert':
				for (let y = 0; y < 128; y++) {
					for (let x = 0; x < 128; x++) {
						const dune = Math.sin(x * 0.06 + y * 0.04) * 45;
						const height = 128 + dune;
						const idx = (y * 128 + x) * 4;
						data[idx] = Math.min(255, Math.max(0, height));
						data[idx + 1] = data[idx];
						data[idx + 2] = data[idx];
						data[idx + 3] = 255;
					}
				}
				break;

			case 'city':
				for (let y = 0; y < 128; y++) {
					for (let x = 0; x < 128; x++) {
						const building = Math.floor(x / 16) + Math.floor(y / 16);
						const height = 100 + (building % 3) * 40;
						const idx = (y * 128 + x) * 4;
						data[idx] = height;
						data[idx + 1] = height;
						data[idx + 2] = height;
						data[idx + 3] = 255;
					}
				}
				break;

			case 'marsh':
				for (let y = 0; y < 128; y++) {
					for (let x = 0; x < 128; x++) {
						const swamp = Math.sin(x * 0.1) * 20 + Math.cos(y * 0.1) * 15;
						const water = Math.random() > 0.7 ? -20 : 0;
						const height = 128 + swamp + water;
						const idx = (y * 128 + x) * 4;
						data[idx] = Math.min(255, Math.max(0, height));
						data[idx + 1] = data[idx];
						data[idx + 2] = data[idx];
						data[idx + 3] = 255;
					}
				}
				break;
		}

		ctx.putImageData(imageData, 0, 0);
		return canvas;
	}

	generateBiomeTexture(biome) {
		const canvas = document.createElement('canvas');
		canvas.width = 128;
		canvas.height = 128;
		const ctx = canvas.getContext('2d');
		const imageData = ctx.createImageData(128, 128);
		const data = imageData.data;

		switch(biome) {
			case 'water':
				for (let y = 0; y < 128; y++) {
					for (let x = 0; x < 128; x++) {
						const wave = Math.sin(x * 0.1 + Math.random() * 0.5) * 10;
						const brightness = 122 + wave;
						const idx = (y * 128 + x) * 4;
						data[idx] = 26;
						data[idx + 1] = 107;
						data[idx + 2] = Math.max(100, brightness);
						data[idx + 3] = 255;
					}
				}
				break;

			case 'ice':
				for (let y = 0; y < 128; y++) {
					for (let x = 0; x < 128; x++) {
						const noise = Math.sin(x * 0.05) * Math.cos(y * 0.05);
						const brightness = 240 + noise * 15;
						const idx = (y * 128 + x) * 4;
						data[idx] = brightness;
						data[idx + 1] = brightness;
						data[idx + 2] = 255;
						data[idx + 3] = 255;
					}
				}
				break;

			case 'earth':
				for (let y = 0; y < 128; y++) {
					for (let x = 0; x < 128; x++) {
						const terrain = Math.sin(x * 0.08) + Math.cos(y * 0.08);
						const forest = Math.sin(x * 0.3) * Math.cos(y * 0.3);
						const idx = (y * 128 + x) * 4;
						data[idx] = Math.floor(61 + terrain * 10 + forest * 20);
						data[idx + 1] = Math.floor(100 + terrain * 15);
						data[idx + 2] = Math.floor(45 + terrain * 8);
						data[idx + 3] = 255;
					}
				}
				break;

			case 'desert':
				for (let y = 0; y < 128; y++) {
					for (let x = 0; x < 128; x++) {
						const dune = Math.sin(x * 0.06) * 20;
						const shadow = Math.cos(y * 0.04) * 10;
						const idx = (y * 128 + x) * 4;
						data[idx] = Math.floor(212 + dune + shadow);
						data[idx + 1] = Math.floor(165 + dune * 0.7);
						data[idx + 2] = Math.floor(116 + dune * 0.5);
						data[idx + 3] = 255;
					}
				}
				break;

			case 'city':
				for (let y = 0; y < 128; y++) {
					for (let x = 0; x < 128; x++) {
						const light = Math.random() > 0.4;
						const shadow = Math.abs(Math.sin(x * 0.1)) * 20;
						const idx = (y * 128 + x) * 4;

						if (light) {
							data[idx] = 200;
							data[idx + 1] = 200;
							data[idx + 2] = 100;
						} else {
							data[idx] = Math.floor(80 - shadow);
							data[idx + 1] = Math.floor(80 - shadow);
							data[idx + 2] = Math.floor(80 - shadow);
						}
						data[idx + 3] = 255;
					}
				}
				break;

			case 'marsh':
				for (let y = 0; y < 128; y++) {
					for (let x = 0; x < 128; x++) {
						const swamp = Math.sin(x * 0.05) * Math.cos(y * 0.05);
						const water = Math.sin(x * 0.1) * 10;
						const idx = (y * 128 + x) * 4;

						if (Math.random() > 0.6) {
							data[idx] = 26;
							data[idx + 1] = 58 + water;
							data[idx + 2] = 92;
						} else {
							data[idx] = Math.floor(61 + swamp * 15);
							data[idx + 1] = Math.floor(92 + swamp * 10);
							data[idx + 2] = Math.floor(45 + swamp * 8);
						}
						data[idx + 3] = 255;
					}
				}
				break;
		}

		ctx.putImageData(imageData, 0, 0);
		return canvas;
	}

	generateBiomeColor() {
		const biomes = {
			water: {
				colors: [0x1a4d7a, 0x2d5fa3, 0x1f5a96, 0x0d3b66, 0x2d6a8f],
				name: 'water'
			},
			ice: {
				colors: [0xf0f8ff, 0xe0f6ff, 0xd4ebf7, 0xb3e5fc, 0x81d4fa],
				name: 'ice'
			},
			earth: {
				colors: [0x3d5c1d, 0x556b2f, 0x6b8e23, 0x228b22, 0x2d5016],
				name: 'earth'
			},
			desert: {
				colors: [0xd4a574, 0xe6b84d, 0xcc8800, 0xd2691e, 0xff8c00],
				name: 'desert'
			},
			city: {
				colors: [0x696969, 0x808080, 0xa9a9a9, 0xffff00, 0xffa500],
				name: 'city'
			},
			marsh: {
				colors: [0x3d5c1d, 0x1a3a1a, 0x4a6741, 0x2d4a2f, 0x556b2f],
				name: 'marsh'
			}
		};

		const biomeArray = Object.values(biomes);
		const randomBiome = biomeArray[Math.floor(Math.random() * biomeArray.length)];
		const randomColor = randomBiome.colors[Math.floor(Math.random() * randomBiome.colors.length)];

		return {
			hex: randomColor,
			color: new THREE.Color(randomColor),
			biome: randomBiome.name
		};
	}

	createPlanetHalos() {
		const regionColors = {
			'Deep Core': 0xffffff,
			'Core Worlds': 0xfcd788,
			'Colonies': 0xc687f8,
			'Mid Rim': 0xb939af,
			'Inner Rim': 0xf6b16b,
			'Expansion Region': 0x85ddf1,
			'Outer Rim Territories': 0x00ffd9,
			'Unknown Regions': 0x9a9a9a,
			'Wild Space': 0x41ff00,
			'Hutt Space': 0xff0000,
		};

		// ← Générer UNE SEULE texture réutilisable
		const sharedHaloTexture = this.generateSoftHaloTexture();

		this.planetData.forEach((data) => {
			const regionColor = regionColors[data.region] || 0xFFE81F;

			const haloGeometry = new THREE.IcosahedronGeometry(CONFIG.PLANET_SIZE * 5, 5);
			const haloMaterial = new THREE.MeshBasicMaterial({
				map: sharedHaloTexture,
				color: regionColor,
				transparent: true,
				opacity: 0.12,
				side: THREE.FrontSide,
				depthWrite: false,
				blending: THREE.NormalBlending,  // ← Normal, pas Additive
			});

			const halo = new THREE.Mesh(haloGeometry, haloMaterial);
			halo.position.copy(data.position);
			halo.userData = {
				pulseSpeed: 0.6 + Math.random() * 0.3,
				pulseOffset: Math.random() * Math.PI * 2
			};

			this.scene.add(halo);
			data.haloMesh = halo;
		});

		console.log(`✨ ${this.planetData.length} halos créés`);
	}

	generateSoftHaloTexture() {
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const ctx = canvas.getContext('2d');

		const centerX = 32;
		const centerY = 32;

		// Créer gradient radial très simple
		const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 45);
		gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
		gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.6)');
		gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.1)');
		gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, 64, 64);

		const texture = new THREE.CanvasTexture(canvas);
		texture.magFilter = THREE.LinearFilter;
		texture.minFilter = THREE.LinearFilter;
		return texture;
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

			// Easing ease-out-cubic pour un mouvement naturel
			const eased = 1 - Math.pow(1 - progress, 3);

			this.planetData.forEach(data => {
				const startPos = startPositions.get(data.index);
				const targetPos = data.originalPosition;

				// Interpoler la position
				data.position.lerpVectors(startPos, targetPos, eased);

				// Mettre à jour la matrice de l'InstancedMesh
				const matrix = new THREE.Matrix4();
				matrix.setPosition(data.position);
				this.instancedMesh.setMatrixAt(data.index, matrix);

				// ← Mettre à jour position du skin texturé
				if (data.textureMesh) {
					data.textureMesh.position.copy(data.position);
				}

				// ← Mettre à jour position du halo aussi
				if (data.haloMesh) {
					data.haloMesh.position.copy(data.position);
				}

				// Réinitialiser la vélocité progressivement
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

				if (data.textureMesh) data.textureMesh.position.copy(data.position);
				if (data.haloMesh) data.haloMesh.position.copy(data.position);
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

	focusOnPlanet(instanceId) {
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

		// ← AJOUTER AFFICHAGE INFOS DESKTOP
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
                        <path fill-rule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z" clip-rule="evenodd"></path>
                    </svg>
                    <div class="flex-1">
                        <div class="text-gray-500 mb-0.5">Position 3D</div>
                        <div class="text-white font-mono text-xs">
                            (${Math.round(planet.position.x)}, ${Math.round(planet.position.y)}, ${Math.round(planet.position.z)})
                        </div>
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

		// ← AJOUTER MODAL MOBILE
		window.showPlanetModal(planet);

		this.animateCameraTo(planet.position);
	}

	clearPlanetFocus() {
		if (this.selectedPlanetIndex !== null) {
			this.planetData[this.selectedPlanetIndex].focused = false;
			this.selectedPlanetIndex = null;

			// ← Restaurer minDistance pour vue galaxie
			this.controls.minDistance = CONFIG.SPHERE_RADIUS * 0.5;

			this.restorePlanetsToOriginalPositions();

			this.planetVelocities.forEach((velocity) => {
				velocity.set(0, 0, 0);
			});
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

		// ← AJOUTER: Animer les halos avec pulse/breathing
		this.planetData.forEach((data) => {
			if (data.haloMesh) {
				const pulse = Math.sin(time * data.haloMesh.userData.pulseSpeed + data.haloMesh.userData.pulseOffset) * 0.15 + 1;
				data.haloMesh.scale.setScalar(pulse);
			}
		});

		this.controls.update();
		this.renderer.render(this.scene, this.camera);
	}
}

new GalaxyViewer();
