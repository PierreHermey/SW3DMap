#!/usr/bin/env node

/**
 * Script pour convertir star_wars_galaxy.csv en JSON pour Three.js
 */

import fs from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Biomes disponibles (génériques)
 */
const AVAILABLE_GENERIC_BIOMES = ['volcanic', 'oceanic'];

/**
 * Couleurs par biome (pour affichage low-res dans la galaxie)
 */
const BIOME_COLORS = {
	volcanic: '#ff4500',
	coruscant: '#808080',
	desert: '#d4a574',
	ice: '#e0f6ff',
	oceanic: '#1a4d7a',
	earth: '#3d5c1d',
};

/**
 * Couleurs par région (pour les nuages régionaux)
 */
const REGION_COLORS = {
	'Deep Core': '#ffffff',      // Blanc
	'Core Worlds': '#fcd788',    // Jaune clair
	'Inner Rim': '#f6b16b',      // Orange clair
	'Mid Rim': '#b939af',        // Fuschia
	'Expansion Region': '#85ddf1', // Bleu clair
	'Outer Rim': '#00ffd9',      // Cyan
	'Outer Rim Territories': '#00ffd9', // Cyan
	'Unknown Regions': '#9a9a9a', // Gris
	'Wild Space': '#41ff00',     // Vert
	'Colonies': '#c687f8',       // Violet clair
	'Hutt Space': '#ff0000',     // Rouge
};

/**
 * Vérifie si une texture existe pour une planète (chemin de la texture spécifique)
 */
async function checkPlanetTextureExists(planetName) {
	const texturePath = join(__dirname, `../src/assets/planets/${planetName}/${planetName}_diffuse.png`);
	try {
		await fs.access(texturePath);
		return true; // Texture trouvée
	} catch {
		return false; // Texture non trouvée
	}
}

/**
 * Parse une coordonnée de grille (ex: "M-10") et retourne {x, y}
 */
function parseGridCoord(gridStr) {
	if (!gridStr || typeof gridStr !== 'string') {
		return null;
	}

	const cleaned = gridStr.trim().replace(/\r\n.*/, '');
	const match = cleaned.match(/^([A-Z])-(\d+)$/);

	if (match) {
		const letter = match[1];
		const number = parseInt(match[2], 10);
		const x = letter.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
		const y = number;
		return { x, y };
	}

	return null;
}

/**
 * Détermine le biome d'une planète
 * 1. Si une texture spécifique existe dans assets/planets/{planetName}, l'utilise
 * 2. Sinon, en assigne une aléatoire de assets/textures
 */
async function determinePlanetBiome(planetName) {
	const hasSpecificTexture = await checkPlanetTextureExists(planetName);

	if (hasSpecificTexture) {
		return planetName.toLowerCase(); // ex: 'coruscant', 'naboo'
	}

	// Assigner un biome générique aléatoire
	const randomBiome = AVAILABLE_GENERIC_BIOMES[
		Math.floor(Math.random() * AVAILABLE_GENERIC_BIOMES.length)
		];
	return randomBiome;
}

/**
 * Détermine la couleur basée sur le biome
 */
function getBiomeColor(biome) {
	return BIOME_COLORS[biome] || '#FFE81F';
}

/**
 * Détermine la couleur basée sur la région
 */
function getRegionColor(regionText) {
	if (!regionText) return '#FFE81F';

	for (const [region, color] of Object.entries(REGION_COLORS)) {
		if (regionText.toLowerCase().includes(region.toLowerCase())) {
			return color;
		}
	}

	return '#FFE81F';
}

/**
 * Parse le CSV avec point-virgule comme séparateur
 */
async function parseCSV(csvPath) {
	const content = await fs.readFile(csvPath, 'utf-8');
	const lines = content.split('\n').slice(1);

	const planets = [];
	const errors = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line || line === ';;;;') continue;

		const parts = line.split(';').map(p => p.trim());

		if (parts.length >= 4) {
			const [system, sector, region, grid] = parts;

			if (!system) continue;

			const coords = parseGridCoord(grid);

			if (coords) {
				// ← DÉTERMINER LE BIOME (sync → async)
				const biome = await determinePlanetBiome(system);
				const biomeColor = getBiomeColor(biome);
				const regionColor = getRegionColor(region);

				planets.push({
					name: system,
					sector: sector || 'Unknown',
					region: region || 'Unknown',
					grid: grid.trim(),
					x: coords.x,
					y: coords.y,
					biome: biome,
					color: biomeColor,
					regionColor: regionColor
				});
			} else {
				if (grid && grid.trim()) {
					errors.push({
						line: i + 2,
						system,
						grid: grid.trim(),
						reason: 'Invalid grid format'
					});
				}
			}
		}
	}

	return { planets, errors };
}

