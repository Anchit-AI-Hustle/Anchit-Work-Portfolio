/*
 * Sultan Bay: the story, the people in it, the radio, the shops and the save
 * file. Pure data and small helpers, no three.js: game3d.js imports it.
 *
 * Everything here is original: the city, its districts, every name, every
 * station and every line. Family friendly: nobody is hurt. Conflict is a car
 * chase, a getaway, a fist fight where the loser gets up and goes home, and a
 * very clever swap of some papers.
 */

/* ------------------------------------------------------------ the cast */
export const CAST = {
  kiran: { name: 'Kiran', col: '#FF6940' },
  zarina: { name: 'Auntie Zarina', col: '#FFB736' },
  pelican: { name: 'Marco "Pelican" Vale', col: '#38D6B8' },
  mo: { name: 'Mo', col: '#9b8cff' },
  nisha: { name: 'Nisha Vance', col: '#FF5EA8' },
  tarek: { name: 'Big Tarek', col: '#ff8a3d' },
  rao: { name: 'Inspector Leela Rao', col: '#6fa8ff' },
  crane: { name: 'Silas Crane', col: '#d8d2c4' },
  bina: { name: 'Coach Bina', col: '#7dff9b' },
};

/* ------------------------------------------------------------ the story
 * A mission is a list of steps the game runs in order. The step kinds:
 *   talk    a cut-scene line or three (letterbox, subtitles, the camera on the speaker)
 *   enter   get into any car (or the kind named)
 *   steal   get into the vehicle waiting at a place
 *   drive   reach a place in a vehicle (time is a limit in seconds, optional)
 *   goto    reach a place (on foot if foot is set)
 *   pickup  walk to a place and take what is there
 *   deliver reach a place in the vehicle you took for the job
 *   boat    reach a place on the water in a boat
 *   wait    hold still for t seconds
 *   heat    the police are called: the wanted level jumps to stars
 *   lose    get the wanted level back to zero
 *   tail    follow a car without being seen: not too close, not too far
 *   chase   ram a fleeing car until it stops
 *   escort  keep a friendly van safe on its way while a crew tries to ram it
 *   race    beat a rival through checkpoints
 *   brawl   a fist fight: knock the other one down three times
 *   stealth on foot, reach a spot without the guards seeing you
 *   hour    the clock jumps to an hour (a night job starts at night)
 */
