import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Configuration
const CONFIG = {
	GRID_SIZE: 21,           // A-U (21 lettres)
	SPHERE_RADIUS: 50,       // Rayon de la sphère
	PLANET_SIZE: 0.25,       // Taille des planètes
	ANIMATION_SPEED: 0.5,
};

class GalaxyViewer {
	constructor() {
		this.planets = [];
		this.planetMeshes = [];
		this.selectedPlanet = null;
		this.raycaster = new THREE.Raycaster();
		this.mouse = new THREE.Vector2();

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
		this.createPlanets();              // ← D'ABORD les planètes
		this.createRegionalZones();         // ← PUIS les zones (qui utilisent planetMeshes)
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
			const planetMesh = this.planetMeshes.find(mesh =>
				mesh.userData.name === planet.name
			);
			if (planetMesh) this.focusOnPlanet(planetMesh);
		}
	}

	/**
	 * Convertit les coordonnées de grille 2D en position 3D volumétrique
	 * M-16 devient: X = M (lettre), Y = 16 (nombre), Z = calculé selon la densité
	 * @param {number} gridX - Coordonnée X (1-21, A-U)
	 * @param {number} gridY - Coordonnée Y (1-21)
	 * @param {number} depth - Profondeur Z (0-1)
	 * @returns {THREE.Vector3} Position 3D dans le volume
	 */
	gridTo3D(gridX, gridY, depth = 0.5) {
		// Centrer les coordonnées autour de 0
		const halfSize = CONFIG.GRID_SIZE / 2;
		const scale = CONFIG.SPHERE_RADIUS / halfSize;

		// X et Y basés sur la grille
		const x = (gridX - halfSize - 0.5) * scale;
		const y = (gridY - halfSize - 0.5) * scale;

		// Z basé sur la profondeur (distribution dans le volume)
		// On utilise une distribution radiale pour créer une sphère
		const radiusAtDepth = Math.sqrt(1 - Math.pow(depth - 0.5, 2)) * CONFIG.SPHERE_RADIUS;
		const currentRadius = Math.sqrt(x * x + y * y);

		// Si le point est en dehors du rayon à cette profondeur, on l'ajuste
		let finalX = x;
		let finalY = y;
		let finalZ = (depth - 0.5) * CONFIG.SPHERE_RADIUS * 2;

		if (currentRadius > radiusAtDepth) {
			const factor = radiusAtDepth / currentRadius;
			finalX = x * factor;
			finalY = y * factor;
		}

		return new THREE.Vector3(finalX, finalY, finalZ);
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
		const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
		this.scene.add(ambientLight);

		// Lumière centrale (comme le Core galactique)
		const pointLight = new THREE.PointLight(0xffffaa, 2, CONFIG.SPHERE_RADIUS * 3);
		pointLight.position.set(0, 0, 0);
		this.scene.add(pointLight);

		// Lumières d'appoint
		const fillLight1 = new THREE.DirectionalLight(0x4444ff, 0.3);
		fillLight1.position.set(-100, 50, 100);
		this.scene.add(fillLight1);

		const fillLight2 = new THREE.DirectionalLight(0xff4444, 0.3);
		fillLight2.position.set(100, 50, -100);
		this.scene.add(fillLight2);
	}

	createVolumetricGalaxy() {
		// Sphère holographique transparente
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

		// Bordure holographique de la sphère
		const edgeGeometry = new THREE.EdgesGeometry(sphereGeometry);
		const edgeMaterial = new THREE.LineBasicMaterial({
			color: 0x3366aa,
			transparent: true,
			opacity: 0
		});


		// Grille volumétrique 3D - Plans de coupe
		this.createVolumetricGrid();

		// Étoiles d'arrière-plan
		this.createStarfield();

		// Axes de coordonnées holographiques
		this.createCoordinateAxes();
	}

	/**
	 * Crée des zones volumétriques basées sur les positions réelles des planètes
	 */
	createRegionalZones() {
		// Grouper les planètes par région
		const regionGroups = {};

		this.planetMeshes.forEach(mesh => {
			const region = mesh.userData.region;
			if (!regionGroups[region]) {
				regionGroups[region] = {
					planets: [],
					color: mesh.userData.color
				};
			}
			regionGroups[region].planets.push(mesh.position.clone());
		});

		// Définition des couleurs par région
		const regionColors = {
			'Deep Core': 0x00FFFF,
			'Core Worlds': 0x4444FF,
			'Colonies': 0x00AAFF,
			'Mid Rim': 0xFFAA00,
			'Expansion Region': 0xFFC800,
			'Outer Rim Territories': 0xFF4444,
			'Unknown Regions': 0xFF00FF,
			'Wild Space': 0xAA00AA,
			'Hutt Space': 0x00FF00
		};

		// Créer une zone pour chaque région
		Object.entries(regionGroups).forEach(([regionName, data]) => {
			if (data.planets.length < 1) {
				return;
			}

			const color = regionColors[regionName] || 0xFFE81F;

			// Calculer le centre et le rayon englobant
			const center = this.calculateCenter(data.planets);
			const radius = this.calculateBoundingRadius(data.planets, center);

			// Créer une zone simple et minimaliste
			this.createSimpleRegionalZone(center, radius, color, regionName);

			console.log(`🌈 Zone ${regionName}: ${data.planets.length} planètes`);
		});
	}

	/**
	 * Calcule le centre géométrique d'un groupe de points
	 */
	calculateCenter(points) {
		const center = new THREE.Vector3();
		points.forEach(point => center.add(point));
		center.divideScalar(points.length);
		return center;
	}

	/**
	 * Calcule le rayon qui englobe tous les points avec une marge
	 */
	calculateBoundingRadius(points, center) {
		let maxDistance = 0;
		points.forEach(point => {
			const distance = point.distanceTo(center);
			if (distance > maxDistance) {
				maxDistance = distance;
			}
		});
		// Ajouter 50% de marge pour que la zone englobe bien
		return maxDistance * 1.5;
	}

	/**
	 * Crée une zone simple et minimaliste autour d'une région
	 */
	createSimpleRegionalZone(center, radius, color, regionName) {
		// Sphère transparente colorée
		const sphereGeometry = new THREE.SphereGeometry(radius, 32, 32);
		const sphereMaterial = new THREE.MeshBasicMaterial({
			color: color,
			transparent: true,
			opacity: 0.03,
			side: THREE.DoubleSide,
			depthWrite: false
		});
		const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
		sphere.position.copy(center);
		sphere.userData.region = regionName;
		this.scene.add(sphere);

		// Contour wireframe de la zone
		const edgesGeometry = new THREE.EdgesGeometry(sphereGeometry);
		const edgesMaterial = new THREE.LineBasicMaterial({
			color: color,
			transparent: true,
			opacity: 0,
			linewidth: 0
		});
		const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
		edges.position.copy(center);
		edges.userData.region = regionName;
		this.scene.add(edges);

		// Stocker pour animation et toggle
		if (!this.regionalSpheres) this.regionalSpheres = [];
		this.regionalSpheres.push({
			sphere,
			edges,
			center,
			baseRadius: radius,
			regionName
		});
	}


	createVolumetricGrid() {
		const gridMaterial = new THREE.LineBasicMaterial({
			color: 0x444466,
			transparent: true,
			opacity: 0
		});

		// Plans XY à différentes profondeurs Z
		for (let z = -1; z <= 1; z += 0.5) {
			const zPos = z * CONFIG.SPHERE_RADIUS;

			// Lignes horizontales (Y constant)
			for (let y = 0; y <= CONFIG.GRID_SIZE; y++) {
				const points = [];
				for (let x = 0; x <= CONFIG.GRID_SIZE; x++) {
					const pos = this.gridTo3D(x, y, z * 0.5 + 0.5);
					points.push(pos);
				}
				const geometry = new THREE.BufferGeometry().setFromPoints(points);
				const line = new THREE.Line(geometry, gridMaterial);
				this.scene.add(line);
			}

			// Lignes verticales (X constant)
			for (let x = 0; x <= CONFIG.GRID_SIZE; x++) {
				const points = [];
				for (let y = 0; y <= CONFIG.GRID_SIZE; y++) {
					const pos = this.gridTo3D(x, y, z * 0.5 + 0.5);
					points.push(pos);
				}
				const geometry = new THREE.BufferGeometry().setFromPoints(points);
				const line = new THREE.Line(geometry, gridMaterial);
				this.scene.add(line);
			}
		}
	}

	createCoordinateAxes() {
		// Axes X, Y, Z pour visualiser l'orientation
		const axisLength = CONFIG.SPHERE_RADIUS * 1.2;

		// Axe X (rouge)
		const xGeometry = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(-axisLength, 0, 0),
			new THREE.Vector3(axisLength, 0, 0)
		]);
		const xMaterial = new THREE.LineBasicMaterial({
			color: 0xff3333,
			transparent: true,
			opacity: 0
		});
		this.scene.add(new THREE.Line(xGeometry, xMaterial));

		// Axe Y (vert)
		const yGeometry = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(0, -axisLength, 0),
			new THREE.Vector3(0, axisLength, 0)
		]);
		const yMaterial = new THREE.LineBasicMaterial({
			color: 0x33ff33,
			transparent: true,
			opacity: 0
		});
		this.scene.add(new THREE.Line(yGeometry, yMaterial));

		// Axe Z (bleu)
		const zGeometry = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(0, 0, -axisLength),
			new THREE.Vector3(0, 0, axisLength)
		]);
		const zMaterial = new THREE.LineBasicMaterial({
			color: 0x3333ff,
			transparent: true,
			opacity: 0
		});
		this.scene.add(new THREE.Line(zGeometry, zMaterial));
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
			opacity: 0,
			vertexColors: true,
			sizeAttenuation: true
		});

		const stars = new THREE.Points(starsGeometry, starsMaterial);
		this.scene.add(stars);
	}

	createPlanets() {
		const planetGeometry = new THREE.SphereGeometry(CONFIG.PLANET_SIZE, 16, 16);

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

			if (planet.region.includes('Deep Core')) {
				depth = 0.5;
			} else if (planet.region.includes('Core Worlds')) {
				depth = 0.4 + Math.random() * 0.2;
			} else if (planet.region.includes('Colonies')) {
				depth = 0.3 + Math.random() * 0.4;
			} else if (planet.region.includes('Mid Rim')) {
				depth = 0.35 + Math.random() * 0.3;
			} else if (planet.region.includes('Outer Rim')) {
				depth = 0.1 + Math.random() * 0.3;
			} else if (planet.region.includes('Unknown')) {
				depth = Math.random();
			}

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

			const color = new THREE.Color(0xFFFFFF);

			const material = new THREE.MeshPhongMaterial({
				color: color,
				emissive: new THREE.Color(planet.color),
				emissiveIntensity: 0,
				shininess: 60,
				transparent: true,
				opacity: 0.95,
				metalness: 0.5
			});

			const mesh = new THREE.Mesh(planetGeometry, material);
			mesh.position.copy(position);
			mesh.userData = planet;
			mesh.userData.originalScale = 1.0;
			mesh.userData.pulseSpeed = 0.5 + Math.random() * 0.5;
			mesh.userData.pulseOffset = Math.random() * Math.PI * 2;

			this.scene.add(mesh);
			this.planetMeshes.push(mesh);

			// Randomiser les éléments autour de la planète
			const hasRing = Math.random() > 0.3;              // 70% ont un anneau
			const hasHalo = Math.random() > 0.2;              // 80% ont un halo

			// Halo lumineux aléatoire
			if (hasHalo) {
				const glowGeometry = new THREE.SphereGeometry(CONFIG.PLANET_SIZE * 2, 16, 16);
				const glowMaterial = new THREE.MeshBasicMaterial({
					color: new THREE.Color(planet.color),
					transparent: true,
					opacity: 0.15,
					side: THREE.BackSide
				});
				const glow = new THREE.Mesh(glowGeometry, glowMaterial);
				glow.userData.parentPlanet = mesh; // Lier au mesh parent
				mesh.add(glow);
			}

			// Anneau orbital aléatoire
			if (hasRing) {
				// Randomiser le style d'anneau
				const ringTypes = ['thin', 'thick', 'scattered'];
				const ringType = ringTypes[Math.floor(Math.random() * ringTypes.length)];

				const ringRadiusMin = CONFIG.PLANET_SIZE * (1.2 + Math.random() * 0.5);
				const ringRadiusMax = CONFIG.PLANET_SIZE * (2 + Math.random() * 0.8);

				const ringGeometry = new THREE.RingGeometry(ringRadiusMin, ringRadiusMax, 32);
				const ringMaterial = new THREE.MeshBasicMaterial({
					color: new THREE.Color(planet.color),
					transparent: true,
					opacity: 0.08 + Math.random() * 0.08,
					side: THREE.DoubleSide
				});
				const ring = new THREE.Mesh(ringGeometry, ringMaterial);
				ring.rotation.x = (Math.random() - 0.5) * Math.PI * 0.8; // Rotation aléatoire
				ring.userData.parentPlanet = mesh; // Lier au mesh parent
				mesh.add(ring);
			}

			console.log(`✨ ${this.planetMeshes.length} planètes créées dans le volume 3D`);
		});
	}

	setupEvents() {
		window.addEventListener('resize', () => this.onWindowResize());
		window.addEventListener('click', (e) => this.onMouseClick(e));
		window.addEventListener('mousemove', (e) => this.onMouseMove(e));

		// Toggle des zones régionales
		const toggleZones = document.getElementById('toggle-zones');
		if (toggleZones) {
			toggleZones.addEventListener('change', (e) => {
				const visible = e.target.checked;

				if (this.regionalSpheres) {
					this.regionalSpheres.forEach(({ sphere, edges }) => {
						sphere.visible = visible;
						edges.visible = visible;
					});
				}
			});
		}
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
		const intersects = this.raycaster.intersectObjects(this.planetMeshes);

		this.planetMeshes.forEach(mesh => {
			if (mesh !== this.selectedPlanet) {
				mesh.userData.hovered = false;
			}
		});

		if (intersects.length > 0) {
			intersects[0].object.userData.hovered = true;
			document.body.style.cursor = 'pointer';
		} else {
			document.body.style.cursor = 'default';
		}
	}

	onMouseClick(event) {
		this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
		this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

		this.raycaster.setFromCamera(this.mouse, this.camera);
		// Chercher les intersections avec TOUS les objets
		const intersects = this.raycaster.intersectObjects(this.scene.children, true);

		if (intersects.length > 0) {
			// Trouver la première intersection valide
			for (let intersection of intersects) {
				let targetMesh = intersection.object;

				// Si c'est un élément enfant (halo, anneau, orbite), trouver la planète parente
				if (targetMesh.parent && targetMesh.parent.userData && targetMesh.parent.userData.region) {
					targetMesh = targetMesh.parent;
				}

				// Vérifier si c'est une planète
				if (targetMesh.userData && targetMesh.userData.name && this.planetMeshes.includes(targetMesh)) {
					this.focusOnPlanet(targetMesh);
					return;
				}
			}
		}
	}

	focusOnPlanet(planetMesh) {
		this.clearPlanetFocus();

		this.selectedPlanet = planetMesh;
		planetMesh.userData.focused = true;

		// Masquer toutes les autres planètes et leurs zones
		this.planetMeshes.forEach(mesh => {
			if (mesh !== planetMesh) {
				mesh.visible = false;
				// Masquer le halo aussi
				mesh.children.forEach(child => {
					child.visible = false;
				});
			}
		});

		// Masquer les zones régionales
		if (this.regionalSpheres) {
			this.regionalSpheres.forEach(({ sphere, edges }) => {
				sphere.visible = false;
				edges.visible = false;
			});
		}

		// Masquer la grille et les étoiles
		this.scene.children.forEach(child => {
			if (child instanceof THREE.Line || child instanceof THREE.Points) {
				if (child !== planetMesh && !planetMesh.children.includes(child)) {
					child.visible = false;
				}
			}
		});

		const planet = planetMesh.userData;
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
                            (${Math.round(planetMesh.position.x)}, ${Math.round(planetMesh.position.y)}, ${Math.round(planetMesh.position.z)})
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

		this.animateCameraTo(planetMesh.position);
	}

	animateCameraTo(targetPosition) {
		// Distance juste en dehors de la planète mais proche
		const finalDistance = CONFIG.PLANET_SIZE * 5;  // ← Augmente ça à 5 ou 6

		const duration = 1.2;
		const startPosition = this.camera.position.clone();
		const startTarget = this.controls.target.clone();
		const startTime = Date.now();

		const initialDirection = startPosition.clone().sub(startTarget).normalize();
		let angle = 0;

		const animate = () => {
			const elapsed = (Date.now() - startTime) / 1000;
			const progress = Math.min(elapsed / duration, 1);

			const eased = 1 - Math.pow(1 - progress, 3);

			angle = eased * Math.PI * 0.3;

			const rotatedDirection = initialDirection.clone();
			const axis = targetPosition.clone().sub(startTarget).normalize();
			const quaternion = new THREE.Quaternion();
			quaternion.setFromAxisAngle(axis, angle);
			rotatedDirection.applyQuaternion(quaternion);

			const cameraPosition = targetPosition.clone()
				.add(rotatedDirection.multiplyScalar(finalDistance));

			this.camera.position.lerpVectors(startPosition, cameraPosition, eased);
			this.controls.target.lerpVectors(startTarget, targetPosition, eased);

			// Ajuster les limites pour ne pas entrer dans la planète
			this.controls.minDistance = CONFIG.PLANET_SIZE * 20;  // ← Min augmenté
			this.controls.maxDistance = CONFIG.PLANET_SIZE * 25;

			this.controls.update();

			if (progress < 1) {
				requestAnimationFrame(animate);
			} else {
				this.camera.position.copy(cameraPosition);
				this.controls.target.copy(targetPosition);
				this.controls.minDistance = CONFIG.PLANET_SIZE * 20;  // ← Min augmenté
				this.controls.maxDistance = CONFIG.PLANET_SIZE * 25;
				this.controls.update();
			}
		};

		animate();
	}


	clearPlanetFocus() {
		if (this.selectedPlanet) {
			this.selectedPlanet.userData.focused = false;
			this.selectedPlanet = null;
		}

		// Réafficher toutes les planètes
		this.planetMeshes.forEach(mesh => {
			mesh.visible = true;
			mesh.children.forEach(child => {
				child.visible = true;
			});
		});

		// Réafficher les zones régionales
		if (this.regionalSpheres) {
			this.regionalSpheres.forEach(({ sphere, edges }) => {
				sphere.visible = true;
				edges.visible = true;
			});
		}

		// Réafficher la grille et les étoiles
		this.scene.children.forEach(child => {
			if (child instanceof THREE.Line || child instanceof THREE.Points) {
				child.visible = true;
			}
		});

		// Restaurer les limites de zoom
		this.controls.minDistance = CONFIG.SPHERE_RADIUS * 0.5;
		this.controls.maxDistance = CONFIG.SPHERE_RADIUS * 4;

		document.getElementById('planet-info').innerHTML = '';
	}

	animate() {
		requestAnimationFrame(() => this.animate());

		const time = Date.now() * 0.001 * CONFIG.ANIMATION_SPEED;

		// Animation des planètes
		this.planetMeshes.forEach(mesh => {
			const pulse = Math.sin(time * mesh.userData.pulseSpeed + mesh.userData.pulseOffset);
			let targetScale = 1.0 + pulse * 0.08;

			if (mesh.userData.hovered) {
				targetScale *= 1.5;
			}

			if (mesh.userData.focused) {
				targetScale *= 2.0;
				const focusPulse = Math.sin(time * 2) * 0.3 + 1;
				targetScale *= focusPulse;
			}

			const currentScale = mesh.scale.x;
			const newScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.1);
			mesh.scale.set(newScale, newScale, newScale);

			mesh.rotation.y += 0.005;
		});

		// Animation subtile des zones régionales (pulsation légère)
		if (this.regionalSpheres) {
			this.regionalSpheres.forEach(({ sphere, edges }) => {
				const pulse = Math.sin(time * 0.3) * 0.03 + 1;
				sphere.scale.setScalar(pulse);
				edges.scale.setScalar(pulse);
			});
		}

		this.controls.update();
		this.renderer.render(this.scene, this.camera);
	}
}

new GalaxyViewer();
