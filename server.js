// TL Sales Contest 2025 — Production Server (Supabase + Express)
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_KEY env vars are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const ROW_ID = 1;
const TOTAL_ROUNDS = 12;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Zone roster ──
const ZONES = {
  north: {
    name: 'North',
    tls: [
      'Shubham Srivastava', 'Pooja Rani', 'Manav Upadhyay', 'Amrendra Kumar',
      'Rupesh Kumar Pathak', 'Ankit Singh', 'Anil Kumar', 'Divesh Singh',
      'Shalini Charles', 'Neeraj Kumar', 'Shalu Rani', 'Feroz Khan',
      'Bharat Arora', 'Manisha Pathak', 'Chandan Pratap', 'Anita Devi'
    ]
  },
  south: {
    name: 'South',
    tls: [
      'Theerthana Anandhan', 'Manu George', 'Anitha Bhavani', 'Dasari Shiva Raj',
      'R Chetan Kumar', 'Manoj Kumar S', 'Alexander K', 'P Deepika',
      'Metla Immu', 'Nidheesh Rajan', 'Gazala', 'Majji Sri Latha',
      'Dheeraj Chandran V', 'Kochi FHL'
    ]
  },
  vip: {
    name: 'VIP India & Intl',
    tls: [
      'Mohammed Tauseef', 'Suvarna Santosh Amale', 'Sarika Joshi', 'Chetan Guman Singh',
      'Wahid Akhtar', 'Amarjit Singh Aulakh', 'Gulam Mustafa', 'Faizan Khan',
      'Mohammed Adil Sayyed', 'Aditya Ankush Tarkar'
    ]
  },
  hvm: {
    name: 'HVM Thane',
    tls: [
      'Feroz Ahmed F Shaikh', 'Sandeep Dunde', 'Mehboob Salim Shaikh', 'Noor Mohammed Sayyed',
      'Revati Ramesh Illa', 'Tausif Khan', 'Rajesh Ramesh Sharma', 'Aaman Idrisi',
      'Arjun Nitin Gaikwad', 'Gauri Pandit Waskar', 'Samadhan Siddhanath Rasal', 'Sayyed Afzalali'
    ]
  },
  west: {
    name: 'West & East',
    tls: [
      'Tanu Patra', 'Roshan Chagan Sanap', 'Puja Pandey', 'Supratik Panjal',
      'Yash Purohit', 'Taukir Alam', 'Naisha Kelaskar', 'Mili Kukadiya',
      'Yogesh Yadav', 'Somnath Panigrahi', 'Nayana Mohanan Pillai', 'Venkatesh Yadav',
      'Anuj Ajay Amberkar', 'Sujoy Haldar'
    ]
  }
};

function freshZoneState(tls) {
  const oh = {};
  tls.forEach(t => oh[t] = []);
  return {
    tls: [...tls],
    currentRound: 1,
    totalRounds: TOTAL_ROUNDS,
    roundActive: false,
    pairings: {},
    pairRepeats: {},
    currentSpinner: null,
    opponentHistory: oh
  };
}

function createDefaultState() {
  const state = {};
  for (const [k, z] of Object.entries(ZONES)) state[k] = freshZoneState(z.tls);
  return state;
}

async function loadState() {
  const { data, error } = await supabase
    .from('tl_tournament').select('state').eq('id', ROW_ID).single();
  if (error || !data) {
    const fresh = createDefaultState();
    await supabase.from('tl_tournament').upsert({ id: ROW_ID, state: fresh, updated_at: new Date().toISOString() });
    return fresh;
  }
  return data.state;
}

async function saveState(state) {
  const { error } = await supabase.from('tl_tournament')
    .upsert({ id: ROW_ID, state, updated_at: new Date().toISOString() });
  if (error) console.error('saveState error:', error);
}

function pairedSet(z, round) {
  return new Set((z.pairings[round] || []).flat());
}

function isAdmin(req) { return req.body && req.body.password === ADMIN_PASSWORD; }

// ── API ──

