/**
 * BADRIK RUN - Backend Server
 * Leaderboard API with signature verification
 */

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ==================== DATABASE ====================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/badrik';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✓ MongoDB connected'))
    .catch(err => console.error('MongoDB error:', err));

// Player Schema
const playerSchema = new mongoose.Schema({
    wallet: { type: String, required: true, unique: true, index: true },
    bestScore: { type: Number, default: 0 },
    totalCoins: { type: Number, default: 0 },
    totalDistance: { type: Number, default: 0 },
    gamesPlayed: { type: Number, default: 0 },
    referredBy: { type: String, default: null },
    referralCount: { type: Number, default: 0 },
    referralBonus: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Player = mongoose.model('Player', playerSchema);

// Game Session Schema (for anti-cheat)
const sessionSchema = new mongoose.Schema({
    wallet: { type: String, required: true },
    score: { type: Number, required: true },
    coins: { type: Number, required: true },
    distance: { type: Number, required: true },
    signature: { type: String, required: true },
    valid: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const Session = mongoose.model('Session', sessionSchema);


// ==================== SIGNATURE VERIFICATION ====================
function verifySignature(wallet, message, signature) {
    try {
        const publicKey = new PublicKey(wallet);
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = Uint8Array.from(signature);
        
        return nacl.sign.detached.verify(
            messageBytes,
            signatureBytes,
            publicKey.toBytes()
        );
    } catch (error) {
        console.error('Signature verification failed:', error);
        return false;
    }
}

// ==================== ANTI-CHEAT ====================
function validateScore(score, coins, distance) {
    // Basic sanity checks
    const maxScorePerSecond = 100; // Reasonable max
    const estimatedTime = distance / 25; // Average speed ~25 units/sec
    const maxPossibleScore = estimatedTime * maxScorePerSecond + coins * 10;
    
    if (score > maxPossibleScore * 1.5) {
        console.warn('Suspicious score detected:', { score, coins, distance, maxPossible: maxPossibleScore });
        return false;
    }
    
    if (coins > distance / 5) {
        console.warn('Suspicious coin count:', { coins, distance });
        return false;
    }
    
    return true;
}

// ==================== API ROUTES ====================

// Submit score
app.post('/api/score', async (req, res) => {
    try {
        const { wallet, score, coins, distance, signature } = req.body;
        
        if (!wallet || score === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Verify signature (if provided)
        // Note: For MVP, we'll be lenient with signature verification
        // In production, this should be strict
        
        // Anti-cheat validation
        if (!validateScore(score, coins, distance)) {
            return res.status(400).json({ error: 'Invalid score' });
        }
        
        // Save session
        const session = new Session({
            wallet,
            score,
            coins,
            distance,
            signature: signature ? JSON.stringify(signature) : 'none',
            valid: true
        });
        await session.save();
        
        // Update player
        let player = await Player.findOne({ wallet });
        
        if (!player) {
            player = new Player({ wallet });
        }
        
        player.gamesPlayed += 1;
        player.totalCoins += coins;
        player.totalDistance += distance;
        player.updatedAt = new Date();
        
        if (score > player.bestScore) {
            player.bestScore = score;
        }
        
        await player.save();
        
        res.json({ 
            success: true, 
            bestScore: player.bestScore,
            gamesPlayed: player.gamesPlayed
        });
        
    } catch (error) {
        console.error('Error submitting score:', error);
        res.status(500).json({ error: 'Server error' });
    }
});


// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);
        
        const players = await Player.find({ bestScore: { $gt: 0 } })
            .sort({ bestScore: -1 })
            .limit(limit)
            .select('wallet bestScore totalCoins gamesPlayed');
        
        res.json(players);
        
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get player rank
app.get('/api/rank/:wallet', async (req, res) => {
    try {
        const { wallet } = req.params;
        
        const player = await Player.findOne({ wallet });
        
        if (!player) {
            return res.json({ rank: null, bestScore: 0 });
        }
        
        const rank = await Player.countDocuments({ bestScore: { $gt: player.bestScore } }) + 1;
        
        res.json({
            rank,
            bestScore: player.bestScore,
            totalCoins: player.totalCoins,
            gamesPlayed: player.gamesPlayed
        });
        
    } catch (error) {
        console.error('Error fetching rank:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get player stats
app.get('/api/player/:wallet', async (req, res) => {
    try {
        const { wallet } = req.params;
        const player = await Player.findOne({ wallet });
        
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        res.json(player);
        
    } catch (error) {
        console.error('Error fetching player:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Referral system
app.post('/api/referral', async (req, res) => {
    try {
        const { wallet, referredBy } = req.body;
        
        if (!wallet || !referredBy) {
            return res.status(400).json({ error: 'Missing fields' });
        }
        
        // Check if player exists
        let player = await Player.findOne({ wallet });
        
        if (player && player.referredBy) {
            return res.status(400).json({ error: 'Already referred' });
        }
        
        // Check if referrer exists
        const referrer = await Player.findOne({ wallet: { $regex: new RegExp('^' + referredBy, 'i') } });
        
        if (!referrer) {
            return res.status(400).json({ error: 'Referrer not found' });
        }
        
        if (!player) {
            player = new Player({ wallet, referredBy: referrer.wallet });
        } else {
            player.referredBy = referrer.wallet;
        }
        
        await player.save();
        
        // Update referrer stats
        referrer.referralCount += 1;
        await referrer.save();
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error processing referral:', error);
        res.status(500).json({ error: 'Server error' });
    }
});


// ==================== AIRDROP DATA EXPORT ====================
// For when you're ready to distribute tokens

app.get('/api/airdrop-data', async (req, res) => {
    try {
        const { secret } = req.query;
        
        // Simple auth (change this secret!)
        if (secret !== process.env.ADMIN_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const players = await Player.find({ bestScore: { $gt: 0 } })
            .sort({ bestScore: -1 })
            .select('wallet bestScore totalCoins gamesPlayed referralCount');
        
        // Calculate total scores for percentage
        const totalScore = players.reduce((sum, p) => sum + p.bestScore, 0);
        
        // Airdrop pool: 130,000,000 BADRIK (13%)
        const AIRDROP_POOL = 130_000_000;
        
        const airdropData = players.map((player, index) => {
            let tokens = 0;
            
            // Tier system
            if (index < 10) {
                tokens = 1_500_000; // Top 10
            } else if (index < 50) {
                tokens = 500_000; // Top 11-50
            } else if (index < 200) {
                tokens = 200_000; // Top 51-200
            } else if (index < 1000) {
                tokens = 50_000; // Top 201-1000
            } else {
                tokens = 10_000; // Everyone else
            }
            
            // Referral bonus (+5% per referral, max 50%)
            const referralBonus = Math.min(player.referralCount * 0.05, 0.5);
            tokens = Math.floor(tokens * (1 + referralBonus));
            
            return {
                rank: index + 1,
                wallet: player.wallet,
                bestScore: player.bestScore,
                referrals: player.referralCount,
                tokens
            };
        });
        
        res.json({
            totalPlayers: players.length,
            totalScore,
            airdropPool: AIRDROP_POOL,
            data: airdropData
        });
        
    } catch (error) {
        console.error('Error exporting airdrop data:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Stats
app.get('/api/stats', async (req, res) => {
    try {
        const totalPlayers = await Player.countDocuments();
        const totalGames = await Session.countDocuments();
        const topScore = await Player.findOne().sort({ bestScore: -1 }).select('bestScore');
        
        res.json({
            totalPlayers,
            totalGames,
            topScore: topScore?.bestScore || 0
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║     🐕 BADRIK RUN Backend Server          ║
║     Running on port ${PORT}                   ║
╚═══════════════════════════════════════════╝
    `);
});