export const MISSIONS = [
  {
    id: 'm1', title: 'Back in the Bay', giver: 'zarina', at: 'home', pay: 300,
    blurb: 'Auntie Zarina needs a lift, and she has news about Silas Crane.',
    intro: [['zarina', 'Kiran! Three years away and not one postcard. Get in the car, the bazaar does not wait.'], ['kiran', 'Good to see you too, Auntie.'], ['zarina', 'Drive me to Lantern Bazaar. Gently. My knees are older than that car.']],
    steps: [
      { k: 'enter', label: 'Get in the yellow hatchback' },
      { k: 'drive', at: 'bazaar', label: 'Drive Auntie Zarina to Lantern Bazaar', gentle: true },
      { k: 'talk', lines: [['zarina', 'Silas Crane wants my bazaar. He has a paper that says the whole lane is his.'], ['kiran', 'Papers can burn.'], ['zarina', 'No fires. Papers can be swapped. Fetch the ledger from my stall, on foot.']] },
      { k: 'pickup', at: 'stall', label: 'Walk to the stall and pick up the ledger' },
    ],
    outro: [['zarina', 'Good. Now we know which papers Crane forged. Come back tomorrow, we need wheels.']],
    unlock: 'Lantern Beats on the radio',
  },
  {
    id: 'm2', title: 'Wheels for the Job', giver: 'zarina', at: 'bazaar', pay: 600,
    blurb: 'Borrow the fastest car in the city from right under Crane\'s nose.',
    intro: [['zarina', 'Every job needs a fast car. Crane\'s people leave a Vesper GT at the tower plaza.'], ['kiran', 'And you want me to just drive it away?'], ['zarina', 'Borrow it. The alarm will shout, so lose the police and bring it to Torque Bros.']],
    steps: [
      { k: 'steal', at: 'plaza', type: 'super', label: 'Take the Vesper GT from the Crescent Towers plaza' },
      { k: 'heat', stars: 2 },
      { k: 'lose', label: 'The alarm went off: lose the police' },
      { k: 'deliver', at: 'garage', label: 'Bring the Vesper to the Torque Bros garage' },
    ],
    outro: [['mo', 'Nice car. I already changed the plates. Hi, I am Mo. I do computers and plates.']],
    unlock: 'The Vesper GT waits in your garage',
  },
  {
    id: 'm3', title: 'The Pelican', giver: 'pelican', at: 'port', pay: 700,
    blurb: 'An old smuggler, a speedboat and a crate under the red buoy.',
    intro: [['pelican', 'So Zarina sends me a driver. Can you drive a boat?'], ['kiran', 'How hard can it be?'], ['pelican', 'Ha. Take my Bay Runner to the red buoy, hook my crate, and bring it to the Corniche jetty.']],
    steps: [
      { k: 'steal', at: 'dock', type: 'boat', label: 'Get in the Bay Runner at the dock' },
      { k: 'boat', at: 'buoy', label: 'Head out to the red buoy', time: 120 },
      { k: 'boat', at: 'jetty', label: 'Bring the crate to the Corniche jetty' },
    ],
    outro: [['pelican', 'Inside the crate: Crane\'s old shipping papers. They prove the bazaar was never sold.']],
    unlock: 'Boats at the docks and the jetty',
  },
  {
    id: 'm4', title: 'Shadow the Courier', giver: 'mo', at: 'garage', pay: 800,
    blurb: 'Crane\'s courier van carries something every evening. Find out where.',
    intro: [['mo', 'Crane\'s courier leaves the warehouse every evening. I want to know where it goes.'], ['kiran', 'So I follow it.'], ['mo', 'Not too close, or the driver sees you. Not too far, or you lose it. The red bar tells you.']],
    steps: [
      { k: 'drive', at: 'warehouse', label: 'Drive to the warehouse at Anchor Port' },
      { k: 'tail', from: 'warehouse', to: 'towers', label: 'Tail the courier van. Not too close, not too far' },
    ],
    outro: [['mo', 'Crane Tower, the basement vault. Of course it is.']],
  },
  {
    id: 'm5', title: 'Dockside Rumble', giver: 'pelican', at: 'port', pay: 900,
    blurb: 'Crane\'s muscle wants a word. Fists only, and he goes home sore.',
    intro: [['pelican', 'Big Tarek has been asking who borrowed the boat. He wants a fist fight on the apron.'], ['kiran', 'Fists only?'], ['pelican', 'Fists only. Knock him down three times and he will go home and sulk.']],
    steps: [
      { k: 'goto', at: 'apron', foot: true, label: 'Walk out onto the dock apron' },
      { k: 'brawl', at: 'apron', foe: 'tarek', label: 'Knock Big Tarek down three times' },
    ],
    outro: [['tarek', 'Fine, fine. You win. Crane keeps the key card at Crescent Savings. I never said that.']],
  },
  {
    id: 'm6', title: 'Bank Holiday', giver: 'zarina', at: 'bazaar', pay: 1500,
    blurb: 'The crew lifts Crane\'s key card from his deposit box. You drive.',
    intro: [['zarina', 'Mo and Pelican will walk into Crescent Savings and walk out with Crane\'s key card.'], ['kiran', 'And the police?'], ['zarina', 'There will be police. That is why we have you. Roadblocks too, so be clever.']],
    steps: [
      { k: 'drive', at: 'bank', label: 'Drive the crew to Crescent Savings', time: 150 },
      { k: 'wait', t: 5, label: 'The crew is inside. Keep the engine running' },
      { k: 'heat', stars: 3 },
      { k: 'lose', label: 'Lose the police. Watch for roadblocks' },
      { k: 'drive', at: 'garage', label: 'Drop the crew at the Torque Bros garage' },
    ],
    outro: [['mo', 'Key card. Shiny. Next we need the forged deeds themselves.']],
    unlock: 'Crescent Savings sells the Tower suite',
  },
  {
    id: 'm7', title: 'Hill Climb', giver: 'nisha', at: 'hills', pay: 1200,
    blurb: 'The fastest driver in Cedar Hills has a spare key to the tower garage.',
    intro: [['nisha', 'You are the new driver everyone talks about? Race me through the hills.'], ['kiran', 'And if I win?'], ['nisha', 'Then you get my spare key to the tower garage. And my old bike.']],
    steps: [{ k: 'race', n: 7, label: 'Beat Nisha through the hills' }],
    outro: [['nisha', 'Fine. Key and bike. Do not scratch either.']],
    unlock: 'The Kestrel sport bike waits in your garage',
  },
  {
    id: 'm8', title: 'Float Guard', giver: 'zarina', at: 'bazaar', pay: 1600,
    blurb: 'The festival float must reach the Corniche, and Crane wants it in the sea.',
    intro: [['zarina', 'Our festival float carries the shipping papers to the Corniche, where the whole city can see them.'], ['kiran', 'Crane will try to stop it.'], ['zarina', 'He will send cars to ram it. Ram them first. Keep the float in one piece.']],
    steps: [{ k: 'escort', from: 'bazaar', to: 'parade', label: 'Keep the float safe all the way to the Corniche' }],
    outro: [['zarina', 'The whole city saw the papers. Crane is nervous now. Nervous men make mistakes.']],
  },
  {
    id: 'm9', title: 'The Forger', giver: 'mo', at: 'garage', pay: 1800,
    blurb: 'Crane\'s forger is leaving town with the master copies. Stop his car.',
    intro: [['mo', 'Crane\'s forger is driving out of town with the master copies of the deeds.'], ['kiran', 'So I catch him.'], ['mo', 'Ram his car until it stops. He will run off. Grab the briefcase.']],
    steps: [
      { k: 'chase', from: 'forger', time: 150, label: 'Ram the forger\'s car until it stops' },
      { k: 'pickup', at: 'dropped', label: 'Grab the briefcase from the car' },
    ],
    outro: [['mo', 'Master copies. Now we can make our own copy that tells the truth.']],
  },
  {
    id: 'm10', title: 'Night Swap', giver: 'zarina', at: 'towers', pay: 2200,
    blurb: 'Into Crane Tower at night to swap his forged deed for an honest one.',
    intro: [['zarina', 'Tonight you walk into Crane Tower, open the vault with the key card, and swap the deed.'], ['kiran', 'Guards?'], ['zarina', 'Four. They look, they turn, they look again. Stay out of their light.']],
    steps: [
      { k: 'hour', h: 22.5 },
      { k: 'goto', at: 'towers', foot: true, label: 'Go to Crane Tower on foot' },
      { k: 'stealth', at: 'vault', guards: 4, label: 'Reach the vault door unseen and swap the deed' },
      { k: 'goto', at: 'exit', foot: true, label: 'Walk out to the street', quiet: true },
    ],
    outro: [['mo', 'Swapped. Crane will not even notice until he reads it in court.']],
  },
  {
    id: 'm11', title: 'The Bay Charter', giver: 'zarina', at: 'bazaar', pay: 5000,
    blurb: 'The old city charter proves the bazaar belongs to the people. Take it to the lighthouse.',
    intro: [['zarina', 'The Bay Charter. The old paper that says the bazaar belongs to everyone. Crane locked it in his tower.'], ['kiran', 'And Inspector Rao?'], ['zarina', 'Rao is honest. Bring the charter to the lighthouse and she will read it. Every police car will be after you until then.']],
    steps: [
      { k: 'pickup', at: 'charter', label: 'Grab the charter from the tower lobby' },
      { k: 'heat', stars: 4 },
      { k: 'drive', at: 'dockside', label: 'Get to the dock. There is a helicopter now' },
      { k: 'steal', at: 'dock', type: 'boat', label: 'Get in the Bay Runner' },
      { k: 'boat', at: 'lighthouse', label: 'Run the boat to the lighthouse rock' },
    ],
    outro: [['rao', 'Kiran. I have been chasing you all week.'], ['kiran', 'Read it first, Inspector.'], ['rao', 'This charter is real. Silas Crane, you are under arrest for forgery. Kiran, go home before I change my mind.']],
    unlock: 'The Crescent Tower suite is yours',
  },
  {
    id: 'm12', title: 'Festival of Lanterns', giver: 'zarina', at: 'bazaar', pay: 1000,
    blurb: 'The bazaar is saved. Drive Auntie Zarina to the festival.',
    intro: [['zarina', 'One more lift, Kiran. The whole bazaar is at the Corniche tonight.'], ['kiran', 'Gently, I know.']],
    steps: [
      { k: 'hour', h: 19.2 },
      { k: 'enter', label: 'Get in a car' },
      { k: 'drive', at: 'parade', label: 'Drive Auntie Zarina to the festival on the Corniche', gentle: true },
    ],
    outro: [['zarina', 'Look at that sky. Welcome home, Kiran.']],
    unlock: 'The whole city, yours to roam',
    finale: true,
  },
];

