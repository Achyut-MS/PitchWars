// Realistic views for every screen. Used by the design tests (npm test) and by visual/visual.spec.mjs.
// Keep them in the shapes src/views.js produces.
import { PUZZLES } from '../../src/puzzles/index.js';
import { mulberry32 } from '../../src/puzzles/rng.js';

const me = (role, company = 'A') => ({ admissionId: 'S1', name: 'Asha Verma', status: 'in_game', company, role, gameId: 1 });
const problem = { id: 1, title: 'Food waste', statement: 'Homes, canteens and shops throw away huge amounts of good food every day.' };
const idea = { id: 'H1', type: 'hardware', name: 'Smart Fridge Sensor', description: 'A small sensor inside the fridge that tracks what is inside and how fresh it is.' };
const ideas = [
  { id: 'H1', type: 'hardware', name: 'Smart Fridge Sensor', description: 'A sensor that tracks freshness inside the fridge.', votes: 2, mine: true },
  { id: 'H2', type: 'hardware', name: 'Canteen Waste Scale', description: 'A bin scale that shows which dishes get wasted.', votes: 1, mine: false },
  { id: 'H3', type: 'hardware', name: 'Surplus Food Locker', description: 'A public locker for extra food, free to pick up.', votes: 0, mine: false },
  { id: 'S1', type: 'software', name: 'Expiry Reminder App', description: 'Scan groceries and get a warning before they expire.', votes: 1, mine: false },
  { id: 'S2', type: 'software', name: 'Leftover Recipe Finder', description: 'Suggests meals from what you already have.', votes: 1, mine: false },
  { id: 'S3', type: 'software', name: 'Food Share Network', description: 'Neighbours post surplus food and others claim it.', votes: 0, mine: false },
];
const item = (id, section, role, label, price, state, viewer, extra = {}) => ({
  id, name: label, label, option: '', section, role, cost: price, price: state === 'owned' ? null : price, state,
  note: state === 'wait' ? 'Ready again in 42 s' : '', canRequest: state === 'available' && viewer === role,
  canRecommend: state === 'available' && viewer === 'CEO', choices: null, ...extra,
});
const catalog = (viewer) => [
  item('F01-B', 'Core Features', 'CTO', 'Core Function (Basic)', 100, 'available', viewer),
  item('F02-B', 'Core Features', 'CTO', 'Connectivity (Basic)', 80, 'requested', viewer),
  item('F03-B', 'Core Features', 'CTO', 'User Interface (Basic)', 70, 'owned', viewer),
  item('HC02', 'Hardware Parts', 'CTO', 'Microcontroller Board', 120, 'available', viewer),
  item('M01-N', 'Target User', 'CMO', 'Target User (Small niche)', 50, 'available', viewer),
  item('M02', 'Brand', 'CMO', 'Brand name', 40, 'available', viewer, { choices: ['FreshSense', 'ChillWatch', 'KeepFresh'] }),
  item('M04-S', 'Ad Campaign', 'CMO', 'Ad Campaign (Social posts)', 80, 'wait', viewer),
  item('O01', 'Risk Fixes', 'COO', 'Fix: Sensor gives wrong freshness readings', 60, 'available', viewer),
  item('O06', 'Protection', 'COO', 'Attack Shield', 150, 'available', viewer),
];
const queue = [
  { id: 7, itemId: 'M01-N', label: 'Target User (Small niche)', price: 50, by: 'Mira', recommended: false, head: true },
  { id: 8, itemId: 'O01', label: 'Fix: Sensor gives wrong freshness readings', price: 60, by: 'Dev', recommended: true, head: false },
];
const owned = [{ itemId: 'F03-B', label: 'User Interface (Basic)', charged: 70 }, { itemId: 'M02', label: 'Brand name: FreshSense', charged: 40 }];
const base = (role, phase, remainingSec, over = {}) => ({ me: me(role), screen: 'game', clock: { phase, remainingSec }, problem, wallet: 1000, idea: null, ideation: null, shop: null, owned: [], summary: null, ...over });
const shop = (role, company = 'A', phase = 'shop', remainingSec = 300) => ({
  ...base(role, phase, remainingSec, { idea, wallet: 890, owned }), me: me(role, company),
  shop: {
    open: true, catalog: catalog(role),
    mine: role === 'CTO' ? [{ id: 2, itemId: 'F02-B', label: 'Connectivity (Basic)', status: 'awaiting_ceo' }] : [],
    ...(role === 'CFO' || role === 'CEO' ? { queue } : {}),
    ...(role === 'CEO' ? { awaitingCeo: [{ id: 2, itemId: 'F02-B', label: 'Connectivity (Basic)', price: 80, by: 'Asha', recommended: false, head: false }] } : {}),
  },
});
const comp = (over = {}) => ({ rates: { CTO: 6.5, CMO: 16.5, COO: 27, total: 50 }, notices: [], hint: null, shield: null, attack: null, ...over });
const ATTACKS = [{ key: 'price_squeeze', name: 'Price Squeeze', cost: 120 }, { key: 'bank_freeze', name: 'Bank Freeze', cost: 200 }, { key: 'market_crash', name: 'Market Crash', cost: 450 }];

const svgs = {
  companyVsCompany: '<svg id="a" role="img" aria-label="Company vs Company"></svg>',
  coinDifference: '<svg id="b" role="img" aria-label="Coin difference"></svg>',
  roleBars: '<svg id="c" role="img" aria-label="Coins by role"></svg>',
};