/**
 * Fonction principale
 */
async function main() {
	console.log('🌌 Star Wars Galaxy CSV → JSON Converter');
	console.log('='.repeat(50));

	const csvPath = join(__dirname, '../assets/star_wars_galaxy.csv');

	try {
		await fs.access(csvPath);
	} catch (error) {
		console.error(`❌ Erreur: Le fichier ${csvPath} n'existe pas`);
		console.log('💡 Placez star_wars_galaxy.csv dans le dossier assets/');
		process.exit(1);
	}

	try {
		console.log(`📖 Lecture du CSV: ${csvPath}`);

		const { planets, errors } = await parseCSV(csvPath);

		console.log(`\n✅ ${planets.length} planètes converties`);

		if (errors.length > 0) {
			console.log(`\n⚠️  ${errors.length} erreurs de parsing:`);
			errors.slice(0, 5).forEach(err => {
				console.log(`  • Ligne ${err.line}: ${err.system} - ${err.grid} (${err.reason})`);
			});
			if (errors.length > 5) {
				console.log(`  ... et ${errors.length - 5} autres erreurs`);
			}
		}

		const jsonPath = join(__dirname, '../src/planets.json');
		await fs.writeFile(
			jsonPath,
			JSON.stringify(planets, null, 2),
			'utf-8'
		);

		console.log(`\n💾 JSON sauvegardé: ${jsonPath}`);

		console.log('\n📊 Statistiques:');
		console.log(`  • Total de planètes: ${planets.length}`);

		const regions = {};
		planets.forEach(p => {
			regions[p.region] = (regions[p.region] || 0) + 1;
		});

		console.log('\n🗺️  Répartition par région (Top 10):');
		Object.entries(regions)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.forEach(([region, count]) => {
				console.log(`  • ${region.padEnd(25)} ${count}`);
			});

		const biomes = {};
		planets.forEach(p => {
			biomes[p.biome] = (biomes[p.biome] || 0) + 1;
		});

		console.log('\n🌍 Répartition par biome:');
		Object.entries(biomes)
			.sort((a, b) => b[1] - a[1])
			.forEach(([biome, count]) => {
				console.log(`  • ${biome.padEnd(15)} ${count}`);
			});

		const xCoords = planets.map(p => p.x);
		const yCoords = planets.map(p => p.y);

		console.log('\n📍 Étendue de la galaxie:');
		console.log(`  • X: ${Math.min(...xCoords)} à ${Math.max(...xCoords)} (lettres ${String.fromCharCode(64 + Math.min(...xCoords))}-${String.fromCharCode(64 + Math.max(...xCoords))})`);
		console.log(`  • Y: ${Math.min(...yCoords)} à ${Math.max(...yCoords)}`);

		const famousPlanets = [
			'Tatooine', 'Coruscant', 'Alderaan', 'Naboo', 'Hoth',
			'Endor', 'Dagobah', 'Mustafar', 'Kamino', 'Ahch-To'
		];

		console.log('\n⭐ Planètes célèbres trouvées:');
		famousPlanets.forEach(name => {
			const planet = planets.find(p => p.name === name);
			if (planet) {
				console.log(`  ✓ ${planet.name.padEnd(15)} - ${planet.grid.padEnd(6)} - ${planet.biome.padEnd(12)} - ${planet.region}`);
			} else {
				console.log(`  ✗ ${name.padEnd(15)} - Non trouvée`);
			}
		});

		console.log('\n🚀 Prêt pour Three.js!');
		console.log('   Lancez: npm run dev');

	} catch (error) {
		console.error('❌ Erreur lors de la conversion:', error);
		process.exit(1);
	}
}

main();
