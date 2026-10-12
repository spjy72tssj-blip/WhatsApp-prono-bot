const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const http = require('http');
http.createServer((req,res)=>res.end('Apple Bot OK')).listen(process.env.PORT||10000);

let games = {}; // stocke les parties par numéro

function createGame() {
  return {
    level: 1,
    lives: 1,
    maxLevel: 5,
    columns: 5,
    trapsPerLevel: [1,2,2,3,3], // difficulté progressive
    multiplier: 1.0,
    board: [],
    active: true
  };
}

function getOdds(level, traps, cols) {
  const safe = cols - traps;
  return (safe / cols) * 100;
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const sock = makeWASocket({ auth: state, printQRInTerminal: false });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    if(u.qr) { console.log("SCANNE CE QR:"); qrcode.generate(u.qr,{small:true}); }
    if(u.connection==='open') console.log("WHATSAPP APPLE OF FORTUNE CONNECTE!");
    if(u.connection==='close' && u.lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut) startBot();
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if(!msg.message || msg.key.fromMe) return;
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim().toLowerCase();
    const jid = msg.key.remoteJid;
    if(!text) return;

    // COMMANDES
    if(text === 'menu' || text === 'bonjour' || text === 'start' || text === '/start') {
      await sock.sendMessage(jid, { text: `🍎 *APPLE OF FORTUNE - MODE ÉDUCATIF* 🍎
*100% virtuel, 0 argent réel*

C'est un jeu pour comprendre les probabilités.

Comment ça marche:
- 5 étages, 5 pommes par étage
- Chaque étage a des pommes pourries cachées 💀
- Plus tu montes, plus tu gagnes (en faux coins)

*Tape:*
👉 *jouer* pour commencer
👉 *proba* pour comprendre les maths
👉 *stop* pour encaisser

⚠️ Message éducatif: Sur 1000 parties, la maison gagne toujours à cause de l'avantage mathématique.` });
      return;
    }

    if(text === 'proba') {
      await sock.sendMessage(jid, { text: `📊 *LES MATHS DERRIÈRE APPLE OF FORTUNE*

Étage 1: 1 piège / 5 = 80% de survie
Étage 2: 2 pièges / 5 = 60% de survie
Étage 3: 2 pièges / 5 = 60%
Étage 4: 3 pièges / 5 = 40%
Étage 5: 3 pièges / 5 = 40%

Probabilité d'arriver en haut:
0.8 * 0.6 * 0.6 * 0.4 * 0.4 = *4.6%*

C'est pour ça que le multiplicateur x10 ne suffit pas. L'espérance est négative.

Leçon: Ne joue jamais pour gagner de l'argent, joue pour comprendre.` });
      return;
    }

    if(text === 'jouer' || text === 'play') {
      games[jid] = createGame();
      const g = games[jid];
      await sock.sendMessage(jid, { text: `🚀 *Partie lancée!* Étage ${g.level}/5

Choisis une pomme: tape *1, 2, 3, 4 ou 5*

💰 Multiplicateur actuel: x${g.multiplier.toFixed(2)}
🎯 Pièges à cet étage: ${g.trapsPerLevel[0]}
📈 Chance de survie: ${getOdds(1,g.trapsPerLevel[0],5).toFixed(0)}%

Tape *stop* à tout moment pour garder tes gains virtuels.` });
      return;
    }

    if(text === 'stop' && games[jid]?.active) {
      const g = games[jid];
      await sock.sendMessage(jid, { text: `✅ Tu as encaissé x${g.multiplier.toFixed(2)} en FAUX coins à l'étage ${g.level}!

Tu as évité le piège. C'est la seule façon de gagner sur le long terme: savoir s'arrêter.

Tape *jouer* pour rejouer.` });
      delete games[jid];
      return;
    }

    // CHOIX D'UNE POMME 1-5
    if(games[jid]?.active && ['1','2','3','4','5'].includes(text)) {
      const g = games[jid];
      const choice = parseInt(text) - 1;
      const traps = g.trapsPerLevel[g.level-1];
      // génère pièges aléatoires pour ce niveau
      let trapPos = [];
      while(trapPos.length < traps) {
        let r = Math.floor(Math.random()*5);
        if(!trapPos.includes(r)) trapPos.push(r);
      }

      if(trapPos.includes(choice)) {
        await sock.sendMessage(jid, { text: `💀 *BOOM!* Pomme pourrie à la position ${text}!

Tu as perdu au niveau ${g.level}.
Plateau: ${[0,1,2,3,4].map(i=>trapPos.includes(i)?'💀':'🍎').join(' ')}

Probabilité d'en arriver là: ${(0.8**(g.level-1)*100).toFixed(1)}% mais tu es tombé dedans.

Leçon: Même avec 80% de chance, 1 fois sur 5 tu perds tout.

Tape *jouer* pour recommencer, *proba* pour les maths.` });
        delete games[jid];
      } else {
        g.multiplier += 0.4 + (traps * 0.3);
        await sock.sendMessage(jid, { text: `🍎 *SAFE!* Tu as choisi ${text}, c'était une bonne pomme!

Plateau était: ${[0,1,2,3,4].map(i=>trapPos.includes(i)?'💀':'🍎').join(' ')}
Tu avais ${getOdds(g.level,traps,5).toFixed(0)}% de chance.

💰 Nouveau multiplicateur: x${g.multiplier.toFixed(2)}` });

        g.level++;
        if(g.level > g.maxLevel) {
          await sock.sendMessage(jid, { text: `🏆 *INCROYABLE!* Tu as atteint le sommet! x${g.multiplier.toFixed(2)}!

Probabilité d'y arriver: 4.6% seulement!
Tu fais partie des chanceux. Sur 100 parties, ça n'arrive que 4 fois.

Tape *jouer* pour rejouer.` });
          delete games[jid];
        } else {
          await sock.sendMessage(jid, { text: `➡️ *Étage ${g.level}/5* - Choisis 1-5
Prochain piège: ${g.trapsPerLevel[g.level-1]} pommes pourries
Chance: ${getOdds(g.level,g.trapsPerLevel[g.level-1],5).toFixed(0)}%
Multiplicateur si tu réussis: x${(g.multiplier+0.4+g.trapsPerLevel[g.level-1]*0.3).toFixed(2)}

Tape un chiffre ou *stop* pour encaisser.` });
        }
      }
      return;
    }
  });
}
startBot();