/* Driving school: the same step engine teaching every move. */
export const LESSONS = [
  {
    id: 't1', title: 'Driving school', giver: 'bina', at: 'home', pay: 100,
    intro: [['bina', 'Welcome to Coach Bina\'s driving school. Every lesson takes a minute. Ready?']],
    steps: [
      { k: 'enter', label: 'Walk to a car and get in', hint: 'enter' },
      { k: 'drive', at: 'school1', label: 'Drive to the first marker', hint: 'drive' },
      { k: 'drive', at: 'school2', label: 'Now the second one. Brake into the corner', hint: 'brake' },
      { k: 'wait', t: 2, label: 'Stop and hold still for two seconds', hint: 'stop' },
      { k: 'heat', stars: 1, quiet: true },
      { k: 'lose', label: 'A patrol car is curious. Drive off and lose it', hint: 'lose' },
      { k: 'goto', at: 'school3', foot: true, label: 'Get out and walk to the marker', hint: 'foot' },
      { k: 'brawl', at: 'school3', foe: 'bina', label: 'Spar with Coach Bina: knock her down three times', hint: 'punch' },
    ],
    outro: [['bina', 'Not bad at all. The city is yours. Try the story next.']],
  },
];

/* ------------------------------------------------------------ the radio */
// Five stations with their own tempo, scale and voice, plus talk radio. The music is made live from a short
// pattern per station; the DJ lines scroll along the bottom of the screen.
export const STATIONS = [
  {
    id: 'bayfm', name: 'Bay FM 98.6', genre: 'Pop', host: 'Mira Monsoon', bpm: 112, root: 57, minor: false, lead: 'square', bass: 'triangle', prog: [0, 5, 3, 4], beat: 'four',
    lines: ['That was for everyone stuck on the Crescent flyover. We see you, we love you, honk twice.', 'Bay FM, where the songs are sunny even when the sky is not.', 'A caller says the bazaar mangoes are the best in years. I agree. I have eaten six.', 'Coming up: three songs about the sea and one about a scooter.', 'Traffic: smooth on the Corniche, slow by the docks, and a goat near Old Qila.'],
    rain: ['Rain on the bay! Windows up, wipers on, volume up.', 'Wet roads out there, friends. Brake early.'],
    chase: ['I am hearing sirens in the background of every phone call. Someone is having an exciting evening.', 'Police helicopter over the city tonight. Wave if you like.'],
  },
  {
    id: 'lantern', name: 'Lantern Beats 91.2', genre: 'Lo-fi', host: 'DJ Sooraj', bpm: 82, root: 50, minor: true, lead: 'sine', bass: 'sine', prog: [0, 3, 5, 4], beat: 'lazy', unlock: 'm1',
    lines: ['Lantern Beats. Slow songs for fast cities.', 'This one was recorded on a rooftop in the bazaar. You can hear the pigeons if you listen.', 'Breathe in. Breathe out. Indicate before you turn.', 'Big love to the chai stall on the corner of Lantern Lane.'],
    rain: ['Rain and lo-fi. Nature gets it.', 'Listen to that rain on the roof. Best drum kit in Sultan Bay.'],
    chase: ['Sirens again. Somebody take a deep breath for me.'],
  },
  {
    id: 'harbour', name: 'Harbour Swing 88.4', genre: 'Jazz', host: 'Uncle Felix', bpm: 126, root: 53, minor: false, lead: 'triangle', bass: 'triangle', prog: [1, 4, 0, 5], beat: 'swing', unlock: 'm3',
    lines: ['Harbour Swing, broadcasting from a boat that is definitely not sinking.', 'In my day we danced on the pier until the tide came in. Then we danced wetter.', 'Here is a tune my band played for the opening of the old lighthouse.', 'Uncle Felix here, reminding you that a trumpet is just a brave kettle.'],
    rain: ['Rain on the harbour. The fish do not mind, so neither do I.'],
    chase: ['Ah, the police siren. Never quite in tune.'],
  },
  {
    id: 'rock', name: 'Monsoon Rock 104', genre: 'Rock', host: 'Rocky Ray', bpm: 138, root: 52, minor: true, lead: 'sawtooth', bass: 'square', prog: [0, 6, 5, 6], beat: 'drive', unlock: 'm6',
    lines: ['MONSOON ROCK! Louder than the thunder, kinder than your neighbour.', 'This next one goes out to everybody doing ninety on the Crescent bypass. Slow down, legends.', 'Rocky Ray, broken guitar strings: four. Broken dreams: zero.', 'If your car does not have a radio, sing this one yourself.'],
    rain: ['THUNDER! The sky is playing drums with us tonight!'],
    chase: ['I hear the sirens, and I raise you a guitar solo.'],
  },
  {
    id: 'talk', name: 'Talk Sultan 1170', genre: 'Talk', host: 'Priya Prakash', bpm: 0, unlock: 'm8',
    lines: ['Caller one says the new tower blocks his view of the sea. Caller two says the sea blocks his view of the tower.', 'Today\'s question: who is the mysterious driver everyone keeps talking about? Lines are open.', 'A listener asks if the lighthouse still works. Inspector Rao says yes, and please stop calling her about it.', 'Coming up after the news: is the bazaar the heart of the city, or its stomach?', 'We asked Silas Crane for a comment. He said no comment. That is a comment.'],
    rain: ['Rain warning for the whole bay tonight. Our weather lady says: bring the washing in.'],
    chase: ['Reports of a police chase through the city. Stay safe out there, and stay off the pavement.'],
  },
];

