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
		this.planetVelocities = new Map();  // ← Ajouter
		this.selectedPlanet = null;
		this.raycaster = new THREE.Raycaster();
		this.mouse = new THREE.Vector2();

		// Configuration de répulsion
		this.REPULSION_CONFIG = {
			radius: 40,           // Rayon de la zone de répulsion
			strength: 0.8,        // Force de l'écartement (0-1)
			dampingFactor: 0.92   // Amortissement (0-1)
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
		// Réduire l'ambient pour plus de contraste
		const ambientLight = new THREE.AmbientLight(0x1a3a4d, 0.6);
		this.scene.add(ambientLight);

		// Lumière centrale PLUS FORTE et plus chaude (énergie galactique)
		const coreLight = new THREE.PointLight(0xffcc99, 3.5, CONFIG.SPHERE_RADIUS * 4);
		coreLight.position.set(0, 0, 0);
		coreLight.castShadow = true;
		this.scene.add(coreLight);

		// Lumière secondaire (cool, ombre douce)
		const rimLight = new THREE.PointLight(0x6688ff, 1.8, CONFIG.SPHERE_RADIUS * 3.5);
		rimLight.position.set(CONFIG.SPHERE_RADIUS * 1.2, CONFIG.SPHERE_RADIUS * 0.8, -CONFIG.SPHERE_RADIUS * 0.8);
		this.scene.add(rimLight);

		// Lumière de remplissage (accent chaud contre le rim)
		const fillLight = new THREE.PointLight(0xff6644, 1.2, CONFIG.SPHERE_RADIUS * 3);
		fillLight.position.set(-CONFIG.SPHERE_RADIUS * 1.5, -CONFIG.SPHERE_RADIUS * 0.5, CONFIG.SPHERE_RADIUS * 1.2);
		this.scene.add(fillLight);

		// Directional light subtile pour les planètes (contraste XYZ)
		const directional = new THREE.DirectionalLight(0xffffff, 0.4);
		directional.position.set(100, 100, 100);
		directional.target.position.set(0, 0, 0);
		this.scene.add(directional);
		this.scene.add(directional.target);
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

		// Grille volumétrique 3D - Plans de coupe
		this.createVolumetricGrid();

		// Étoiles d'arrière-plan
		this.createStarfield();

		// Axes de coordonnées holographiques
		// this.createCoordinateAxes();
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
			opacity: 0.02,
			side: THREE.DoubleSide,
			depthWrite: false
		});
		const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
		sphere.position.copy(center);
		sphere.userData.region = regionName;
		sphere.visible = false;
		this.scene.add(sphere);

		// Stocker pour animation et toggle
		if (!this.regionalSpheres) this.regionalSpheres = [];
		this.regionalSpheres.push({
			sphere,
			center,
			baseRadius: radius,
			regionName
		});
	}


	createVolumetricGrid() {
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
			}

			// Lignes verticales (X constant)
			for (let x = 0; x <= CONFIG.GRID_SIZE; x++) {
				const points = [];
				for (let y = 0; y <= CONFIG.GRID_SIZE; y++) {
					const pos = this.gridTo3D(x, y, z * 0.5 + 0.5);
					points.push(pos);
				}
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
			opacity: 0.02,
			vertexColors: true,
			sizeAttenuation: true
		});

		const stars = new THREE.Points(starsGeometry, starsMaterial);
		this.scene.add(stars);
	}

	createPlanets() {
		const planetGeometry = new THREE.SphereGeometry(CONFIG.PLANET_SIZE, 16, 16);

		// Grouper les planètes par grille
		const gridGroups = {};
		this.planets.forEach(planet => {
			if (!gridGroups[planet.grid]) {
				gridGroups[planet.grid] = [];
			}
			gridGroups[planet.grid].push(planet);
		});

		this.planets.forEach((planet, index) => {
			const planetsInGrid = gridGroups[planet.grid];

			// Profondeur Z basée sur la région
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

			// Planètes blanches/argentées au lieu de colorées
			const color = new THREE.Color(0xFFFFFF);

			const material = new THREE.MeshPhongMaterial({
				color: color,
				emissive: new THREE.Color(planet.color),
				emissiveIntensity: 0.3,  // ← Ajouter légère émission régionale
				shininess: 120,
				transparent: true,
				opacity: 0.95,
				side: THREE.FrontSide  // ← Éviter les faces arrière
			});


			const mesh = new THREE.Mesh(planetGeometry, material);
			mesh.position.copy(position);
			mesh.userData = planet;
			mesh.userData.originalScale = 1.0;
			mesh.userData.pulseSpeed = 0.5 + Math.random() * 0.5;
			mesh.userData.pulseOffset = Math.random() * Math.PI * 2;
			mesh.userData.originalPosition = position.clone();

			this.planetVelocities.set(mesh, new THREE.Vector3(0, 0, 0));

			this.scene.add(mesh);
			this.planetMeshes.push(mesh);

			// Halo lumineux avec la couleur de la région
			const glowGeometry = new THREE.SphereGeometry(CONFIG.PLANET_SIZE * 2, 16, 16);
			const glowMaterial = new THREE.MeshBasicMaterial({
				color: new THREE.Color(planet.color),
				transparent: true,
				opacity: 0.15,
				side: THREE.BackSide
			});
			const glow = new THREE.Mesh(glowGeometry, glowMaterial);
			mesh.add(glow);

			// Anneau orbital très subtil
			const ringGeometry = new THREE.RingGeometry(
				CONFIG.PLANET_SIZE * 1.5,
				CONFIG.PLANET_SIZE * 2,
				32
			);
			const ringMaterial = new THREE.MeshBasicMaterial({
				color: new THREE.Color(planet.color),
				transparent: true,
				opacity: 0.1,
				side: THREE.DoubleSide
			});
			const ring = new THREE.Mesh(ringGeometry, ringMaterial);
			ring.rotation.x = Math.PI / 2;
			mesh.add(ring);
		});

		console.log(`✨ ${this.planetMeshes.length} planètes créées dans le volume 3D`);
	}

	/**
	 * Calcule et applique les forces de répulsion autour de la planète sélectionnée
	 */
	applyRepulsionForces() {
		if (!this.selectedPlanet) return;

		const selectedPos = this.selectedPlanet.position;
		const { radius, strength, dampingFactor } = this.REPULSION_CONFIG;

		this.planetMeshes.forEach(mesh => {
			if (mesh === this.selectedPlanet) return;

			const distance = mesh.position.distanceTo(selectedPos);

			// Seulement si la planète est dans le rayon de répulsion
			if (distance < radius && distance > 0) {
				// Vecteur de direction (direction d'écartement)
				const direction = mesh.position.clone()
					.sub(selectedPos)
					.normalize();

				// Force diminue avec la distance (plus proche = plus fort)
				const forceMagnitude = (1 - distance / radius) * strength;

				// Récupère ou crée la vélocité
				let velocity = this.planetVelocities.get(mesh);
				if (!velocity) {
					velocity = new THREE.Vector3();
					this.planetVelocities.set(mesh, velocity);
				}

				// Ajoute la force de répulsion
				velocity.add(direction.multiplyScalar(forceMagnitude));
			}
		});
	}

	/**
	 * Restaure toutes les planètes à leur position initiale avec animation
	 */
	restorePlanetsToOriginalPositions(duration = 0.8) {
		const startTime = Date.now();
		const startPositions = new Map(
			this.planetMeshes.map(mesh => [mesh, mesh.position.clone()])
		);

		const animate = () => {
			const elapsed = (Date.now() - startTime) / 1000;
			const progress = Math.min(elapsed / duration, 1);

			// Easing ease-out-cubic pour un mouvement naturel
			const eased = 1 - Math.pow(1 - progress, 3);

			this.planetMeshes.forEach(mesh => {
				const startPos = startPositions.get(mesh);
				const targetPos = mesh.userData.originalPosition;

				mesh.position.lerpVectors(startPos, targetPos, eased);

				// Réinitialiser la vélocité progressivement
				const velocity = this.planetVelocities.get(mesh);
				if (velocity) {
					velocity.multiplyScalar(1 - progress);
				}
			});

			if (progress < 1) {
				requestAnimationFrame(animate);
			}
		};

		animate();
	}

	/**
	 * Applique les vélocités calculées et les amortit
	 */
	updatePlanetVelocities() {
		const { dampingFactor } = this.REPULSION_CONFIG;

		this.planetMeshes.forEach(mesh => {
			const velocity = this.planetVelocities.get(mesh);
			if (velocity && velocity.length() > 0) {
				// Applique la vélocité à la position
				mesh.position.add(velocity);

				// Amortissement (ralentit progressivement)
				velocity.multiplyScalar(dampingFactor);
			}
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
					this.regionalSpheres.forEach(({ sphere }) => {
						sphere.visible = visible;
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
		// Si on change de focus, restaurer d'abord les positions
		if (this.selectedPlanet && this.selectedPlanet !== planetMesh) {
			this.restorePlanetsToOriginalPositions(0.5); // Animation plus rapide
		}

		this.selectedPlanet = planetMesh;
		planetMesh.userData.focused = true;

		// ← Initialiser les vélocités à zéro pour un "burst" initial
		this.planetMeshes.forEach(mesh => {
			if (mesh !== planetMesh) {
				this.planetVelocities.set(mesh, new THREE.Vector3());
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
		const distance = CONFIG.SPHERE_RADIUS * 0.8;
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

	clearPlanetFocus() {
		if (this.selectedPlanet) {
			this.selectedPlanet.userData.focused = false;
			this.selectedPlanet = null;

			// ← Restaurer les positions avec animation
			this.restorePlanetsToOriginalPositions();

			// Réinitialiser les vélocités immédiatement
			this.planetVelocities.forEach((velocity) => {
				velocity.set(0, 0, 0);
			});
		}
		document.getElementById('planet-info').innerHTML = '';
	}

	animate() {
		requestAnimationFrame(() => this.animate());

		const time = Date.now() * 0.001 * CONFIG.ANIMATION_SPEED;

		// ← Appliquer les forces et vélocités
		this.applyRepulsionForces();
		this.updatePlanetVelocities();

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
			this.regionalSpheres.forEach(({ sphere }) => {
				const pulse = Math.sin(time * 0.3) * 0.03 + 1;
				sphere.scale.setScalar(pulse);
			});
		}

		this.controls.update();
		this.renderer.render(this.scene, this.camera);
	}
}

new GalaxyViewer();
