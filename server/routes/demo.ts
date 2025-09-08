import { DemoResponse } from "@shared/api";
import { db } from '../db/db';
import express from 'express';
import { getAllUsers } from '../models/Users';
const router = express.Router();

// Player stats as JSON
router.get('/playerstats', (req, res) => {
  db.all('SELECT * FROM player_stats', [], (err, rows) => {
    if (err) return res.status(500).send('DB error');
    res.type('application/json').send(JSON.stringify(rows, null, 2));
  });
});

// Match stats as JSON
router.get('/matchstats', (req, res) => {
  db.all('SELECT * FROM game_results', [], (err, rows) => {
    if (err) return res.status(500).send('DB error');
    res.type('application/json').send(JSON.stringify(rows, null, 2));
  });
});

// Tournament list from DB
router.get('/tournament', (req, res) => {
  db.all('SELECT * FROM tournaments', [], (err, rows) => {
    if (err) return res.status(500).send('DB error');
    res.type('application/json').send(JSON.stringify(rows, null, 2));
  });
});

export default router;
import { DemoResponse } from "@shared/api";

export const handleDemo = (): DemoResponse => {
  return {
    message: "Hello from Fastify server",
  };
};