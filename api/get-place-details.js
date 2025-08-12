const fetch = require('node-fetch');

const ROBLOSECURITY_COOKIE = process.env.ROBLOSECURITY_COOKIE;
const ROBLOX_API_BASE_URL = "https://games.roblox.com/v1/games/multiget-place-details";
const BATCH_SIZE = 50;

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== "GET") {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let placeIds = req.query.placeIds;
  if (!placeIds) {
    return res.status(400).json({ error: 'Missing placeIds parameter.' });
  }

  if (typeof placeIds === 'string') {
    placeIds = placeIds.split(',').map(id => id.trim());
  } else if (!Array.isArray(placeIds)) {
    return res.status(400).json({ error: 'Invalid placeIds format.' });
  }

  // Validate placeIds are numbers
  const validPlaceIds = placeIds.filter(id => !isNaN(parseInt(id)));
  if (validPlaceIds.length === 0) {
    return res.status(400).json({ error: 'No valid place IDs provided.' });
  }

  let allResults = [];
  let errors = [];

  for (let i = 0; i < validPlaceIds.length; i += BATCH_SIZE) {
    const batch = validPlaceIds.slice(i, i + BATCH_SIZE);
    const params = batch.map(id => `placeIds=${encodeURIComponent(id)}`).join('&');
    const url = `${ROBLOX_API_BASE_URL}?${params}`;

    try {
      const robloxResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'Cookie': `.ROBLOSECURITY=${ROBLOSECURITY_COOKIE}`,
          'Accept': 'application/json',
          'User-Agent': 'Roblox/WinInet'
        }
      });

      if (!robloxResponse.ok) {
        const errorText = await robloxResponse.text();
        errors.push({
          batchIndex: i,
          status: robloxResponse.status,
          statusText: robloxResponse.statusText,
          details: errorText
        });
        continue;
      }

      const data = await robloxResponse.json();
      if (Array.isArray(data)) {
        allResults = allResults.concat(data);
      } else {
        allResults.push(data);
      }
    } catch (error) {
      errors.push({
        batchIndex: i,
        status: 500,
        statusText: 'Internal Server Error',
        details: error.message
      });
    }
  }

  if (errors.length > 0 && allResults.length === 0) {
    return res.status(500).json({ error: 'All requests failed', errors });
  }

  if (errors.length > 0) {
    res.status(200).json({ data: allResults, errors, message: 'Some batches failed.' });
  } else {
    res.status(200).json({ data: allResults });
  }
};