const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const shortid = require('shortid');
const http = require('http');
const WebSocket = require('ws');
const dns = require('dns');

// FORCE IPv6 FOR SUPABASE (if needed)
dns.setDefaultResultOrder('verbatim');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
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

// Create stars table
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
    if (!message || message.length > 1000) {
        return res.status(400).json({ error: 'Message must be 1-1000 chars.' });
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
            link: `https://lost-stars-frontend.vercel.app/star/${result.rows[0].hash_id}`
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'The cosmos rejected your star.' });
    }
});

// API: Get all stars
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
        console.error('Error fetching stars:', err);
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
        console.error('Error fetching star:', err);
        res.status(500).json({ error: 'Telescope is broken.' });
    }
});
// TEMPORARY: Add hash_id column to existing stars
app.get('/api/fix-db', async (req, res) => {
    try {
        // Check if hash_id column exists
        const check = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'stars' AND column_name = 'hash_id'
        `);
        
        if (check.rows.length === 0) {
            // Add the column
            await pool.query(`
                ALTER TABLE stars ADD COLUMN hash_id VARCHAR(12) UNIQUE
            `);
            res.json({ success: true, message: 'hash_id column added!' });
        } else {
            res.json({ success: true, message: 'hash_id column already exists' });
        }
    } catch (err) {
        console.error('Error fixing DB:', err);
        res.status(500).json({ error: err.message });
    }
});
// 🎂 BIRTHDAY SPECIAL: Delete ALL stars
app.get('/api/delete-all-stars', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM stars');
        res.json({ 
            success: true, 
            message: `✨ All ${result.rowCount} stars have been deleted. The void is clean!` 
        });
    } catch (err) {
        console.error('Error deleting stars:', err);
        res.status(500).json({ error: 'Failed to delete stars.' });
    }
});

// Delete a specific star by hash_id
app.delete('/api/star/:hash_id', async (req, res) => {
    const { hash_id } = req.params;
    try {
        const result = await pool.query(
            'DELETE FROM stars WHERE hash_id = $1 RETURNING *',
            [hash_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Star not found' });
        }
        res.json({ 
            success: true, 
            message: '💫 Star has been deleted',
            deleted: result.rows[0]
        });
    } catch (err) {
        console.error('Error deleting star:', err);
        res.status(500).json({ error: 'Failed to delete star' });
    }
});

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`✨ Lost Stars burning on http://localhost:${PORT}`);
    console.log('📡 WebSocket server ready for shooting stars!');
});