/* ------------------------------------------------------------ shops, property, upgrades */
export const UPGRADES = [
  { id: 'eng', name: 'Engine tune', note: 'Faster top speed and pull', cost: [800, 1800, 3600] },
  { id: 'brk', name: 'Brakes', note: 'Stop shorter, turn in harder', cost: [500, 1200, 2400] },
  { id: 'arm', name: 'Armour plating', note: 'Takes knocks without breaking', cost: [700, 1600, 3200] },
  { id: 'tyr', name: 'Sport tyres', note: 'More grip, in the rain too', cost: [600, 1400, 2800] },
];
// Places to buy: every one pays into your wallet each morning, and a home is a place to save and respawn.
export const PROPERTIES = [
  { id: 'home', name: 'Corniche flat', kind: 'home', price: 0, income: 0, at: 'home', note: 'Where it all starts' },
  { id: 'loft', name: 'Bazaar loft', kind: 'home', price: 1500, income: 40, at: 'loft', note: 'Above the chai stall' },
  { id: 'shed', name: 'Anchor Port shed', kind: 'home', price: 1000, income: 30, at: 'shed', note: 'Smells of fish, very cheap' },
  { id: 'villa', name: 'Cedar Hills villa', kind: 'home', price: 6000, income: 150, at: 'villa', note: 'A pool and a view' },
  { id: 'suite', name: 'Crescent Tower suite', kind: 'home', price: 8000, income: 220, at: 'suite', note: 'The view Crane wanted', story: 'm6' },
  { id: 'taxi', name: 'Bay Runner Taxis', kind: 'business', price: 3000, income: 160, at: 'taxi', note: 'Fares pay a third more' },
  { id: 'wash', name: 'Sunset Car Wash', kind: 'business', price: 2500, income: 120, at: 'wash', note: 'A free respray, once a day' },
  { id: 'juice', name: 'Corniche Juice Bar', kind: 'business', price: 1800, income: 90, at: 'juice', note: 'Mango, lime, sugarcane' },
  { id: 'cinema', name: 'Old Qila Cinema', kind: 'business', price: 5000, income: 260, at: 'cinema', note: 'Late shows every night' },
];