export const PLAYER = {
  lobby: { screen: 'lobby', me: { ...me('CTO'), status: 'lobby' } },
  'lobby-unseated': { screen: 'lobby', me: { ...me(null, null), status: 'lobby' } },
  'briefing-cto': base('CTO', 'briefing', 165),
  'briefing-b-ceo': { ...base('CEO', 'briefing', 165), me: me('CEO', 'B') },
  'ideation-cto': base('CTO', 'ideation', 92, { ideation: { ideas, picked: null, canPick: false } }),
  'ideation-ceo': base('CEO', 'ideation', 92, { ideation: { ideas, picked: null, canPick: true } }),
  'ideation-picked': base('CMO', 'ideation', 40, { ideation: { ideas, picked: 'H1', canPick: false } }),
  'shop-cto': shop('CTO'), 'shop-cmo': shop('CMO'), 'shop-coo': shop('COO'), 'shop-cfo': shop('CFO'), 'shop-ceo': shop('CEO'),
  'shop-b-cto': shop('CTO', 'B'),
  summary: base('CTO', 'summary', 14, { idea, wallet: 890, owned, summary: { idea, owned, wallet: 890 } }),
  'competition-cto': { ...shop('CTO', 'A', 'competition', 500), competition: comp({ hint: { text: 'Your product is behind: a better Core Function would help.' } }) },
  'competition-ceo': { ...shop('CEO', 'A', 'competition', 115), clock: { phase: 'competition', remainingSec: 115, warning: '2min' }, competition: comp({ notices: ['Stock market prices have fallen'], attack: { options: ATTACKS, cooldownLeftSec: 42, lockedReason: 'cooldown', launches: [] } }) },
  'competition-b-ceo': { ...shop('CEO', 'B', 'competition', 500), competition: comp({ attack: { options: ATTACKS, cooldownLeftSec: 0, lockedReason: null, launches: [] } }) },
  'competition-coo': { ...shop('COO', 'A', 'competition', 8), clock: { phase: 'competition', remainingSec: 8, warning: 'last10' }, competition: comp({ shield: { owned: true, used: false }, hint: { text: 'Your part of the sales is holding the company back.' } }) },
  'competition-cfo': { ...shop('CFO', 'A', 'competition', 500), competition: comp({ puzzle: null, puzzlesDone: { solved: 1, skipped: 0 } }) },
  'competition-cfo-puzzle': { ...shop('CFO', 'A', 'competition', 500), competition: comp({ puzzle: { id: 7, kind: 'queens', name: 'Queens', level: 2, reward: 20, puzzle: PUZZLES.queens.generate(2, mulberry32(7)), skipsFreeLeft: 2 }, puzzlesDone: { solved: 1, skipped: 0 } }) },
  ended: base('CTO', 'ended', 0),
  graphs: { screen: 'graphs', me: { ...me('CTO'), status: 'completed' }, gameId: 1 },
  'graphs-shown': { screen: 'graphs', me: { ...me('CTO'), status: 'completed' }, gameId: 1, graphs: svgs },
};

const ROLES5 = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
const NAMES = ['Aarav Sharma', 'Diya Nair', 'Rohan Mehta', 'Sneha Iyer', 'Karthik Rao', 'Ananya Gupta', 'Vivaan Singh', 'Ishita Verma', 'Aditya Kulkarni', 'Meera Reddy', 'Kabir Das', 'Zoya Khan'];
const people = (status) => NAMES.map((name, i) => ({
  admission_id: `DSA${String(i + 1).padStart(3, '0')}`, name, status: i < 10 ? status : 'lobby',
  company: i < 10 ? (i < 5 ? 'A' : 'B') : null, role: i < 10 ? ROLES5[i % 5] : null, game_id: i < 10 && status === 'in_game' ? 1 : null,
}));
const company = (wallet, ideaName) => ({ wallet, idea: ideaName ? { id: 'H1', name: ideaName } : null, pickSource: ideaName ? 'ceo' : null, votes: { H1: 3, S1: 2 }, owned, queue: [{ id: 7, label: 'Target User (Small niche)', price: 50, by: 'Mira' }], awaitingCeo: [] });
const game = (phase, remainingSec, over = {}) => ({ id: 3, problemId: 1, stuck: [], clock: { phase, remainingSec }, companies: { A: company(890, 'Smart Fridge Sensor'), B: company(760, 'Expiry Reminder App') }, attacks: [], eventUsed: null, injectionUsed: null, ...over });

export const ORGANIZER = {
  'org-lobby': { screen: 'organizer', problems: [{ id: 1, title: 'Food waste' }, { id: 2, title: 'Water shortage' }], participants: people('lobby'), game: null },
  'org-briefing': { screen: 'organizer', problems: [], participants: people('in_game'), game: game('briefing', 150) },
  'org-running': { screen: 'organizer', problems: [], participants: people('in_game'), game: game('shop', 245) },
  'org-competition': { screen: 'organizer', problems: [], participants: people('in_game'), game: game('competition', 400, {
    attacks: [{ id: 1, attacker: 'A', victim: 'B', name: 'Market Crash', cost: 450, at: 0, endsAt: 40000, blocked: false, by: 'S0' }], eventUsed: 'shop_sale' }) },
  'org-ended': { screen: 'organizer', problems: [], participants: people('in_game'), game: { ...game('ended', 0), ended: true, revealed: false, puzzles: { A: { solved: 0, skipped: 0, coins: 0 }, B: { solved: 0, skipped: 0, coins: 0 } } } },
};
