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
 * Parse une coordonnée de grille (ex: "M-10") et retourne {x, y}
 */
function parseGridCoord(gridStr) {
	if (!gridStr || typeof gridStr !== 'string') {
		return null;
	}

	const cleaned = gridStr.trim().replace(/\r\n.*/, ''); // Gérer les multi-lignes
	const match = cleaned.match(/^([A-Z])-(\d+)$/);

	if (match) {
		const letter = match[1];
		const number = parseInt(match[2], 10);

		// A=1, B=2, ..., U=21
		const x = letter.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
		const y = number;

		return { x, y };
	}

	return null;
}

/**
 * Détermine la couleur basée sur la région
 */
function getRegionColor(regionText) {
	if (!regionText) return '#FFE81F';

	const region = regionText.toLowerCase();

	if (region.includes('deep core')) return '#00FFFF';      // Cyan
	if (region.includes('core worlds') || region === 'core') return '#4444FF';  // Bleu
	if (region.includes('inner rim')) return '#6666FF';      // Bleu clair
	if (region.includes('mid rim')) return '#FFAA00';        // Orange
	if (region.includes('expansion region')) return '#FFC800'; // Jaune-orange
	if (region.includes('outer rim')) return '#FF4444';      // Rouge
	if (region.includes('unknown')) return '#FF00FF';        // Magenta
	if (region.includes('wild space')) return '#AA00AA';     // Violet
	if (region.includes('colonies')) return '#00AAFF';       // Bleu clair
	if (region.includes('hutt space')) return '#00FF00';     // Vert

	return '#FFE81F'; // Jaune Star Wars par défaut
}

/**
 * Parse le CSV avec point-virgule comme séparateur
 */
async function parseCSV(csvPath) {
	const content = await fs.readFile(csvPath, 'utf-8');
	const lines = content.split('\n').slice(1); // Skip header

	const planets = [];
	const errors = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line || line === ';;;;') continue;

		// Séparer par point-virgule
		const parts = line.split(';').map(p => p.trim());

		if (parts.length >= 4) {
			const [system, sector, region, grid] = parts;

			// Ignorer les lignes sans système
			if (!system) continue;

			// Parser les coordonnées
			const coords = parseGridCoord(grid);

			if (coords) {
				planets.push({
					name: system,
					sector: sector || 'Unknown',
					region: region || 'Unknown',
					grid: grid.trim(),
					x: coords.x,
					y: coords.y,
					color: getRegionColor(region)
				});
			} else {
				// Log les erreurs pour debug
				if (grid && grid.trim()) {
					errors.push({
						line: i + 2, // +2 car on skip header et index commence à 0
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

		// Sauvegarder en JSON
		const jsonPath = join(__dirname, '../src/planets.json');
		await fs.writeFile(
			jsonPath,
			JSON.stringify(planets, null, 2),
			'utf-8'
		);

		console.log(`\n💾 JSON sauvegardé: ${jsonPath}`);

		// Statistiques
		console.log('\n📊 Statistiques:');
		console.log(`  • Total de planètes: ${planets.length}`);

		// Répartition par région
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

		// Étendue de la galaxie
		const xCoords = planets.map(p => p.x);
		const yCoords = planets.map(p => p.y);

		console.log('\n📍 Étendue de la galaxie:');
		console.log(`  • X: ${Math.min(...xCoords)} à ${Math.max(...xCoords)} (lettres ${String.fromCharCode(64 + Math.min(...xCoords))}-${String.fromCharCode(64 + Math.max(...xCoords))})`);
		console.log(`  • Y: ${Math.min(...yCoords)} à ${Math.max(...yCoords)}`);

		// Exemples de planètes célèbres
		const famousPlanets = [
			'Tatooine', 'Coruscant', 'Alderaan', 'Naboo', 'Hoth',
			'Endor', 'Dagobah', 'Mustafar', 'Kamino', 'Ahch-To'
		];

		console.log('\n⭐ Planètes célèbres trouvées:');
		famousPlanets.forEach(name => {
			const planet = planets.find(p => p.name === name);
			if (planet) {
				console.log(`  ✓ ${planet.name.padEnd(15)} - ${planet.grid.padEnd(6)} - ${planet.region}`);
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