/* ------------------------------------------------------------ how to play */
export const RULES_HTML = '<div class="sb-rules">' +
  '<div class="sb-h">The story</div><p>Silas Crane is buying up Lantern Bazaar with forged papers. Help Auntie Zarina and her crew take it back: twelve jobs of getaways, chases, a boat run, a fist fight, a heist and a night-time swap. A gold <b>S</b> marker on the map starts the next job. Every job opens with its own scene and pays when it is done; your progress saves itself.</p>' +
  '<div class="sb-h">Side jobs</div><p>Glowing markers around the city: <b>Courier</b> runs against the clock, <b>Fares</b> that tip for a smooth ride, <b>Street races</b> through checkpoints and <b>Getaways</b> from three stars. Chain jobs back to back for a bigger multiplier. There are also twelve <b>stunt ramps</b> to fly off and thirty <b>moon shells</b> hidden around the city.</p>' +
  '<div class="sb-h">Wanted</div><p>Crash, carjack or drive at people and the stars fill. One or two stars bring patrol cars, three bring <b>roadblocks</b>, four bring a <b>helicopter</b> with a searchlight, five bring everyone. To escape, break their sight and stay out of it until the stars fade, stay out of the searchlight, or drive into a <b>Spray and Shine</b> where nobody can see you. Caught, and you lose some cash and start again at a safehouse. Nobody is ever hurt: the police just want a word.</p>' +
  '<div class="sb-h">On foot</div><p>Walk, sprint, get into any car (taking one with a driver in it is carjacking, and the driver jumps out and runs off). Fists only: throw a punch, and anyone knocked down gets up and walks away grumbling. People dive out of the way of cars.</p>' +
  '<div class="sb-h">Money and property</div><p>Buy homes and businesses at the green <b>$</b> markers. Each pays into your wallet every morning; a home is somewhere to save and wake up. <b>Torque Bros</b> tunes the car you bring in and keeps it in your garage. Boats wait at the docks and the Corniche jetty.</p>' +
  '<div class="sb-h">The city</div><p>Sultan Bay turns from day to night every six minutes, and the weather changes: rain makes the roads shine and grip less. Change the radio station any time in a car. The map sets a waypoint where you tap or click.</p>' +
  '</div>';

