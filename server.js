// server.js - This is the main file for your Glitch proxy server.
// It uses Express to handle incoming requests and node-fetch to make
// requests to the Roblox API.

// Import necessary modules
const express = require('express');
const fetch = require('node-fetch'); // For making HTTP requests

// Initialize the Express application
const app = express();

// --- Configuration ---
// Get the sensitive .ROBLOSECURITY cookie from environment variables.
// This is the secure way to store secrets on Glitch.
const ROBLOSECURITY_COOKIE = process.env.ROBLOSECURITY_COOKIE;

// Base URL for the official Roblox API endpoint
const ROBLOX_API_BASE_URL = "https://games.roblox.com/v1/games/multiget-place-details";

// Define the maximum number of placeIds to send in a single request to Roblox.
// This helps avoid "400 Bad Request" errors due to URL length limits.
const BATCH_SIZE = 50; // You can adjust this if needed, but 50 is a common safe number.

// --- Middleware ---
// Enable CORS (Cross-Origin Resource Sharing)
// This is essential for your Roblox game to be able to make requests to this server.
// The "*" allows requests from any origin. For production, you might want to
// restrict this to your specific Roblox game's domain if possible.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// --- Routes ---

// Define a GET endpoint for your Roblox game to query place details.
// Example usage from Roblox: https://your-glitch-project.glitch.me/get-place-details?placeIds=123,456
app.get('/get-place-details', async (req, res) => {
  // Log the incoming request for debugging

  // Extract placeIds from the query parameters.
  let placeIds = req.query.placeIds;

  if (!placeIds) {
    // If no placeIds are provided, return an error.
    return res.status(400).json({ error: 'Missing placeIds parameter.' });
  }

  // Ensure placeIds is an array. If it's a comma-separated string, split it.
  if (typeof placeIds === 'string') {
    placeIds = placeIds.split(',').map(id => id.trim());
  } else if (!Array.isArray(placeIds)) {
    // If it's neither a string nor an array, it's an invalid format.
    return res.status(400).json({ error: 'Invalid placeIds format. Must be a comma-separated string or an array.' });
  }


  let allResults = [];
  let errors = [];

  // Iterate through the placeIds in batches
  for (let i = 0; i < placeIds.length; i += BATCH_SIZE) {
    const batch = placeIds.slice(i, i + BATCH_SIZE);
    const robloxApiQueryParams = batch.map(id => `placeIds=${encodeURIComponent(id)}`).join('&');
    const fullRobloxApiUrl = `${ROBLOX_API_BASE_URL}?${robloxApiQueryParams}`;

    try {
      const robloxResponse = await fetch(fullRobloxApiUrl, {
        method: 'GET',
        headers: {
          'Cookie': `.ROBLOSECURITY=${ROBLOSECURITY_COOKIE}`,
          'Accept': 'application/json'
        }
      });

      if (!robloxResponse.ok) {
        const errorText = await robloxResponse.text();
        console.error(`Roblox API returned an error for batch: ${robloxResponse.status} ${robloxResponse.statusText} - ${errorText}`);
        errors.push({
          batchIndex: i,
          status: robloxResponse.status,
          statusText: robloxResponse.statusText,
          details: errorText
        });
        // Continue to the next batch even if one fails, to get as much data as possible
        continue;
      }

      const data = await robloxResponse.json();
      allResults = allResults.concat(data); // Add batch results to overall results

    } catch (error) {
      console.error(`Error fetching from Roblox API for batch ${i / BATCH_SIZE + 1}:`, error);
      errors.push({
        batchIndex: i,
        status: 500, // Internal server error
        statusText: 'Internal Server Error',
        details: error.message
      });
      continue;
    }
  }

  // Send the combined data and any errors back to the Roblox game
  if (errors.length > 0) {
    // If there were any errors in batches, return a 200 OK but include the errors
    // so the Roblox client can see partial data and the issues.
    res.status(200).json({
      data: allResults,
      errors: errors,
      message: 'Some batches failed to fetch data from Roblox API.'
    });
  } else {
    res.json(allResults);
  }
});

// --- Server Start ---
// Listen for requests on the port Glitch provides (process.env.PORT)
const listener = app.listen(process.env.PORT, () => {
  console.log('Your app is listening on port ' + listener.address().port);
  if (!ROBLOSECURITY_COOKIE) {
    console.warn('WARNING: ROBLOSECURITY_COOKIE is not set in your .env file!');
    console.warn('The proxy will likely fail to authenticate with Roblox APIs.');
  }
});