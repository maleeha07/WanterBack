const MATCH_LIMIT = 5;
const MIN_MATCH_SCORE = 0.18;
const DASHBOARD_MATCH_THRESHOLD = 0.70;

function matchTokens(value) {
  return new Set(
    String(value || '')
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu) || []
  );
}

function textSimilarity(left, right) {
  const a = matchTokens(left);
  const b = matchTokens(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((token) => {
    if (b.has(token)) shared += 1;
  });
  return (2 * shared) / (a.size + b.size);
}

function hiddenClues(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  const clues = text.split(/[,;\n|]+/).map((part) => part.trim()).filter(Boolean);
  return clues.length ? clues : [text];
}

function hiddenDetailMatches(lostDetails, foundDetails) {
  const clues = hiddenClues(lostDetails);
  const foundClues = hiddenClues(foundDetails);
  let matches = 0;
  clues.forEach((clue) => {
    if (foundClues.some((foundClue) => textSimilarity(clue, foundClue) >= 0.34)) {
      matches += 1;
    }
  });
  return { matches: matches, total: clues.length };
}

function distanceInKm(a, b) {
  if (a.lat === null || a.lat === undefined || a.lng === null || a.lng === undefined ||
      b.lat === null || b.lat === undefined || b.lng === null || b.lng === undefined) {
    return null;
  }
  const lat1 = Number(a.lat);
  const lon1 = Number(a.lng);
  const lat2 = Number(b.lat);
  const lon2 = Number(b.lng);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const haversine = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function locationSimilarity(a, b) {
  const distance = distanceInKm(a, b);
  if (distance !== null) {
    if (distance <= 1) return 1;
    if (distance <= 5) return 0.8;
    if (distance <= 20) return 0.55;
    if (distance <= 80) return 0.25;
    return 0;
  }
  return a.location_name && b.location_name &&
    a.location_name.trim().toLocaleLowerCase() === b.location_name.trim().toLocaleLowerCase()
    ? 1
    : 0;
}

function peopleSimilarity(lost, found) {
  const components = [];
  if (lost.age_range && found.age_range) {
    components.push(lost.age_range === found.age_range ? 1 : 0);
  }
  const clothingScore = textSimilarity(lost.clothing, found.clothing);
  if (lost.clothing && found.clothing) components.push(clothingScore);
  const languageScore = textSimilarity(lost.language_spoken, found.language_spoken);
  if (lost.language_spoken && found.language_spoken) components.push(languageScore);
  if (!components.length) return null;
  return components.reduce((total, value) => total + value, 0) / components.length;
}

function scorePair(lost, found, isPerson) {
  const visibleScore = textSimilarity(
    [lost.title, lost.public_details].filter(Boolean).join(' '),
    [found.title, found.public_details].filter(Boolean).join(' ')
  );
  const hidden = hiddenDetailMatches(lost.hidden_details, found.hidden_details);
  const locationScore = locationSimilarity(lost, found);
  const placeScore = lost.place_type && found.place_type
    ? (lost.place_type === found.place_type ? 1 : 0.15)
    : null;
  const personScore = isPerson ? peopleSimilarity(lost, found) : null;

  const weighted = [
    { value: visibleScore, weight: 0.42 },
    { value: hidden.total ? hidden.matches / hidden.total : null, weight: 0.36 },
    { value: locationScore, weight: 0.12 },
    { value: placeScore, weight: 0.05 },
    { value: personScore, weight: 0.15 }
  ].filter((component) => component.value !== null);
  const weightTotal = weighted.reduce((total, component) => total + component.weight, 0);
  const score = weighted.reduce((total, component) => total + component.value * component.weight, 0) / weightTotal;
  return {
    score: Math.max(0, Math.min(1, score)),
    hasTextEvidence: visibleScore >= 0.12 || hidden.matches > 0,
    hiddenMatches: hidden.matches,
    hiddenTotal: hidden.total
  };
}

async function findMatches(report, isPerson, side) {
  const reportSide = side || 'found';
  if (!report || (reportSide !== 'lost' && reportSide !== 'found')) {
    throw new TypeError('A report and a valid lost/found side are required to find matches.');
  }

  const suffix = isPerson ? 'people' : 'items';
  const lostTable = 'lost_' + suffix;
  const foundTable = 'found_' + suffix;
  if (DB.isBackendReady) {
    return (await DB.findBackendMatches(reportSide === 'lost' ? lostTable : foundTable, report.id))
      .filter((match) => match.score >= MIN_MATCH_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MATCH_LIMIT);
  }
  let lostRows;
  let foundRows;

  if (reportSide === 'lost') {
    lostRows = [report];
    foundRows = await DB.fetch(foundTable);
  } else {
    lostRows = await DB.fetch(lostTable);
    foundRows = [report];
  }

  const matches = [];
  lostRows.filter((row) => row.status === 'open').forEach((lost) => {
    foundRows.filter((row) => row.status === 'open').forEach((found) => {
      if (lost.id && found.id && lost.id === found.id) return;
      const result = scorePair(lost, found, isPerson);
      if (result.hasTextEvidence && result.score >= MIN_MATCH_SCORE) {
        matches.push({
          candidate: lost,
          found: found,
          score: result.score,
          hiddenMatches: result.hiddenMatches,
          hiddenTotal: result.hiddenTotal
        });
      }
    });
  });

  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, MATCH_LIMIT);
}

async function findAccountMatches(reports, isPerson) {
  const results = await Promise.all(reports.map(async (report) => {
    const side = report.reportTable.startsWith('lost_') ? 'lost' : 'found';
    if (report.status !== 'open') return [];
    const matches = await findMatches(report, isPerson, side);
    return matches
      .filter((match) => match.score > DASHBOARD_MATCH_THRESHOLD)
      .map((match) => ({ ...match, report: report, reportSide: side }));
  }));
  return results.flat().sort((a, b) => b.score - a.score);
}