/* ------------------------------------------------------------ the save file */
const KEY = 'sultan-bay.save.v1';
export function freshSave() {
  return {
    v: 1, cash: 200, story: 0, done: [], props: ['home'], garage: [{ type: 'hatch', col: '#e1a41a', up: {} }], shells: [], jumps: [], radio: 0,
    side: { courier: 0, fare: 0, race: 0, getaway: 0 }, stats: { busted: 0, jobs: 0, crashes: 0, earned: 0, playS: 0, escapes: 0 }, lessons: [], lastDay: -1, washDay: -1,
  };
}
export function loadSave() {
  const s = freshSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && o.v === 1) {
        Object.assign(s, o);
        s.side = Object.assign(freshSave().side, o.side || {});
        s.stats = Object.assign(freshSave().stats, o.stats || {});
        for (const k of ['done', 'props', 'garage', 'shells', 'jumps', 'lessons']) if (!Array.isArray(s[k])) s[k] = freshSave()[k];
      }
    }
  } catch (e) { /* a fresh start */ }
  return s;
}
export function writeSave(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode: play on */ } }
// Progress through everything the city offers, 0..100.
export function percentOf(s, nJumps, nShells) {
  const m = s.done.filter((id) => id[0] === 'm').length / MISSIONS.length;
  const j = s.jumps.length / Math.max(1, nJumps), sh = s.shells.length / Math.max(1, nShells);
  const p = (s.props.length - 1) / (PROPERTIES.length - 1);
  const sd = Math.min(1, (Math.min(10, s.side.courier) + Math.min(10, s.side.fare) + Math.min(5, s.side.race) + Math.min(5, s.side.getaway)) / 30);
  return Math.round((m * 0.5 + j * 0.12 + sh * 0.12 + p * 0.13 + sd * 0.13) * 100);
}