app.get('/api/state', async (req, res) => {
  try { res.json(await loadState()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Anyone can pull the slot when round is active and no spinner is currently set
app.post('/api/pull-slot', async (req, res) => {
  try {
    const { zone } = req.body;
    if (!ZONES[zone]) return res.status(400).json({ error: 'Invalid zone' });

    const state = await loadState();
    const z = state[zone];
    if (!z.roundActive) return res.status(400).json({ error: 'Round not active' });
    if (z.currentSpinner) return res.status(409).json({ error: 'Spinner already selected', currentSpinner: z.currentSpinner });

    const round = z.currentRound;
    const paired = pairedSet(z, round);
    const remaining = z.tls.filter(t => !paired.has(t));
    if (remaining.length === 0) return res.status(400).json({ error: 'All TLs already paired' });

    const winner = remaining[Math.floor(Math.random() * remaining.length)];
    z.currentSpinner = winner;
    await saveState(state);
    res.json({ winner, pool: remaining });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Anyone can spin the wheel on behalf of the currentSpinner
app.post('/api/spin-wheel', async (req, res) => {
  try {
    const { zone, spinner } = req.body;
    if (!ZONES[zone]) return res.status(400).json({ error: 'Invalid zone' });

    const state = await loadState();
    const z = state[zone];
    if (!z.roundActive) return res.status(400).json({ error: 'Round not active' });
    if (z.currentSpinner !== spinner) return res.status(409).json({ error: 'Not your turn', currentSpinner: z.currentSpinner });

    const round = z.currentRound;
    if (!z.pairings[round]) z.pairings[round] = [];
    if (!z.pairRepeats[round]) z.pairRepeats[round] = [];

    const paired = pairedSet(z, round);
    let candidates = z.tls.filter(t => t !== spinner && !paired.has(t));
    if (candidates.length === 0) return res.status(400).json({ error: 'No candidates available' });

    const history = z.opponentHistory[spinner] || [];
    const unfaced = candidates.filter(c => !history.includes(c));
    let wheelCandidates, willBeRepeat = false;
    if (unfaced.length > 0) wheelCandidates = unfaced;
    else {
      const counts = candidates.map(c => ({ c, n: history.filter(h => h === c).length }));
      const minN = Math.min(...counts.map(x => x.n));
      wheelCandidates = counts.filter(x => x.n === minN).map(x => x.c);
      willBeRepeat = true;
    }

    const winner = wheelCandidates[Math.floor(Math.random() * wheelCandidates.length)];
    z.pairings[round].push([spinner, winner]);
    z.pairRepeats[round].push(willBeRepeat);
    if (!z.opponentHistory[spinner]) z.opponentHistory[spinner] = [];
    if (!z.opponentHistory[winner]) z.opponentHistory[winner] = [];
    z.opponentHistory[spinner].push(winner);
    z.opponentHistory[winner].push(spinner);
    z.currentSpinner = null;
    await saveState(state);

    res.json({ winner, candidates: wheelCandidates, willBeRepeat });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin ──

app.post('/api/admin/start-round', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Wrong password' });
  try {
    const { zone } = req.body;
    if (!ZONES[zone]) return res.status(400).json({ error: 'Invalid zone' });
    const state = await loadState();
    const z = state[zone];
    if (z.roundActive) return res.status(400).json({ error: 'Round already active' });
    z.roundActive = true;
    z.currentSpinner = null;
    if (!z.pairings[z.currentRound]) z.pairings[z.currentRound] = [];
    if (!z.pairRepeats[z.currentRound]) z.pairRepeats[z.currentRound] = [];
    await saveState(state);
    res.json({ success: true, round: z.currentRound });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/advance-round', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Wrong password' });
  try {
    const { zone } = req.body;
    if (!ZONES[zone]) return res.status(400).json({ error: 'Invalid zone' });
    const state = await loadState();
    const z = state[zone];
    if (z.currentRound >= z.totalRounds) return res.status(400).json({ error: 'Already at final round' });
    if (!z.roundActive) return res.status(400).json({ error: `Round ${z.currentRound} hasn't been started yet` });

    const round = z.currentRound;
    const paired = pairedSet(z, round);
    if (paired.size < z.tls.length) {
      const remaining = z.tls.length - paired.size;
      return res.status(400).json({ error: `Can't advance — ${remaining} TL${remaining === 1 ? '' : 's'} still unpaired in Round ${round}` });
    }

    z.currentRound++;
    z.roundActive = false;
    z.currentSpinner = null;
    await saveState(state);
    res.json({ success: true, round: z.currentRound });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/clear-spinner', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Wrong password' });
  try {
    const { zone } = req.body;
    if (!ZONES[zone]) return res.status(400).json({ error: 'Invalid zone' });
    const state = await loadState();
    state[zone].currentSpinner = null;
    await saveState(state);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/reset-zone', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Wrong password' });
  try {
    const { zone } = req.body;
    if (!ZONES[zone]) return res.status(400).json({ error: 'Invalid zone' });
    const state = await loadState();
    state[zone] = freshZoneState(ZONES[zone].tls);
    await saveState(state);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/reset-all', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Wrong password' });
  try {
    await saveState(createDefaultState());
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`TL Tournament listening on port ${PORT}`));
