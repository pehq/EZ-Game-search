// server.js - This is the main file for your Glitch proxy server.
// It uses Express to handle incoming requests from your Roblox game
// and node-fetch to make requests to the Roblox API.

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
  console.log('Received request for /get-place-details');
  console.log('Query parameters:', req.query);

  // Extract placeIds from the query parameters.
  // req.query.placeIds might be a string like "123,456" or an array if sent multiple times.
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

  // Construct the query string for the Roblox API.
  // Roblox's multiget-place-details expects repeated 'placeIds' parameters.
  const robloxApiQueryParams = placeIds.map(id => `placeIds=${encodeURIComponent(id)}`).join('&');
  const fullRobloxApiUrl = `${ROBLOX_API_BASE_URL}?${robloxApiQueryParams}`;

  console.log('Forwarding request to Roblox API:', fullRobloxApiUrl);

  try {
    // Make the request to the actual Roblox API, including the .ROBLOSECURITY cookie.
    const robloxResponse = await fetch(fullRobloxApiUrl, {
      method: 'GET',
      headers: {
        'Cookie': `.ROBLOSECURITY=${ROBLOSECURITY_COOKIE}`,
        'Accept': 'application/json'
      }
    });

    // Check if the Roblox API returned an error status (e.g., 401, 404, 500)
    if (!robloxResponse.ok) {
      const errorText = await robloxResponse.text(); // Get raw error response
      console.error(`Roblox API returned an error: ${robloxResponse.status} ${robloxResponse.statusText} - ${errorText}`);
      // Forward the error status and message back to the Roblox game
      return res.status(robloxResponse.status).json({
        error: `Roblox API Error: ${robloxResponse.status} ${robloxResponse.statusText}`,
        details: errorText
      });
    }

    // Parse the JSON response from Roblox
    const data = await robloxResponse.json();

    // Send the data back to the Roblox game
    console.log('Successfully fetched data from Roblox API, sending back to client.');
    res.json(data);

  } catch (error) {
    // Catch any network errors or other exceptions during the fetch operation
    console.error('Error fetching from Roblox API:', error);
    res.status(500).json({ error: 'Internal server error when fetching from Roblox API.', details: error.message });
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
