const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const shortid = require('shortid');
const http = require('http');
const WebSocket = require('ws');
const dns = require('dns');

dns.setDefaultResultOrder('verbatim');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// ⚠️ IMPORTANT: Change 'YOUR_PASSWORD' to your PostgreSQL password!
const pool = new Pool({
    host: '2406:da1a:82a:9d01:1b8f:f7d5:c603:2a23',  // IPv6 address
    port: 5432,
    user: 'postgres',
    password: '123',
    database: 'postgres',
    ssl: {
        rejectUnauthorized: false
    }
});
// Test database connection
pool.connect((err) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
    } else {
        console.log('✅ Connected to PostgreSQL!');
    }
});

// Create the stars table
const createTableQuery = `
CREATE TABLE IF NOT EXISTS stars (
    id SERIAL PRIMARY KEY,
    hash_id VARCHAR(12) UNIQUE NOT NULL,
    message TEXT NOT NULL,
    color_hue FLOAT DEFAULT 0.55,
    emotion VARCHAR(20),
    pos_x FLOAT NOT NULL,
    pos_y FLOAT NOT NULL,
    pos_z FLOAT NOT NULL,
    brightness FLOAT DEFAULT 0.5,
    view_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '90 days')
);
`;

pool.query(createTableQuery)
    .then(() => console.log('✅ Stars table ready'))
    .catch(err => console.error('❌ Table creation failed:', err));

// API: Post a new star
app.post('/api/stars', async (req, res) => {
    const { message, emotion } = req.body;
    if (!message || message.length > 280) {
        return res.status(400).json({ error: 'Message must be 1-280 chars.' });
    }

    const hash_id = shortid.generate();
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    const radius = 8 + (Math.random() * 4);

    const pos_x = radius * Math.sin(phi) * Math.cos(theta);
    const pos_y = radius * Math.sin(phi) * Math.sin(theta);
    const pos_z = radius * Math.cos(phi);
    
    let color_hue = 0.55;
    if (emotion === 'love') color_hue = 0.0;
    if (emotion === 'miss') color_hue = 0.6;
    if (emotion === 'hope') color_hue = 0.12;

    try {
        const result = await pool.query(
            `INSERT INTO stars (hash_id, message, emotion, pos_x, pos_y, pos_z, color_hue) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING hash_id`,
            [hash_id, message, emotion, pos_x, pos_y, pos_z, color_hue]
        );

        // Broadcast to all connected clients
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ 
                    type: 'NEW_STAR', 
                    data: { x: pos_x, y: pos_y, z: pos_z, hue: color_hue } 
                }));
            }
        });

        res.json({ 
            success: true, 
            hash_id: result.rows[0].hash_id,
            link: `http://localhost:3000/star/${result.rows[0].hash_id}`
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'The cosmos rejected your star.' });
    }
});

// API: Fetch tonight's stars
app.get('/api/sky', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT hash_id, message, pos_x, pos_y, pos_z, color_hue, brightness, 
                    EXTRACT(EPOCH FROM created_at) as timestamp 
             FROM stars 
             WHERE expires_at > NOW() 
             ORDER BY brightness DESC LIMIT 2000`
        );
        res.json({ stars: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Sky is cloudy.' });
    }
});

// API: Get a specific star
app.get('/api/star/:hash_id', async (req, res) => {
    const { hash_id } = req.params;
    try {
        const result = await pool.query(
            `UPDATE stars SET view_count = view_count + 1 
             WHERE hash_id = $1 
             RETURNING message, pos_x, pos_y, pos_z, color_hue, created_at`,
            [hash_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Star has faded into dust.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Telescope is broken.' });
    }
});

// Start the server
const PORT = 4000;
server.listen(PORT, () => {
    console.log(`✨ Lost Stars burning on http://localhost:${PORT}`);
    console.log('📡 WebSocket server ready for shooting stars!');
});